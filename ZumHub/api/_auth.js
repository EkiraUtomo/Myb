const crypto = require('crypto');

const COOKIE = 'zumhub_admin';

function b64u(buf) {
  return Buffer.from(buf).toString('base64url');
}
function fromB64u(s) {
  return Buffer.from(String(s || ''), 'base64url');
}
function sessionSecret() {
  const s = process.env.LOCKER_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('LOCKER_SESSION_SECRET must be at least 32 characters.');
  return s;
}
function sign(body) {
  return crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
}
function makeSession() {
  const exp = Date.now() + 8 * 60 * 60 * 1000;
  const body = b64u(JSON.stringify({ v: 1, exp, n: crypto.randomBytes(18).toString('hex') }));
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
    const expected = Buffer.from(sign(body), 'base64url');
    const got = Buffer.from(mac, 'base64url');
    if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return false;
    const data = JSON.parse(fromB64u(body).toString('utf8'));
    return data.v === 1 && Number.isFinite(data.exp) && Date.now() < data.exp;
  } catch { return false; }
}
function setSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(makeSession())}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);
}
function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}
function adminSecretOk(value) {
  const expected = process.env.LOCKER_ADMIN_SECRET || '';
  const a = Buffer.from(String(value || ''));
  const b = Buffer.from(expected);
  return expected.length >= 20 && a.length === b.length && crypto.timingSafeEqual(a, b);
}
module.exports = { validSession, setSession, clearSession, adminSecretOk };
