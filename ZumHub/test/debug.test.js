const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeReq, makeRes } = require('./helpers');
const auth = require('../api/_auth');
const debug = require('../api/debug');

const SECRETS = ['m'.repeat(40), 's'.repeat(40), 'correct-horse-battery', 'test-token'];
const ADMIN = 'correct-horse-battery';

function call({ method = 'GET', body, session = true, ip } = {}) {
    const headers = { host: 'zumhub', 'x-zh-csrf': '1' };
    if (session) headers.authorization = `Bearer ${auth.makeToken()}`;
    if (ip) headers['x-forwarded-for'] = ip;
    const res = makeRes();
    return debug(makeReq({ method, body, headers }), res).then(() => res);
}

beforeEach(() => { process.env.LOCKER_DEBUG = 'on'; });

test('debug is invisible when LOCKER_DEBUG is not on, even for a valid admin', async () => {
    delete process.env.LOCKER_DEBUG;
    assert.equal((await call()).statusCode, 404);
    assert.equal((await call({ method: 'POST', body: { secret: ADMIN } })).statusCode, 404);
});

test('debug is invisible without an admin session', async () => {
    assert.equal((await call({ session: false })).statusCode, 404);
    assert.equal((await call({ session: false, method: 'POST', body: { secret: ADMIN } })).statusCode, 404);
});

test('report works for admins and never contains secret values', async () => {
    const res = await call();
    assert.equal(res.statusCode, 200);
    for (const secret of SECRETS) assert.ok(!res.body.includes(secret), 'report leaked a secret');
    const d = JSON.parse(res.body);
    assert.equal(d.report.env.required.GITHUB_TOKEN, 'set');
    assert.equal(d.report.session.via, 'bearer');
    assert.match(d.report.request.ip, /\.x$/);
});

test('self-test needs the admin secret again', async () => {
    assert.equal((await call({ method: 'POST', body: {} })).statusCode, 403);
    assert.equal((await call({ method: 'POST', body: { secret: 'wrong-secret-value' } })).statusCode, 403);
});

test('self-test runs and passes on a healthy config, without leaking secrets', async () => {
    const res = await call({ method: 'POST', body: { secret: ADMIN } });
    assert.equal(res.statusCode, 200);
    for (const secret of SECRETS) assert.ok(!res.body.includes(secret), 'self-test leaked a secret');
    const d = JSON.parse(res.body);
    const failed = d.results.filter(r => r.status === 'fail').map(r => `${r.name}: ${r.detail}`);
    assert.deepEqual(failed, []);
    assert.ok(d.summary.pass >= 10, `only ${d.summary.pass} passed`);
});

test('deep checks exercise the vault write and the identity lock', async () => {
    const res = await call({ method: 'POST', body: { secret: ADMIN, deep: true } });
    const d = JSON.parse(res.body);
    const deep = d.results.filter(r => r.group === 'deep');
    assert.equal(deep.length, 2);
    assert.deepEqual(deep.filter(r => r.status !== 'pass'), []);
});

test('repeated wrong secrets are rate limited', async () => {
    const ip = '203.0.113.200';
    const codes = [];
    for (let i = 0; i < 7; i++) codes.push((await call({ method: 'POST', body: { secret: 'nope-nope-nope' }, ip })).statusCode);
    assert.equal(codes[0], 403);
    assert.equal(codes[codes.length - 1], 429);
});
