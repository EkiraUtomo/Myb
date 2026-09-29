const crypto = require('crypto');

// V14: opaque, encrypted, short-lived execution tickets.
// Ticket claims are no longer readable from the loader text or URL.
const CHALLENGE_TTL_MS = 15 * 1000;
const CONSUMED_TTL_MS = 60 * 1000;
const TICKET_VERSION = 4;
const TICKET_AAD = 'zumhub-execution-ticket-v4';
const consumed = new Map();

function b64u(buf) { return Buffer.from(buf).toString('base64url'); }
function fromB64u(value) { return Buffer.from(String(value || ''), 'base64url'); }

function secret() {
    const value = process.env.LOCKER_SESSION_SECRET;
    if (!value || value.length < 32) {
        throw new Error('LOCKER_SESSION_SECRET must be at least 32 characters.');
    }
    return value;
}

function ticketKey() {
    return crypto.createHmac('sha256', 'zumhub-ticket-key-v4').update(secret()).digest();
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
    return String(process.env.LOCKER_BIND_SESSION_IP || 'false').toLowerCase() === 'true';
}

function makeChallenge({ slug, accessKeyHash, version, ip, executorOnly = false, reqId = '' }) {
    const now = Date.now();
    const claims = {
        v: TICKET_VERSION,
        aud: 'zumhub-verify',
        sid: b64u(crypto.randomBytes(32)),
        slug,
        accessKeyHash,
        scriptVersion: version || 0,
        iat: now,
        exp: now + CHALLENGE_TTL_MS,
        nonce: b64u(crypto.randomBytes(32)),
        rid: String(reqId || '').slice(0, 64),
        ipHash: bindIpEnabled() ? ipHash(ip) : null,
        executorOnly: executorOnly === true,
    };

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ticketKey(), iv);
    cipher.setAAD(Buffer.from(TICKET_AAD, 'utf8'));
    const ct = Buffer.concat([
        cipher.update(Buffer.from(JSON.stringify(claims), 'utf8')),
        cipher.final()
    ]);
    return `v${TICKET_VERSION}.${b64u(iv)}.${b64u(cipher.getAuthTag())}.${b64u(ct)}`;
}

function verifyChallenge(token) {
    try {
        const raw = String(token || '');
        const parts = raw.split('.');
        if (parts.length !== 4 || parts[0] !== `v${TICKET_VERSION}`) return null;

        const decipher = crypto.createDecipheriv('aes-256-gcm', ticketKey(), fromB64u(parts[1]));
        decipher.setAuthTag(fromB64u(parts[2]));
        decipher.setAAD(Buffer.from(TICKET_AAD, 'utf8'));
        const plain = Buffer.concat([decipher.update(fromB64u(parts[3])), decipher.final()]).toString('utf8');
        const data = JSON.parse(plain);

        const now = Date.now();
        if (data?.v !== TICKET_VERSION || data?.aud !== 'zumhub-verify') return null;
        if (!Number.isFinite(data.iat) || !Number.isFinite(data.exp)) return null;
        if (data.exp <= data.iat || data.exp - data.iat > CHALLENGE_TTL_MS) return null;
        if (now + 2000 < data.iat || now > data.exp || now - data.iat > CHALLENGE_TTL_MS) return null;
        if (typeof data.sid !== 'string' || data.sid.length < 32) return null;
        if (typeof data.slug !== 'string' || !data.slug) return null;
        if (typeof data.accessKeyHash !== 'string' || !/^[a-f0-9]{64}$/i.test(data.accessKeyHash)) return null;
        if (typeof data.scriptVersion !== 'string' && typeof data.scriptVersion !== 'number') return null;
        if (typeof data.nonce !== 'string' || data.nonce.length < 32) return null;
        if (typeof data.rid !== 'string' || data.rid.length > 64) return null;
        if (data.executorOnly !== true && data.executorOnly !== false) return null;
        return data;
    } catch {
        return null;
    }
}

function consumeChallenge(token, clientIp, expectedRid = '') {
    const data = verifyChallenge(token);
    if (!data) return { ok: false, reason: 'invalid-or-expired-session' };

    if (expectedRid && data.rid !== String(expectedRid)) {
        return { ok: false, reason: 'session-request-mismatch' };
    }

    if (bindIpEnabled() && data.ipHash && !safeEqualText(data.ipHash, ipHash(clientIp))) {
        return { ok: false, reason: 'session-network-mismatch' };
    }

    const key = crypto.createHash('sha256').update(String(token)).digest('hex');
    const now = Date.now();
    for (const [k, expires] of consumed) {
        if (expires <= now) consumed.delete(k);
    }
    if (consumed.has(key)) return { ok: false, reason: 'session-already-consumed' };

    consumed.set(key, Math.min(data.exp, now + CONSUMED_TTL_MS));
    if (consumed.size > 10000) {
        const first = consumed.keys().next().value;
        if (first) consumed.delete(first);
    }
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
        v: 2,
        requireRuntime: s.requireRuntime !== false,
        requireExecutorId: s.requireExecutorId !== false,
        requireRobloxPresence: s.requireRobloxPresence === true,
        gameIds: normaliseList(s.gameIds, { ids: true }),
        placeIds: normaliseList(s.placeIds, { ids: true }),
        allowedExecutors: normaliseList(s.allowedExecutors, { lower: true }),
        requiredCapabilities: normaliseList(s.requiredCapabilities, { lower: true }).filter(x => /^[a-z0-9_-]{1,64}$/i.test(x)),
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
        jobId: /^[0-9a-f-]{16,128}$/i.test(String(s.jobId || '')) ? String(s.jobId) : '',
        executor: {
            primary: executorPrimary,
            secondary: executorSecondary,
            match: !!executor.match,
        },
        runtime: {
            gameType: String(runtime.gameType || '').slice(0, 32),
            workspaceType: String(runtime.workspaceType || '').slice(0, 32),
            gameLoaded: runtime.gameLoaded === true,
            runServiceRunning: runtime.runServiceRunning === true,
            localPlayer: runtime.localPlayer === true,
            httpGet: runtime.httpGet === true,
        },
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
        userId: signals.userId,
        gameId: signals.gameId,
        placeId: signals.placeId,
        jobId: signals.jobId,
        executor: signals.executor,
        runtime: signals.runtime,
        capabilities: Object.keys(signals.capabilities)
            .filter(k => signals.capabilities[k])
            .sort()
    });
    return crypto.createHash('sha256').update(canonical).digest('hex');
}

function firstFailures(security, signals, presence = null) {
    const failures = [];
    const executorIds = executorNames(signals);

    if (security.requireRuntime) {
        if (signals.runtime.gameType !== 'Instance') failures.push('game-type');
        if (signals.runtime.workspaceType !== 'Instance') failures.push('workspace-type');
        if (!signals.runtime.gameLoaded) failures.push('game-not-loaded');
        if (!signals.runtime.runServiceRunning) failures.push('runtime-not-running');
        if (!signals.runtime.localPlayer) failures.push('local-player-missing');
        if (!signals.runtime.httpGet) failures.push('httpget-missing');
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

    if (security.requireRobloxPresence) {
        if (!presence || !presence.available) failures.push('roblox-presence-unavailable');
        else {
            if (presence.userPresenceType !== 2) failures.push('roblox-not-in-game');
            if (presence.userId !== signals.userId) failures.push('roblox-user-mismatch');
            if (!signals.placeId || presence.placeId !== signals.placeId) failures.push('roblox-place-mismatch');
            if (!signals.gameId || presence.universeId !== signals.gameId) failures.push('roblox-universe-mismatch');
            if (!signals.jobId || !presence.gameId || presence.gameId !== signals.jobId) failures.push('roblox-server-mismatch');
        }
    }

    return [...new Set(failures)];
}

module.exports = {
    CHALLENGE_TTL_MS,
    makeChallenge,
    verifyChallenge,
    consumeChallenge,
    normaliseSecurity,
    normaliseSignals,
    fingerprint,
    firstFailures,
};
