const crypto = require('crypto');

function b64u(buf) { return Buffer.from(buf).toString('base64url'); }
function fromB64u(v) { return Buffer.from(String(v || ''), 'base64url'); }

function masterKey() {
    const s = process.env.LOCKER_MASTER_SECRET;
    if (!s || s.length < 32) throw new Error('LOCKER_MASTER_SECRET must be at least 32 characters.');
    // HKDF-style expansion — derive a proper 256-bit key from the secret
    return crypto.createHmac('sha256', 'zumhub-v2-master')
        .update(s)
        .digest();
}

// AES-256-GCM encrypt with authenticated additional data (slug binds payload to its slug)
function encrypt(plain, aad) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
    if (aad) c.setAAD(Buffer.from(aad, 'utf8'));
    const ct = Buffer.concat([c.update(Buffer.from(plain, 'utf8')), c.final()]);
    return `${b64u(iv)}.${b64u(c.getAuthTag())}.${b64u(ct)}`;
}

// AES-256-GCM decrypt — aad must match what was used during encrypt.
// Falls back to no-AAD decryption for payloads created before slug-binding was added,
// so existing scripts don't break the moment this update deploys. Re-saving a script
// (even with no changes) re-encrypts it under the new AAD scheme going forward.
function decrypt(blob, aad) {
    const p = String(blob).split('.');
    if (p.length !== 3) throw new Error('Invalid encrypted payload.');
    try {
        const d = crypto.createDecipheriv('aes-256-gcm', masterKey(), fromB64u(p[0]));
        d.setAuthTag(fromB64u(p[1]));
        if (aad) d.setAAD(Buffer.from(aad, 'utf8'));
        return Buffer.concat([d.update(fromB64u(p[2])), d.final()]).toString('utf8');
    } catch (e) {
        if (!aad) throw e;
        // legacy path: payload encrypted before AAD binding existed
        const d = crypto.createDecipheriv('aes-256-gcm', masterKey(), fromB64u(p[0]));
        d.setAuthTag(fromB64u(p[1]));
        return Buffer.concat([d.update(fromB64u(p[2])), d.final()]).toString('utf8');
    }
}

// Access key: HMAC-SHA256 of (key + slug) so a key for one slug is useless on another
function hashAccessKey(key, slug) {
    return crypto.createHmac('sha256', process.env.LOCKER_MASTER_SECRET || 'fallback')
        .update(`${key}:${slug}`)
        .digest('hex');
}

// Legacy hash — key only, no slug binding. Kept solely so scripts created before
// this update still validate until they're re-saved (which upgrades them).
function hashAccessKeyLegacy(key) {
    return crypto.createHash('sha256').update(String(key)).digest('hex');
}

// Generate a new cryptographically random access key
function newAccessKey() {
    return b64u(crypto.randomBytes(32));
}

// Constant-time comparison — checks slug-bound hash first, falls back to legacy
// unbound hash so pre-migration scripts keep working until re-saved.
function accessKeyOk(key, slug, storedHash) {
    const stored = Buffer.from(String(storedHash || ''), 'hex');
    if (stored.length === 0) return false;

    const bound = Buffer.from(hashAccessKey(key, slug), 'hex');
    if (bound.length === stored.length && crypto.timingSafeEqual(bound, stored)) return true;

    const legacy = Buffer.from(hashAccessKeyLegacy(key), 'hex');
    return legacy.length === stored.length && crypto.timingSafeEqual(legacy, stored);
}

// Slug validation — strict alphanumeric + hyphen/underscore only
function safeSlug(slug) {
    return /^[a-z0-9][a-z0-9_-]{1,63}$/i.test(slug || '');
}

// Sign arbitrary data with HMAC for integrity verification
function hmacSign(data) {
    return crypto.createHmac('sha256', process.env.LOCKER_SESSION_SECRET || 'fallback')
        .update(String(data))
        .digest('base64url');
}

module.exports = { encrypt, decrypt, hashAccessKey, newAccessKey, accessKeyOk, safeSlug, hmacSign };
