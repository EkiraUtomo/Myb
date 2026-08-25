const crypto = require('crypto');

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

// Make a signed session token — returned as JSON, stored client-side in sessionStorage
function makeToken() {
    const exp = Date.now() + SESSION_TTL;
    const nonce = crypto.randomBytes(16).toString('hex');
    const body = b64u(JSON.stringify({ exp, n: nonce }));
    return `${body}.${sign(body)}`;
}

// Validate token from Authorization: Bearer header
function validSession(req) {
    try {
        const auth = req.headers['authorization'] || '';
        if (!auth.startsWith('Bearer ')) return false;
        const token = auth.slice(7).trim();
        const dot = token.lastIndexOf('.');
        if (dot < 1) return false;
        const body = token.slice(0, dot);
        const mac  = token.slice(dot + 1);

        // Timing-safe MAC check
        const expected = Buffer.from(sign(body), 'base64url');
        const got = Buffer.from(mac, 'base64url');
        if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return false;

        const data = JSON.parse(fromB64u(body).toString('utf8'));
        if (!Number.isFinite(data.exp) || Date.now() >= data.exp) return false;

        return true;
    } catch {
        return false;
    }
}

function adminSecretOk(value) {
    const expected = process.env.LOCKER_ADMIN_SECRET || '';
    if (expected.length < 8) return false;
    const a = Buffer.from(String(value || '').padEnd(Math.max(expected.length, 1), '\0').slice(0, Math.max(expected.length, 1)));
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

module.exports = { validSession, makeToken, adminSecretOk };
