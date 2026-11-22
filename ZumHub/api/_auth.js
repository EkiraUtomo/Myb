const crypto = require('crypto');

const COOKIE = 'zh_session';
const SESSION_TTL = 8 * 60 * 60 * 1000;
const MAX_TOKEN_AGE = SESSION_TTL;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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
    const now = Date.now();
    const body = b64u(JSON.stringify({
        exp: now + SESSION_TTL,
        iat: now,
        n: crypto.randomBytes(16).toString('hex'),
        v: 1,
    }));
    return `${body}.${sign(body)}`;
}

function tokenIsValid(token) {
    try {
        if (!token || token.length > 1024) return false;
        const dot = token.lastIndexOf('.');
        if (dot < 1) return false;
        const body = token.slice(0, dot);
        const got = Buffer.from(token.slice(dot + 1), 'base64url');
        const expected = Buffer.from(sign(body), 'base64url');
        if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return false;

        const data = JSON.parse(fromB64u(body).toString('utf8'));
        const now = Date.now();
        if (!Number.isFinite(data.exp) || now >= data.exp) return false;
        if (!Number.isFinite(data.iat) || now - data.iat > MAX_TOKEN_AGE) return false;
        return data.v === 1;
    } catch {
        return false;
    }
}

function readCookie(req, name) {
    const header = String(req.headers?.cookie || '');
    for (const part of header.split(';')) {
        const i = part.indexOf('=');
        if (i < 1) continue;
        if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
    }
    return '';
}

function bearerToken(req) {
    const auth = String(req.headers?.authorization || '');
    return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

function originMatchesHost(req) {
    const origin = String(req.headers?.origin || '');
    if (!origin) return true;
    try {
        const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
        return new URL(origin).host.toLowerCase() === host;
    } catch {
        return false;
    }
}

// Cookie sessions need the custom header and a matching Origin on writes.
// Bearer sessions are not ambient credentials, so they skip both.
function validSession(req) {
    const bearer = bearerToken(req);
    if (bearer) return tokenIsValid(bearer);

    const cookie = readCookie(req, COOKIE);
    if (!cookie || !tokenIsValid(cookie)) return false;
    if (MUTATING.has(String(req.method || 'GET').toUpperCase())) {
        if (req.headers?.['x-zh-csrf'] !== '1') return false;
        if (!originMatchesHost(req)) return false;
    }
    return true;
}

function sessionInfo(req) {
    const bearer = bearerToken(req);
    const token = bearer || readCookie(req, COOKIE);
    if (!token || !tokenIsValid(token)) return null;
    try {
        const data = JSON.parse(fromB64u(token.slice(0, token.lastIndexOf('.'))).toString('utf8'));
        return { via: bearer ? 'bearer' : 'cookie', issuedAt: new Date(data.iat).toISOString(), expiresAt: new Date(data.exp).toISOString(), remainingMin: Math.max(0, Math.round((data.exp - Date.now()) / 60000)) };
    } catch { return null; }
}

function isSecureRequest(req) {
    const proto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
    return proto === 'https' || !!process.env.VERCEL;
}

function sessionCookie(token, req) {
    const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${Math.floor(SESSION_TTL / 1000)}`];
    if (isSecureRequest(req)) parts.push('Secure');
    return parts.join('; ');
}

function clearCookie(req) {
    const parts = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
    if (isSecureRequest(req)) parts.push('Secure');
    return parts.join('; ');
}

function digest(value) {
    return crypto.createHmac('sha256', 'zumhub-admin-compare').update(String(value ?? '')).digest();
}

function adminSecretOk(value) {
    const expected = process.env.LOCKER_ADMIN_SECRET || '';
    if (expected.length < 8) return false;
    return crypto.timingSafeEqual(digest(value), digest(expected));
}

function getRequestId() {
    return crypto.randomBytes(8).toString('hex');
}

module.exports = {
    validSession, sessionInfo, makeToken, adminSecretOk, getRequestId,
    sessionCookie, clearCookie, readCookie, COOKIE,
};
