const { decrypt, verifyToken, safeSlug } = require('../locker/crypto');
const { getDb } = require('./_github');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const slug = String(req.query?.slug || '').toLowerCase();
  const token = String(req.query?.token || '');
  if (!safeSlug(slug)) return res.status(404).send('not found');
  try {
    const p = verifyToken(token);
    if (p.s !== slug) return res.status(403).send('forbidden');
    const db = await getDb();
    const item = db.scripts[slug];
    if (!item || !item.enabled) return res.status(404).send('not found');
    if (item.expiresAt && Date.now() >= new Date(item.expiresAt).getTime()) return res.status(410).send('expired');
    const source = decrypt(item.payload);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(source);
  } catch (e) {
    console.error(e);
    return res.status(403).send('forbidden');
  }
};
