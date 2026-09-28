const crypto = require('crypto');

const COOKIE = 'zumhub_admin';
const SESSION_TTL = 8 * 60 * 60 * 1000;
const MAX_TOKEN_AGE = SESSION_TTL;

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

function makeToken() {
    const exp = Date.now() + SESSION_TTL;
    const iat = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    // bind token to a version so old tokens can be invalidated by rotating SESSION_SECRET
    const body = b64u(JSON.stringify({ exp, iat, n: nonce, v: 1 }));
    return `${body}.${sign(body)}`;
}

function validSession(req) {
    try {
        const auth = req.headers['authorization'] || '';
        if (!auth.startsWith('Bearer ')) return false;
        const token = auth.slice(7).trim();
        if (!token || token.length > 1024) return false; // sanity length check

        const dot = token.lastIndexOf('.');
        if (dot < 1) return false;
        const body = token.slice(0, dot);
        const mac  = token.slice(dot + 1);

        // timing-safe MAC check
        const expected = Buffer.from(sign(body), 'base64url');
        const got = Buffer.from(mac, 'base64url');
        if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return false;

        const data = JSON.parse(fromB64u(body).toString('utf8'));
        if (!Number.isFinite(data.exp) || Date.now() >= data.exp) return false;
        if (!Number.isFinite(data.iat) || Date.now() - data.iat > MAX_TOKEN_AGE) return false;
        if (data.v !== 1) return false;

        return true;
    } catch {
        return false;
    }
}

function adminSecretOk(value) {
    const expected = process.env.LOCKER_ADMIN_SECRET || '';
    if (expected.length < 8) return false;
    const maxLen = Math.max(expected.length, String(value || '').length, 1);
    const a = Buffer.alloc(maxLen, 0);
    const b = Buffer.alloc(maxLen, 0);
    Buffer.from(String(value || '').slice(0, maxLen)).copy(a);
    Buffer.from(expected.slice(0, maxLen)).copy(b);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function getRequestId() {
    return crypto.randomBytes(8).toString('hex');
}

module.exports = { validSession, makeToken, adminSecretOk, getRequestId };
