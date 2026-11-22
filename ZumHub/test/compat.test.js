const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { putFile, makeReq, makeRes, goodState, freshIp } = require('./helpers');

const { encrypt, decrypt, hashAccessKey, accessKeyOk, safeSlug } = require('../locker/crypto');
const run = require('../api/run');
const verify = require('../api/verify');

const SOURCE = 'print("hello from an old script")';

function legacyEncrypt(plain) {
    const master = crypto.createHmac('sha256', 'zumhub-v2-master').update(process.env.LOCKER_MASTER_SECRET).digest();
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', master, iv);
    const ct = Buffer.concat([c.update(Buffer.from(plain, 'utf8')), c.final()]);
    const b = x => Buffer.from(x).toString('base64url');
    return `${b(iv)}.${b(c.getAuthTag())}.${b(ct)}`;
}

putFile('locker/scripts/oldscript.json', {
    v: 3,
    slug: 'oldscript',
    payload: legacyEncrypt(SOURCE),
    accessKeyHash: crypto.createHash('sha256').update('legacy-key').digest('hex'),
    enabled: true,
    expiresAt: null,
    description: '',
    updatedAt: '2025-01-01T00:00:00.000Z',
});

putFile('locker/scripts/newscript.json', {
    v: 4,
    slug: 'newscript',
    payload: encrypt(SOURCE, 'newscript'),
    accessKeyHash: hashAccessKey('bound-key', 'newscript'),
    enabled: true,
    expiresAt: null,
    description: '',
    security: { v: 1, requireRuntime: true, requireExecutorId: true, gameIds: ['123'], placeIds: [], allowedExecutors: ['wave'], requiredCapabilities: [] },
    updatedAt: '2026-01-01T00:00:00.000Z',
});

putFile('locker/scripts/MixedCase.json', {
    v: 4,
    slug: 'MixedCase',
    payload: encrypt(SOURCE, 'MixedCase'),
    accessKeyHash: hashAccessKey('mixed-key', 'MixedCase'),
    enabled: true,
    expiresAt: null,
    description: '',
    updatedAt: '2026-01-02T00:00:00.000Z',
});

async function runLoader(slug, key, ip = freshIp()) {
    const res = makeRes();
    await run(makeReq({ query: { slug, key }, headers: { 'x-forwarded-for': ip } }), res);
    return res;
}

function challengeFrom(bootstrap) {
    const m = String(bootstrap).match(/challenge=([^&"]+)/);
    assert.ok(m, 'bootstrap carries a challenge');
    return decodeURIComponent(m[1]);
}

async function fullRun(slug, key, state = goodState) {
    const ip = freshIp();
    const r = await runLoader(slug, key, ip);
    assert.equal(r.statusCode, 200, `run should accept ${slug}`);
    const challenge = challengeFrom(r.body);
    const res = makeRes();
    await verify(makeReq({ query: { slug, challenge, state: JSON.stringify(state), rid: 'abc123def456' }, headers: { 'x-forwarded-for': ip } }), res);
    return JSON.parse(res.body);
}

test('slug rules are unchanged', () => {
    for (const ok of ['ab', 'my-script', 'Script_01', 'a'.repeat(64)]) assert.ok(safeSlug(ok), ok);
    for (const bad of ['a', '-ab', '../x', 'a b', 'a'.repeat(65), '']) assert.ok(!safeSlug(bad), bad);
});

test('legacy payload without AAD still decrypts', () => {
    assert.equal(decrypt(legacyEncrypt(SOURCE), 'oldscript'), SOURCE);
});

test('legacy unbound and new slug-bound keys both validate', () => {
    const legacyHash = crypto.createHash('sha256').update('legacy-key').digest('hex');
    assert.ok(accessKeyOk('legacy-key', 'oldscript', legacyHash));
    assert.ok(accessKeyOk('bound-key', 'newscript', hashAccessKey('bound-key', 'newscript')));
    assert.ok(!accessKeyOk('bound-key', 'other', hashAccessKey('bound-key', 'newscript')));
    assert.ok(!accessKeyOk('nope', 'oldscript', legacyHash));
});

test('old loader URL (legacy script) runs end to end', async () => {
    const out = await fullRun('oldscript', 'legacy-key');
    assert.equal(out.result, 'ACCEPTED');
    assert.equal(out.payload, SOURCE);
});

test('new-format script runs end to end with its security policy', async () => {
    const out = await fullRun('newscript', 'bound-key');
    assert.equal(out.result, 'ACCEPTED');
    assert.equal(out.payload, SOURCE);
});

test('policy still rejects a wrong game id', async () => {
    const out = await fullRun('newscript', 'bound-key', { ...goodState, gameId: '999' });
    assert.equal(out.result, 'REJECTED');
    assert.match(out.reason, /game-id/);
    assert.equal(out.payload, undefined);
});

test('loader key with .ts suffix keeps working and expires after 30 days', async () => {
    const fresh = Math.floor(Date.now() / 1000);
    const ok = await runLoader('oldscript', `legacy-key.ts${fresh}`);
    assert.equal(ok.statusCode, 200);
    const old = Math.floor(Date.now() / 1000) - 31 * 24 * 3600;
    const expired = await runLoader('oldscript', `legacy-key.ts${old}`);
    assert.equal(expired.statusCode, 410);
});

test('slug in the URL is case-insensitive for lowercase scripts', async () => {
    const out = await fullRun('OldScript', 'legacy-key');
    assert.equal(out.result, 'ACCEPTED');
});

test('script stored with a mixed-case slug now resolves and decrypts', async () => {
    const out = await fullRun('MixedCase', 'mixed-key');
    assert.equal(out.result, 'ACCEPTED');
    assert.equal(out.payload, SOURCE);
});

test('wrong key, unknown slug and bad slug all look like not found', async () => {
    assert.equal((await runLoader('oldscript', 'wrong')).statusCode, 404);
    assert.equal((await runLoader('ghostscript', 'x')).statusCode, 404);
    assert.equal((await runLoader('../etc', 'x')).statusCode, 404);
});

test('a challenge is single use', async () => {
    const ip = freshIp();
    const r = await runLoader('oldscript', 'legacy-key', ip);
    const challenge = challengeFrom(r.body);
    const call = async () => {
        const res = makeRes();
        await verify(makeReq({ query: { slug: 'oldscript', challenge, state: JSON.stringify(goodState) }, headers: { 'x-forwarded-for': ip } }), res);
        return JSON.parse(res.body);
    };
    assert.equal((await call()).result, 'ACCEPTED');
    assert.equal((await call()).reason, 'session-already-consumed');
});

test('browser and tool clients are still blocked from run', async () => {
    const res = makeRes();
    await run(makeReq({ query: { slug: 'oldscript', key: 'legacy-key' }, headers: { 'user-agent': 'curl/8.0' } }), res);
    assert.equal(res.statusCode, 403);
    const res2 = makeRes();
    await run(makeReq({ query: { slug: 'oldscript', key: 'legacy-key' }, headers: { 'sec-fetch-mode': 'navigate' } }), res2);
    assert.equal(res2.statusCode, 403);
});

test('every original route in vercel.json is still present', () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
    const orig = [
        ['/l/index.html', '/api/forbidden'], ['/l', '/api/forbidden'], ['/l/(.*)', '/api/forbidden'],
        ['/home', '/home/index.html'], ['/admin', '/admin/index.html'], ['/admin/', '/admin/index.html'], ['/', '/index.html'],
    ];
    for (const [src, dest] of orig) {
        assert.ok(cfg.rewrites.some(r => r.source === src && r.destination === dest), `${src} -> ${dest}`);
    }
});

test('site entry files that old links hit still exist', () => {
    const root = path.join(__dirname, '..');
    for (const f of ['index.html', '404.html', 'home/index.html', 'admin/index.html', 'l/index.html', 'assets/ava.png']) {
        assert.ok(fs.existsSync(path.join(root, f)), f);
    }
});
