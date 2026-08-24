const { decrypt, issueRunToken, safeSlug } = require('../locker/crypto');
const { getDb } = require('./_github');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const slug = String(req.query?.slug || '').toLowerCase();
  if (!safeSlug(slug)) return res.status(404).json({ error: 'Not found' });
  try {
    const db = await getDb();
    const item = db.scripts[slug];
    if (!item || !item.enabled) return res.status(404).json({ error: 'Not found' });
    if (item.expiresAt && Date.now() >= new Date(item.expiresAt).getTime()) return res.status(410).json({ error: 'Expired' });
    const token = issueRunToken(slug, 90);
    const base = process.env.LOCKER_PUBLIC_BASE_URL || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
    const url = `${base}/api/run?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}`;
    const loader = `loadstring(game:HttpGet(${JSON.stringify(url)}))()`;
    return res.status(200).json({ ok: true, slug, loader, expiresIn: 90, description: item.description || '' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Delivery unavailable.' });
  }
};
