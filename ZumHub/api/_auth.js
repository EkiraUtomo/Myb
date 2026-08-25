const crypto = require('crypto');

const COOKIE = 'zumhub_admin';
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours

function b64u(buf) { return Buffer.from(buf).toString('base64url'); }
function fromB64u(s) { return Buffer.from(String(s || ''), 'base64url'); }

function sessionSecret() {
    const s = process.env.LOCKER_SESSION_SECRET;
    if (!s || s.length < 32) throw new Error('LOCKER_SESSION_SECRET must be at least 32 characters.');
    return s;
}

function sign(body) {
    return crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
}

// Get a stable IP fingerprint to bind sessions to
function ipOf(req) {
    return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
        || req.headers['x-real-ip']
        || 'unknown';
}

// Session v2: includes IP hash so stolen cookies don't work cross-IP
function makeSession(req) {
    const ipHash = crypto.createHmac('sha256', sessionSecret())
        .update(ipOf(req))
        .digest('base64url')
        .slice(0, 16);
    const exp = Date.now() + SESSION_TTL;
    const nonce = crypto.randomBytes(18).toString('hex');
    const body = b64u(JSON.stringify({ v: 2, exp, n: nonce, ip: ipHash }));
    return `${body}.${sign(body)}`;
}

function parseCookie(header) {
    const out = {};
    for (const part of String(header || '').split(';')) {
        const i = part.indexOf('=');
        if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
}

function validSession(req) {
    try {
        const token = parseCookie(req.headers.cookie)[COOKIE];
        const [body, mac] = String(token || '').split('.');
        if (!body || !mac) return false;

        // Timing-safe MAC check
        const expected = Buffer.from(sign(body), 'base64url');
        const got = Buffer.from(mac, 'base64url');
        if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return false;

        const data = JSON.parse(fromB64u(body).toString('utf8'));

        // Expiry
        if (!Number.isFinite(data.exp) || Date.now() >= data.exp) return false;

        // v2: validate IP binding
        if (data.v === 2 && data.ip) {
            const ipHash = crypto.createHmac('sha256', sessionSecret())
                .update(ipOf(req))
                .digest('base64url')
                .slice(0, 16);
            const a = Buffer.from(data.ip);
            const b = Buffer.from(ipHash);
            if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
        }

        // Accept v1 sessions too (backwards compat during transition)
        return data.v === 1 || data.v === 2;
    } catch {
        return false;
    }
}

function setSession(req, res) {
    const token = makeSession(req);
    res.setHeader('Set-Cookie',
        `${COOKIE}=${encodeURIComponent(token)}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL / 1000}`
    );
}

function clearSession(res) {
    res.setHeader('Set-Cookie',
        `${COOKIE}=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
    );
}

function adminSecretOk(value) {
    const expected = process.env.LOCKER_ADMIN_SECRET || '';
    if (expected.length < 20) return false;
    const a = Buffer.from(String(value || '').padEnd(expected.length, '\0'));
    const b = Buffer.from(expected);
    // Pad both to same length before timing-safe compare to avoid length leaks
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { validSession, setSession, clearSession, adminSecretOk };
