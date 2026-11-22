const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');
const { putFile, files, makeReq, makeRes, goodState, net, freshIp } = require('./helpers');
const { encrypt, hashAccessKey } = require('../locker/crypto');
const run = require('../api/run');
const verify = require('../api/verify');
const kv = require('../api/_kv');

const SOURCE = 'print("identity")';
let n = 0;

function addScript(security) {
    const slug = `ident${++n}`;
    putFile(`locker/scripts/${slug}.json`, {
        v: 4, slug, payload: encrypt(SOURCE, slug), accessKeyHash: hashAccessKey('k', slug),
        enabled: true, expiresAt: null, updatedAt: '2026-01-01T00:00:00.000Z',
        security: { requireRuntime: true, requireExecutorId: true, ...security },
    });
    return slug;
}

async function go(slug, state, { runIp = freshIp(), verifyIp = runIp, runUa = 'Roblox/WinInet', verifyUa = runUa } = {}) {
    const r = makeRes();
    await run(makeReq({ query: { slug, key: 'k' }, headers: { 'x-forwarded-for': runIp, 'user-agent': runUa } }), r);
    assert.equal(r.statusCode, 200);
    const challenge = decodeURIComponent(String(r.body).match(/challenge=([^&"]+)/)[1]);
    const v = makeRes();
    await verify(makeReq({ query: { slug, challenge, state: JSON.stringify(state) }, headers: { 'x-forwarded-for': verifyIp, 'user-agent': verifyUa } }), v);
    return JSON.parse(v.body);
}

beforeEach(() => { net.users = 200; net.universe = 200; net.universeId = 123; net.bindingsDown = false; });

test('user lock: first user claims the key, second user is rejected, first still works', async () => {
    const slug = addScript({ bindMode: 'user', maxBindings: 1 });
    assert.equal((await go(slug, { ...goodState, userId: '111' })).result, 'ACCEPTED');
    const second = await go(slug, { ...goodState, userId: '222' });
    assert.equal(second.result, 'REJECTED');
    assert.match(second.reason, /identity-limit-reached/);
    assert.equal(second.payload, undefined);
    assert.equal((await go(slug, { ...goodState, userId: '111' })).result, 'ACCEPTED');
});

test('max identities is respected', async () => {
    const slug = addScript({ bindMode: 'user', maxBindings: 2 });
    for (const id of ['1', '2']) assert.equal((await go(slug, { ...goodState, userId: id })).result, 'ACCEPTED');
    assert.equal((await go(slug, { ...goodState, userId: '3' })).result, 'REJECTED');
});

test('both mode: same account on a new client id takes a new slot', async () => {
    const slug = addScript({ bindMode: 'both', maxBindings: 1 });
    assert.equal((await go(slug, { ...goodState, clientId: 'client-aaaaaaaa-0001' })).result, 'ACCEPTED');
    const other = await go(slug, { ...goodState, clientId: 'client-bbbbbbbb-0002' });
    assert.match(other.reason, /identity-limit-reached/);
});

test('raw client id is never written to the vault', async () => {
    const slug = addScript({ bindMode: 'client', maxBindings: 1 });
    await go(slug, goodState);
    const stored = files.get(`locker/bindings/${slug}.json`).text;
    assert.ok(!stored.includes(goodState.clientId));
});

test('client lock without a client id is rejected', async () => {
    const slug = addScript({ bindMode: 'client' });
    const out = await go(slug, { ...goodState, clientId: undefined });
    assert.match(out.reason, /client-id-missing/);
});

test('user allowlist and minimum account age', async () => {
    const a = addScript({ allowedUserIds: ['42'] });
    assert.equal((await go(a, { ...goodState, userId: '42' })).result, 'ACCEPTED');
    assert.match((await go(a, { ...goodState, userId: '43' })).reason, /user-not-allowed/);
    const b = addScript({ minAccountAgeDays: 30 });
    assert.equal((await go(b, { ...goodState, accountAgeDays: 31 })).result, 'ACCEPTED');
    assert.match((await go(b, { ...goodState, accountAgeDays: 3 })).reason, /account-too-new/);
    assert.match((await go(b, { ...goodState, accountAgeDays: undefined })).reason, /account-too-new/);
});

test('verify must come from the same network and HTTP client as run', async () => {
    const slug = addScript({});
    assert.equal((await go(slug, goodState, { runIp: '198.51.100.1', verifyIp: '198.51.100.2' })).reason, 'session-network-mismatch');
    assert.equal((await go(slug, goodState, { runUa: 'Roblox/WinInet', verifyUa: 'Roblox/Other' })).reason, 'session-client-mismatch');
});

test('roblox cross-checks reject impossible claims and fail open when roblox is down', async () => {
    const slug = addScript({});
    net.universeId = 999;
    assert.match((await go(slug, { ...goodState, userId: '77', placeId: '4560' })).reason, /place-universe-mismatch/);
    net.universeId = 123; net.users = 404;
    assert.match((await go(slug, { ...goodState, userId: '78', placeId: '4561' })).reason, /user-not-found/);
    net.users = 500; net.universe = 500;
    assert.equal((await go(slug, { ...goodState, userId: '79', placeId: '4562' })).result, 'ACCEPTED');
});

test('binding store outage fails closed', async () => {
    const slug = addScript({ bindMode: 'user' });
    net.bindingsDown = true;
    const out = await go(slug, { ...goodState, userId: '555' });
    assert.equal(out.result, 'REJECTED');
    assert.match(out.reason, /binding-store-unavailable/);
});

test('shared kv: single-use works through the REST store and falls back when it is down', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://kv.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';
    try {
        assert.ok(kv.enabled());
        assert.equal(await kv.once('t:1', 30), true);
        assert.equal(await kv.once('t:1', 30), false);
        net.kvDown = true;
        assert.equal(await kv.once('t:2', 30), true);
        assert.equal(await kv.once('t:2', 30), false);
    } finally {
        net.kvDown = false;
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;
    }
});

function telemetryProbe(env, script) {
    const r = spawnSync(process.execPath, ['-e', script], {
        cwd: path.join(__dirname, '..'), env: { ...process.env, ...env }, encoding: 'utf8',
    });
    return r.stdout.trim();
}

test('webhook: non-discord urls are refused, mentions and markdown are neutralised', () => {
    const base = `const sent=[];global.fetch=async(u,o)=>{sent.push({u,b:JSON.parse(o.body)});return{ok:true,status:204,headers:{get:()=>null}}};const t=require('./api/_telemetry');`;
    const bad = telemetryProbe({ DISCORD_WEBHOOK_URL: 'https://evil.example/api/webhooks/1/x' },
        base + `t.emit('bad-access-key',{ip:'1.1.1.1',slug:'s'}).then(r=>console.log(r+':'+sent.length));`);
    assert.equal(bad, 'false:0');

    const good = telemetryProbe({ DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/x', DISCORD_WEBHOOK_DEDUPE_MS: '0' },
        base + `t.emit('bad-access-key',{ip:'1.1.1.1',slug:'s',reason:'@everyone [click](http://x) \`code\`'}).then(r=>console.log(JSON.stringify({r,m:sent[0].b.allowed_mentions,f:JSON.stringify(sent[0].b.embeds[0].fields)})));`);
    const out = JSON.parse(good);
    assert.equal(out.r, true);
    assert.deepEqual(out.m, { parse: [] });
    assert.ok(!out.f.includes('@everyone'));
    assert.ok(!out.f.includes('[click]('));
});

test('webhook has no cap by default; the cap is opt-in', () => {
    const script = `let n=0;global.fetch=async(u)=>{if(String(u).includes('discord.com'))n++;return{ok:true,status:204,headers:{get:()=>null}}};const t=require('./api/_telemetry');
    (async()=>{for(let i=0;i<40;i++)await t.emit('bad-access-key',{ip:'8.8.8.'+i,slug:'s'+i});console.log(n)})();`;
    assert.equal(telemetryProbe({ DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/x', DISCORD_WEBHOOK_DEDUPE_MS: '0' }, script), '40');
});

test('webhook cap applies only when DISCORD_WEBHOOK_MAX_PER_MIN is set', () => {
    const script = `let n=0;global.fetch=async(u)=>{if(String(u).includes('discord.com'))n++;return{ok:true,status:204,headers:{get:()=>null}}};const t=require('./api/_telemetry');
    (async()=>{for(let i=0;i<6;i++)await t.emit('bad-access-key',{ip:'9.9.9.'+i,slug:'s'+i});console.log(n)})();`;
    assert.equal(telemetryProbe({ DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/x', DISCORD_WEBHOOK_MAX_PER_MIN: '3', DISCORD_WEBHOOK_DEDUPE_MS: '0' }, script), '3');
});
