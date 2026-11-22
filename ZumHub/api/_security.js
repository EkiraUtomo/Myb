const crypto = require('crypto');

// Short-lived, signed execution capabilities. The capability is intentionally
// useless by itself after its TTL and is consumed on the first verification.
const BLOCKED_UA = [
    'python-requests','python-urllib','curl/','wget/','axios/',
    'go-http-client','java/','ruby/','php/','perl/',
    'scrapy','postman','insomnia','httpie','libwww-perl',
    'lwp-','mechanize','okhttp','node-fetch','undici',
    'got/','superagent','request/','aiohttp','httpx','pycurl',
];

function isBlockedUA(ua) {
    const low = String(ua || '').toLowerCase();
    return !!low && BLOCKED_UA.some(b => low.includes(b));
}

const CHALLENGE_TTL_MS = 15 * 1000;
const CONSUMED_TTL_MS = 60 * 1000;
const kv = require('./_kv');

function b64u(buf) {
    return Buffer.from(buf).toString('base64url');
}

function fromB64u(value) {
    return Buffer.from(String(value || ''), 'base64url');
}

function secret() {
    const value = process.env.LOCKER_SESSION_SECRET;
    if (!value || value.length < 32) {
        throw new Error('LOCKER_SESSION_SECRET must be at least 32 characters.');
    }
    return value;
}

function sign(body) {
    return crypto.createHmac('sha256', secret()).update(body).digest('base64url');
}

function safeEqualText(a, b) {
    const aa = Buffer.from(String(a || ''));
    const bb = Buffer.from(String(b || ''));
    return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function ipHash(ip) {
    return crypto.createHmac('sha256', secret()).update(`ip:${String(ip || 'unknown')}`).digest('hex');
}

function bindIpEnabled() {
    return String(process.env.LOCKER_BIND_SESSION_IP || 'true').toLowerCase() !== 'false';
}

function bindUaEnabled() {
    return String(process.env.LOCKER_BIND_SESSION_UA || 'true').toLowerCase() !== 'false';
}

function uaHash(ua) {
    return crypto.createHmac('sha256', secret()).update(`ua:${String(ua || '')}`).digest('hex');
}

function makeChallenge({ slug, accessKeyHash, version, ip, ua }) {
    const now = Date.now();
    const body = JSON.stringify({
        v: 2,
        aud: 'zumhub-verify',
        slug,
        accessKeyHash,
        scriptVersion: version || 0,
        iat: now,
        exp: now + CHALLENGE_TTL_MS,
        nonce: crypto.randomBytes(24).toString('hex'),
        ipHash: bindIpEnabled() ? ipHash(ip) : null,
        uaHash: bindUaEnabled() ? uaHash(ua) : null,
    });
    const encoded = b64u(body);
    return `${encoded}.${sign(encoded)}`;
}

function verifyChallenge(token) {
    try {
        const raw = String(token || '');
        const dot = raw.lastIndexOf('.');
        if (dot < 1) return null;

        const body = raw.slice(0, dot);
        const mac = raw.slice(dot + 1);
        const expected = sign(body);
        if (!safeEqualText(mac, expected)) return null;

        const data = JSON.parse(fromB64u(body).toString('utf8'));
        if (data?.v !== 2 || data?.aud !== 'zumhub-verify') return null;
        if (!Number.isFinite(data.iat) || !Number.isFinite(data.exp)) return null;
        if (Date.now() < data.iat || Date.now() > data.exp) return null;
        if (Date.now() - data.iat > CHALLENGE_TTL_MS) return null;
        if (typeof data.slug !== 'string' || !data.slug) return null;
        if (typeof data.accessKeyHash !== 'string' || !data.accessKeyHash) return null;
        if (typeof data.nonce !== 'string' || data.nonce.length < 32) return null;
        return data;
    } catch {
        return null;
    }
}

async function consumeChallenge(token, clientIp, clientUa) {
    const data = verifyChallenge(token);
    if (!data) return { ok: false, reason: 'invalid-or-expired-session' };

    if (data.ipHash && !safeEqualText(data.ipHash, ipHash(clientIp))) {
        return { ok: false, reason: 'session-network-mismatch' };
    }
    if (data.uaHash && !safeEqualText(data.uaHash, uaHash(clientUa))) {
        return { ok: false, reason: 'session-client-mismatch' };
    }

    const key = 'ch:' + crypto.createHash('sha256').update(String(token)).digest('hex');
    const first = await kv.once(key, Math.ceil(CONSUMED_TTL_MS / 1000));
    if (!first) return { ok: false, reason: 'session-already-consumed' };
    return { ok: true, data };
}

function normaliseList(value, { lower = false, ids = false } = {}) {
    const arr = Array.isArray(value)
        ? value
        : String(value || '').split(/[\s,;]+/);

    const out = [];
    for (const item of arr) {
        let v = String(item || '').trim();
        if (!v) continue;
        if (ids && !/^\d+$/.test(v)) continue;
        if (lower) v = v.toLowerCase();
        if (!out.includes(v)) out.push(v);
    }
    return out.slice(0, 64);
}

function normaliseSecurity(input = {}) {
    const s = input && typeof input === 'object' ? input : {};
    return {
        v: 1,
        requireRuntime: s.requireRuntime !== false,
        requireExecutorId: s.requireExecutorId !== false,
        gameIds: normaliseList(s.gameIds, { ids: true }),
        placeIds: normaliseList(s.placeIds, { ids: true }),
        allowedExecutors: normaliseList(s.allowedExecutors, { lower: true }),
        requiredCapabilities: normaliseList(s.requiredCapabilities, { lower: true }).filter(x => /^[a-z0-9_-]{1,64}$/i.test(x)),
        bindMode: ['user', 'client', 'both'].includes(s.bindMode) ? s.bindMode : 'off',
        maxBindings: Math.min(50, Math.max(1, Math.floor(Number(s.maxBindings)) || 1)),
        allowedUserIds: normaliseList(s.allowedUserIds, { ids: true }),
        minAccountAgeDays: Math.min(3650, Math.max(0, Math.floor(Number(s.minAccountAgeDays)) || 0)),
        requireClientId: s.requireClientId === true,
    };
}

function normaliseSignals(input = {}) {
    const s = input && typeof input === 'object' ? input : {};
    const executor = s.executor && typeof s.executor === 'object' ? s.executor : {};
    const runtime = s.runtime && typeof s.runtime === 'object' ? s.runtime : {};
    const capabilities = s.capabilities && typeof s.capabilities === 'object' ? s.capabilities : {};

    const executorPrimary = String(executor.primary || '').trim().slice(0, 120);
    const executorSecondary = String(executor.secondary || '').trim().slice(0, 120);

    return {
        userId: /^\d+$/.test(String(s.userId || '')) ? String(s.userId) : '',
        playerName: String(s.playerName || '').slice(0, 120),
        displayName: String(s.displayName || '').slice(0, 120),
        executor: {
            primary: executorPrimary,
            secondary: executorSecondary,
            match: !!executor.match,
            version: String(executor.version || '').replace(/[^\x20-\x7e]/g, '').slice(0, 60),
        },
        runtime: {
            gameType: String(runtime.gameType || '').slice(0, 32),
            workspaceType: String(runtime.workspaceType || '').slice(0, 32),
            gameLoaded: runtime.gameLoaded === true,
            runServiceRunning: runtime.runServiceRunning === true,
            localPlayer: runtime.localPlayer === true,
            httpGet: runtime.httpGet === true,
        },
        clientId: /^[A-Za-z0-9_-]{8,128}$/.test(String(s.clientId || '')) ? String(s.clientId) : '',
        accountAgeDays: Number.isFinite(Number(s.accountAgeDays)) && s.accountAgeDays !== '' && s.accountAgeDays !== null
            ? Math.min(100000, Math.max(0, Math.floor(Number(s.accountAgeDays)))) : null,
        jobId: String(s.jobId || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64),
        gameId: /^\d+$/.test(String(s.gameId || '')) ? String(s.gameId) : '',
        placeId: /^\d+$/.test(String(s.placeId || '')) ? String(s.placeId) : '',
        capabilities: Object.fromEntries(
            Object.entries(capabilities)
                .slice(0, 64)
                .map(([k, v]) => [String(k).toLowerCase().slice(0, 64), v === true])
        ),
    };
}

function executorNames(signals) {
    const out = [];
    for (const value of [signals.executor.primary, signals.executor.secondary]) {
        const v = String(value || '').trim().toLowerCase();
        if (v && !out.includes(v)) out.push(v);
    }
    return out;
}

function fingerprint(signals) {
    const canonical = JSON.stringify({
        gameId: signals.gameId,
        placeId: signals.placeId,
        executor: signals.executor,
        runtime: signals.runtime,
        capabilities: Object.keys(signals.capabilities)
            .filter(k => signals.capabilities[k])
            .sort()
    });
    return crypto.createHash('sha256').update(canonical).digest('hex');
}

function firstFailures(security, signals) {
    const failures = [];
    const executorIds = executorNames(signals);

    if (security.requireRuntime) {
        if (signals.runtime.gameType !== 'Instance') failures.push('game-type');
        if (signals.runtime.workspaceType !== 'Instance') failures.push('workspace-type');
        if (!signals.runtime.gameLoaded) failures.push('game-not-loaded');
        if (!signals.runtime.runServiceRunning) failures.push('runtime-not-running');
        if (!signals.runtime.localPlayer) failures.push('local-player-missing');
        if (!signals.runtime.httpGet) failures.push('httpget-missing');
        if (!signals.userId) failures.push('user-id-missing');
    }

    if (security.requireExecutorId && executorIds.length === 0) failures.push('executor-id-missing');
    if (security.gameIds.length && !security.gameIds.includes(signals.gameId)) failures.push('game-id');
    if (security.placeIds.length && !security.placeIds.includes(signals.placeId)) failures.push('place-id');

    if (security.allowedExecutors.length) {
        const allowed = security.allowedExecutors.some(item => executorIds.includes(item));
        if (!allowed) failures.push('executor-not-allowed');
    }

    for (const capability of security.requiredCapabilities) {
        if (signals.capabilities[capability] !== true) failures.push(`capability:${capability}`);
    }

    if (signals.executor.primary && signals.executor.secondary && !signals.executor.match) {
        failures.push('executor-id-mismatch');
    }

    if (security.allowedUserIds.length && !security.allowedUserIds.includes(signals.userId)) failures.push('user-not-allowed');
    if (security.minAccountAgeDays > 0 && (signals.accountAgeDays === null || signals.accountAgeDays < security.minAccountAgeDays)) {
        failures.push('account-too-new');
    }
    const needsClient = security.requireClientId || security.bindMode === 'client' || security.bindMode === 'both';
    if (needsClient && !signals.clientId) failures.push('client-id-missing');

    return failures;
}

module.exports = {
    BLOCKED_UA,
    isBlockedUA,
    CHALLENGE_TTL_MS,
    makeChallenge,
    verifyChallenge,
    consumeChallenge,
    normaliseSecurity,
    normaliseSignals,
    fingerprint,
    firstFailures,
};
