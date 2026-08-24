const crypto = require('crypto');
const { encrypt, safeSlug } = require('../locker/crypto');
const { getDb, saveDb } = require('./_github');

function timingSafe(a, b) {
  const x = Buffer.from(a || '');
  const y = Buffer.from(b || '');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function adminOk(req) {
  const expected = process.env.LOCKER_ADMIN_SECRET;
  return expected && expected.length >= 20 && timingSafe(req.headers['x-locker-admin'] || '', expected);
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!adminOk(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { action = 'upsert', slug, source, enabled = true, expiresAt = null, description = '' } = req.body || {};
    if (!safeSlug(slug)) return res.status(400).json({ error: 'Slug must be 2-64 chars: letters, numbers, _ or -.' });
    if (action !== 'delete') {
      if (typeof source !== 'string' || source.length < 1) return res.status(400).json({ error: 'Source is required.' });
      if (source.length > 1024 * 1024) return res.status(413).json({ error: 'Source exceeds 1 MiB.' });
    }
    const db = await getDb();
    if (action === 'delete') {
      delete db.scripts[slug];
    } else {
      db.scripts[slug] = {
        v: 1,
        payload: encrypt(source),
        enabled: !!enabled,
        expiresAt: expiresAt || null,
        description: String(description).slice(0, 300),
        updatedAt: new Date().toISOString()
      };
    }
    await saveDb(db.scripts, db.sha, `locker: ${action} ${slug}`);
    return res.status(200).json({ ok: true, slug });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
};
