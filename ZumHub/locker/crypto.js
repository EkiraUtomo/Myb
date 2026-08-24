const crypto = require('crypto');

function b64u(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function fromB64u(value) {
  const pad = value.length % 4 ? '='.repeat(4 - (value.length % 4)) : '';
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}
function masterKey() {
  const secret = process.env.LOCKER_MASTER_SECRET;
  if (!secret || secret.length < 32) throw new Error('LOCKER_MASTER_SECRET must be at least 32 characters.');
  return crypto.createHash('sha256').update(secret).digest();
}
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plain, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${b64u(iv)}.${b64u(tag)}.${b64u(ciphertext)}`;
}
function decrypt(blob) {
  const parts = String(blob).split('.');
  if (parts.length !== 3) throw new Error('Invalid encrypted payload.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(), fromB64u(parts[0]));
  decipher.setAuthTag(fromB64u(parts[1]));
  return Buffer.concat([decipher.update(fromB64u(parts[2])), decipher.final()]).toString('utf8');
}
function signToken(payload) {
  const body = b64u(Buffer.from(JSON.stringify(payload), 'utf8'));
  const mac = crypto.createHmac('sha256', masterKey()).update(body).digest();
  return `${body}.${b64u(mac)}`;
}
function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) throw new Error('Invalid token.');
  const body = parts[0];
  const expected = crypto.createHmac('sha256', masterKey()).update(body).digest();
  const got = fromB64u(parts[1]);
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) throw new Error('Invalid token.');
  const payload = JSON.parse(fromB64u(body).toString('utf8'));
  if (!payload.exp || Date.now() > payload.exp) throw new Error('Token expired.');
  return payload;
}
function issueRunToken(slug, ttlSeconds = 90) {
  return signToken({ s: slug, exp: Date.now() + ttlSeconds * 1000, n: b64u(crypto.randomBytes(12)) });
}
function safeSlug(slug) {
  return /^[a-z0-9][a-z0-9_-]{1,63}$/i.test(slug || '');
}
module.exports = { encrypt, decrypt, issueRunToken, verifyToken, safeSlug };
