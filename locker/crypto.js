const crypto = require('crypto');

function b64u(buf) { return Buffer.from(buf).toString('base64url'); }
function fromB64u(v) { return Buffer.from(String(v || ''), 'base64url'); }

function masterSecret() {
    const s = process.env.LOCKER_MASTER_SECRET;
    if (!s || s.length < 32) throw new Error('LOCKER_MASTER_SECRET must be at least 32 characters.');
    return s;
}

function masterKey() {
    return crypto.createHmac('sha256', 'zumhub-v3-master').update(masterSecret()).digest();
}

// AES-256-GCM encrypt. AAD binds the ciphertext to its slug.
function encrypt(plain, aad) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
    if (aad) c.setAAD(Buffer.from(aad, 'utf8'));
    const ct = Buffer.concat([c.update(Buffer.from(plain, 'utf8')), c.final()]);
    return `${b64u(iv)}.${b64u(c.getAuthTag())}.${b64u(ct)}`;
}

// AAD-bound decryption is the normal path. Legacy ciphertexts may still be read
// when LOCKER_ALLOW_LEGACY_PAYLOAD=true so existing vaults can be migrated deliberately.
function decrypt(blob, aad) {
    const p = String(blob).split('.');
    if (p.length !== 3) throw new Error('Invalid encrypted payload.');

    const open = (useAad) => {
        const d = crypto.createDecipheriv('aes-256-gcm', masterKey(), fromB64u(p[0]));
        d.setAuthTag(fromB64u(p[1]));
        if (useAad && aad) d.setAAD(Buffer.from(aad, 'utf8'));
        return Buffer.concat([d.update(fromB64u(p[2])), d.final()]).toString('utf8');
    };

    try {
        return open(true);
    } catch (e) {
        if (String(process.env.LOCKER_ALLOW_LEGACY_PAYLOAD || 'false').toLowerCase() !== 'true') throw e;
        return open(false);
    }
}

// Access keys are bound to the slug. There is no insecure fallback secret.
function hashAccessKey(key, slug) {
    return crypto.createHmac('sha256', masterSecret())
        .update(`${String(key)}:${String(slug)}`)
        .digest('hex');
}

// Legacy hash for migration-only compatibility.
function hashAccessKeyLegacy(key) {
    return crypto.createHash('sha256').update(String(key)).digest('hex');
}

function newAccessKey() {
    return b64u(crypto.randomBytes(32));
}

function accessKeyOk(key, slug, storedHash) {
    const stored = Buffer.from(String(storedHash || ''), 'hex');
    if (stored.length === 0) return false;

    const bound = Buffer.from(hashAccessKey(key, slug), 'hex');
    if (bound.length === stored.length && crypto.timingSafeEqual(bound, stored)) return true;

    // Only allow legacy unbound keys when explicitly enabled for migration.
    if (String(process.env.LOCKER_ALLOW_LEGACY_ACCESS_KEYS || 'false').toLowerCase() !== 'true') return false;
    const legacy = Buffer.from(hashAccessKeyLegacy(key), 'hex');
    return legacy.length === stored.length && crypto.timingSafeEqual(legacy, stored);
}

function safeSlug(slug) {
    return /^[a-z0-9][a-z0-9_-]{1,63}$/i.test(slug || '');
}

module.exports = { encrypt, decrypt, hashAccessKey, newAccessKey, accessKeyOk, safeSlug };
