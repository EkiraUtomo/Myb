const crypto = require('crypto');
const { validSession, sessionInfo, makeToken, adminSecretOk } = require('./_auth');
const { checkAdmin, checkLoginShared } = require('./_ratelimit');
const { getClientIp } = require('./_ip');
const { encrypt, decrypt, hashAccessKey, accessKeyOk } = require('../locker/crypto');
const sec = require('./_security');
const kv = require('./_kv');
const { sanitizeSettings, readSettings } = require('./_settings');
const { listScripts } = require('./_github');
const { getBanForIp } = require('./_security_store');
const { checkAndBind, resetBindings } = require('./_bindings');
const { webhookStatus, emit } = require('./_telemetry');

const REQUIRED = ['LOCKER_MASTER_SECRET', 'LOCKER_SESSION_SECRET', 'LOCKER_ADMIN_SECRET', 'LOCKER_GITHUB_OWNER', 'LOCKER_GITHUB_REPO', 'GITHUB_TOKEN'];
const DEBUG_SLUG = 'zzdebugselftest';

function enabled() {
    return String(process.env.LOCKER_DEBUG || '').toLowerCase() === 'on';
}

function hide(res) {
    return res.status(404).json({ error: 'not found' });
}

function maskIp(ip) {
    const s = String(ip || '');
    if (s.includes('.')) return s.split('.').slice(0, 3).join('.') + '.x';
    if (s.includes(':')) return s.split(':').slice(0, 3).join(':') + ':…';
    return 'unknown';
}

function varState(name) {
    const v = process.env[name] || '';
    if (!v) return 'missing';
    if (/_SECRET$/.test(name) && name !== 'LOCKER_ADMIN_SECRET' && v.length < 32) return 'too-short';
    if (name === 'LOCKER_ADMIN_SECRET' && v.length < 8) return 'too-short';
    return 'set';
}

function origin(req) {
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
    if (!/^[a-z0-9.-]+(:\d{1,5})?$/.test(host)) return '';
    const bare = host.replace(/:\d+$/, '');
    if (/^\d+(\.\d+){3}$/.test(bare) || (bare !== 'localhost' && !bare.includes('.'))) return '';
    const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim() === 'http' ? 'http' : 'https';
    return `${proto}://${host}`;
}

async function timedFetch(url, opts = {}, ms = 4000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try { return await fetch(url, { redirect: 'manual', ...opts, signal: ctrl.signal }); } finally { clearTimeout(timer); }
}

function ghHeaders() {
    return {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'ZumHub-Debug/1.0',
    };
}

class Suite {
    constructor() { this.results = []; }
    async run(group, name, fn) {
        const t0 = Date.now();
        let status = 'pass', detail = '';
        try {
            const out = await fn();
            if (out && typeof out === 'object') { status = out.status || 'pass'; detail = out.detail || ''; }
            else if (typeof out === 'string') detail = out;
        } catch (e) {
            status = 'fail';
            detail = String(e && e.message || e).replace(/Bearer\s+\S+/gi, 'Bearer ***').slice(0, 220);
        }
        this.results.push({ group, name, status, ms: Date.now() - t0, detail });
    }
    summary() {
        const c = { pass: 0, fail: 0, skip: 0, info: 0 };
        for (const r of this.results) c[r.status] = (c[r.status] || 0) + 1;
        return c;
    }
}

function ok(cond, msg) { if (!cond) throw new Error(msg); }

async function selfTest(req, opts) {
    const s = new Suite();
    const ip = '203.0.113.77', ua = 'zumhub-debug';

    await s.run('crypto', 'payload encrypt/decrypt round trip', () => {
        const src = `debug-${crypto.randomBytes(6).toString('hex')}`;
        const enc = encrypt(src, 'dbgslug');
        ok(decrypt(enc, 'dbgslug') === src, 'round trip mismatch');
        let bound = false;
        try { decrypt(enc, 'other'); } catch { bound = true; }
        ok(bound, 'payload decrypts under a different slug');
        return 'AES-GCM bound to slug';
    });

    await s.run('crypto', 'access key hashing', () => {
        const h = hashAccessKey('k-123', 'dbgslug');
        ok(accessKeyOk('k-123', 'dbgslug', h), 'correct key rejected');
        ok(!accessKeyOk('k-124', 'dbgslug', h), 'wrong key accepted');
        ok(!accessKeyOk('k-123', 'other', h), 'hash is not slug-bound');
        return 'slug-bound, wrong key and wrong slug rejected';
    });

    await s.run('sessions', 'admin token sign / tamper / csrf', () => {
        const tok = makeToken();
        ok(validSession({ method: 'GET', headers: { authorization: `Bearer ${tok}` } }), 'valid token rejected');
        ok(!validSession({ method: 'GET', headers: { authorization: `Bearer ${tok}x` } }), 'tampered token accepted');
        ok(!validSession({ method: 'POST', headers: { cookie: `zh_session=${tok}`, host: 'a.test' } }), 'cookie write without csrf accepted');
        ok(validSession({ method: 'POST', headers: { cookie: `zh_session=${tok}`, host: 'a.test', 'x-zh-csrf': '1' } }), 'cookie write with csrf rejected');
        ok(!validSession({ method: 'POST', headers: { cookie: `zh_session=${tok}`, host: 'a.test', 'x-zh-csrf': '1', origin: 'https://evil.test' } }), 'foreign origin accepted');
        ok(!adminSecretOk('\u0000'), 'secret compare weak');
        return 'bearer, cookie+csrf, origin and secret compare behave';
    });

    await s.run('verification', 'challenge sign / single-use / tamper', async () => {
        const base = { slug: 'dbgslug', accessKeyHash: 'x', version: 1, ip, ua };
        const tok = sec.makeChallenge(base);
        ok(sec.verifyChallenge(tok), 'fresh challenge invalid');
        ok(!sec.verifyChallenge(tok.slice(0, -2) + 'AA'), 'tampered challenge accepted');
        const first = await sec.consumeChallenge(tok, ip, ua);
        ok(first.ok, `first consume failed: ${first.reason}`);
        const second = await sec.consumeChallenge(tok, ip, ua);
        ok(!second.ok && second.reason === 'session-already-consumed', 'replay not rejected');
        return `single-use enforced via ${kv.enabled() ? 'shared KV' : 'instance memory'}`;
    });

    await s.run('verification', 'network and client binding', async () => {
        const ipBind = String(process.env.LOCKER_BIND_SESSION_IP || 'true').toLowerCase() !== 'false';
        const uaBind = String(process.env.LOCKER_BIND_SESSION_UA || 'true').toLowerCase() !== 'false';
        const a = sec.makeChallenge({ slug: 'dbgslug', accessKeyHash: 'x', version: 1, ip, ua });
        const r1 = await sec.consumeChallenge(a, '198.51.100.9', ua);
        const b = sec.makeChallenge({ slug: 'dbgslug', accessKeyHash: 'x', version: 1, ip, ua });
        const r2 = await sec.consumeChallenge(b, ip, 'different-client');
        if (ipBind) ok(!r1.ok && r1.reason === 'session-network-mismatch', 'IP binding not enforced');
        if (uaBind) ok(!r2.ok && r2.reason === 'session-client-mismatch', 'client binding not enforced');
        return `ip binding ${ipBind ? 'on' : 'off'}, client binding ${uaBind ? 'on' : 'off'}`;
    });

    await s.run('policy', 'identity and game policy matrix', () => {
        const policy = sec.normaliseSecurity({ gameIds: ['10'], placeIds: ['20'], allowedUserIds: ['5'], minAccountAgeDays: 30, bindMode: 'client' });
        const good = sec.normaliseSignals({ userId: '5', gameId: '10', placeId: '20', accountAgeDays: 90, clientId: 'abcdefgh-1234',
            runtime: { gameType: 'Instance', workspaceType: 'Instance', gameLoaded: true, runServiceRunning: true, localPlayer: true, httpGet: true },
            executor: { primary: 'X', secondary: 'X', match: true } });
        ok(sec.firstFailures(policy, good).length === 0, `good signals failed: ${sec.firstFailures(policy, good)}`);
        const cases = [
            [{ ...good, gameId: '11' }, 'game-id'], [{ ...good, placeId: '21' }, 'place-id'],
            [{ ...good, userId: '6' }, 'user-not-allowed'], [{ ...good, accountAgeDays: 2 }, 'account-too-new'],
            [{ ...good, clientId: '' }, 'client-id-missing'], [{ ...good, accountAgeDays: null }, 'account-too-new'],
        ];
        for (const [sig, code] of cases) ok(sec.firstFailures(policy, sig).includes(code), `${code} not raised`);
        return `${cases.length + 1} cases`;
    });

    await s.run('settings', 'sanitizer blocks hostile input', () => {
        const out = sanitizeSettings({ hero: { name: '<script>x</script>', extraButtons: [{ label: 'a', url: 'javascript:alert(1)' }] }, banner: { link: 'data:text/html,x' }, theme: { accentColor: 'red' } });
        ok(out.hero.extraButtons.length === 0, 'javascript: url survived');
        ok(out.banner.link === '', 'data: url survived');
        ok(/^#[0-9a-f]{6}$/i.test(out.theme.accentColor), 'bad colour survived');
        return 'urls, colours and lists filtered';
    });

    await s.run('storage', 'GitHub vault read + rate limit', async () => {
        const t0 = Date.now();
        const list = await listScripts();
        const r = await timedFetch('https://api.github.com/rate_limit', { headers: ghHeaders() });
        const j = r.ok ? await r.json() : null;
        const core = j && j.resources && j.resources.core;
        return { status: 'pass', detail: `${list.length} script file(s), ${Date.now() - t0}ms${core ? `, API quota ${core.remaining}/${core.limit}` : ''}` };
    });

    await s.run('storage', 'site settings load', async () => {
        const { settings, sha, degraded } = await readSettings({ force: true });
        ok(settings && settings.hero, 'settings malformed');
        return { status: degraded ? 'fail' : 'pass', detail: sha ? 'settings.json present' : 'no settings.json yet, defaults in use' };
    });

    await s.run('storage', 'ban list readable', async () => {
        await getBanForIp('203.0.113.1');
        return 'readBans ok';
    });

    await s.run('shared state', 'Redis / KV', async () => {
        if (!kv.enabled()) return { status: 'skip', detail: 'not configured, per-instance fallback in use' };
        const key = `dbg:${crypto.randomBytes(6).toString('hex')}`;
        ok((await kv.once(key, 20)) === true, 'first SET NX failed');
        ok((await kv.once(key, 20)) === false, 'second SET NX succeeded');
        return 'SET NX round trip ok';
    });

    await s.run('roblox', 'users API reachable', async () => {
        const r = await timedFetch('https://users.roblox.com/v1/users/1');
        return { status: r.status === 200 ? 'pass' : 'info', detail: `HTTP ${r.status}` };
    });

    await s.run('roblox', 'place to universe endpoint', async () => {
        const r = await timedFetch('https://apis.roblox.com/universes/v1/places/1818/universe');
        let shape = '';
        if (r.status === 200) { const j = await r.json().catch(() => null); shape = j && j.universeId != null ? ', universeId present' : ', universeId MISSING'; }
        return { status: r.status === 200 && shape.includes('present') ? 'pass' : 'info', detail: `HTTP ${r.status}${shape}` };
    });

    const wh = webhookStatus();
    await s.run('webhook', 'configuration', () => {
        if (!wh.raw) return { status: 'skip', detail: 'DISCORD_WEBHOOK_URL not set' };
        ok(wh.configured, 'URL is set but not a discord.com webhook, telemetry disabled');
        return `valid host${wh.capPerMin ? `, cap ${wh.capPerMin}/min` : ', no cap'}${wh.backoffMs ? `, backing off ${Math.round(wh.backoffMs / 1000)}s` : ''}`;
    });

    if (opts.webhookPing) {
        await s.run('webhook', 'live test post', async () => {
            if (!wh.configured) return { status: 'skip', detail: 'webhook not configured' };
            const sent = await emit('debug-ping', { ip: getClientIp(req), slug: 'debug', reqId: crypto.randomBytes(4).toString('hex'), description: 'Admin self-test ping. Not a real event.' });
            return { status: sent ? 'pass' : 'fail', detail: sent ? 'delivered' : 'not delivered (dedupe, backoff or Discord error)' };
        });
    }

    const base = origin(req);
    await s.run('live', 'security headers on /home and /admin', async () => {
        if (!base) return { status: 'skip', detail: 'host not resolvable for a self-request' };
        const out = [];
        for (const p of ['/home', '/admin']) {
            const r = await timedFetch(base + p);
            if (r.status !== 200) { out.push(`${p} HTTP ${r.status}`); continue; }
            const miss = ['content-security-policy', 'x-content-type-options', 'strict-transport-security'].filter(h => !r.headers.get(h));
            ok(!miss.length, `${p} missing ${miss.join(', ')}`);
            out.push(`${p} ok`);
        }
        return { status: out.some(x => x.includes('HTTP')) ? 'info' : 'pass', detail: out.join('; ') };
    });

    await s.run('live', 'anonymous requests are refused', async () => {
        if (!base) return { status: 'skip', detail: 'host not resolvable for a self-request' };
        const dbg = await timedFetch(`${base}/api/debug`);
        const adm = await timedFetch(`${base}/api/admin`);
        const set = await timedFetch(`${base}/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        ok(dbg.status === 404, `/api/debug answered ${dbg.status} to anonymous`);
        ok(adm.status === 401 || adm.status === 429, `/api/admin answered ${adm.status} to anonymous`);
        ok(set.status === 401 || set.status === 429, `/api/settings POST answered ${set.status} to anonymous`);
        return `debug ${dbg.status}, admin ${adm.status}, settings ${set.status}`;
    });

    if (opts.deep) {
        await s.run('deep', 'vault write and delete', async () => {
            const o = process.env.LOCKER_GITHUB_OWNER, r = process.env.LOCKER_GITHUB_REPO, b = process.env.LOCKER_GITHUB_BRANCH || 'main';
            const url = `https://api.github.com/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/contents/locker/debug/selftest.json`;
            const put = await timedFetch(url, { method: 'PUT', headers: ghHeaders(), body: JSON.stringify({ message: 'locker: debug self-test', content: Buffer.from('{"debug":true}\n').toString('base64'), branch: b }) });
            ok(put.ok, `write failed (${put.status}); token may lack contents:write`);
            const j = await put.json();
            const del = await timedFetch(url, { method: 'DELETE', headers: ghHeaders(), body: JSON.stringify({ message: 'locker: debug self-test cleanup', sha: j.content.sha, branch: b }) });
            ok(del.ok, `cleanup failed (${del.status})`);
            return 'write + delete ok';
        });

        await s.run('deep', 'key identity lock logic on the real store', async () => {
            await resetBindings(DEBUG_SLUG).catch(() => {});
            const a = await checkAndBind({ slug: DEBUG_SLUG, mode: 'user', max: 1, userId: '1001', clientId: '' });
            const b = await checkAndBind({ slug: DEBUG_SLUG, mode: 'user', max: 1, userId: '1002', clientId: '' });
            const a2 = await checkAndBind({ slug: DEBUG_SLUG, mode: 'user', max: 1, userId: '1001', clientId: '' });
            await resetBindings(DEBUG_SLUG).catch(() => {});
            ok(a.ok && a.created, 'first identity not bound');
            ok(!b.ok && b.reason === 'identity-limit-reached', 'second identity not rejected');
            ok(a2.ok && !a2.created, 'first identity not recognised again');
            return 'claim, reject, recognise';
        });
    }

    return { results: s.results, summary: s.summary() };
}

function report(req) {
    const info = sessionInfo(req);
    return {
        generatedAt: new Date().toISOString(),
        session: info,
        request: {
            ip: maskIp(getClientIp(req)),
            userAgent: String(req.headers['user-agent'] || '').slice(0, 160),
            proto: String(req.headers['x-forwarded-proto'] || '').split(',')[0] || 'unknown',
            host: String(req.headers['x-forwarded-host'] || req.headers.host || '').slice(0, 120),
            region: process.env.VERCEL_REGION || null,
        },
        runtime: {
            node: process.version,
            platform: process.platform,
            uptimeSec: Math.round(process.uptime()),
            memoryMB: Math.round(process.memoryUsage().rss / 1048576),
            vercelEnv: process.env.VERCEL_ENV || null,
            commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
            deployment: process.env.VERCEL_URL || null,
        },
        env: {
            required: Object.fromEntries(REQUIRED.map(n => [n, varState(n)])),
            optional: Object.fromEntries(['DISCORD_WEBHOOK_URL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'PUBLIC_BASE_URL'].map(n => [n, varState(n)])),
        },
        features: {
            bindSessionIp: String(process.env.LOCKER_BIND_SESSION_IP || 'true').toLowerCase() !== 'false',
            bindSessionUa: String(process.env.LOCKER_BIND_SESSION_UA || 'true').toLowerCase() !== 'false',
            robloxCrosscheck: String(process.env.VERIFY_ROBLOX_CROSSCHECK || 'on').toLowerCase() !== 'off',
            sharedState: kv.enabled(),
            settingsCacheMs: Number(process.env.SETTINGS_CACHE_MS || 30000),
            webhook: webhookStatus(),
            showRawIpInWebhook: String(process.env.DISCORD_SHOW_RAW_IP || 'true').toLowerCase() === 'true',
        },
        limits: { run: '10 / min / IP', verify: '30 / min / IP', login: '5 / 15 min / IP', challengeTtlSec: Math.round(sec.CHALLENGE_TTL_MS / 1000), sessionHours: 8 },
    };
}

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');

    if (!enabled()) return hide(res);
    if (req.method !== 'GET' && req.method !== 'POST') return hide(res);
    if (!validSession(req)) return hide(res);

    const rl = checkAdmin(req);
    if (!rl.allowed) { res.setHeader('Retry-After', String(rl.resetIn)); return res.status(429).json({ error: 'too many requests' }); }

    if (req.method === 'GET') return res.status(200).json({ ok: true, report: report(req) });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const gate = await checkLoginShared(req);
    if (!gate.allowed) { res.setHeader('Retry-After', String(gate.resetIn)); return res.status(429).json({ error: 'too many attempts' }); }
    if (!adminSecretOk(body.secret)) {
        await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
        return res.status(403).json({ error: 'Admin secret required to run the self-test.' });
    }

    try {
        const out = await selfTest(req, { deep: body.deep === true, webhookPing: body.webhookPing === true });
        return res.status(200).json({ ok: out.summary.fail === 0, ...out, report: report(req) });
    } catch (e) {
        console.error('[debug]', String(e && e.message || e).slice(0, 200));
        return res.status(500).json({ error: 'Self-test crashed.' });
    }
};
