const { adminSecretOk, setSession, clearSession, validSession } = require('./_auth');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.status(200).json({ authenticated: validSession(req) });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const action = String(req.body?.action || 'login');
  if (action === 'logout') { clearSession(res); return res.status(200).json({ ok: true }); }
  if (!adminSecretOk(req.body?.secret)) return res.status(401).json({ error: 'Invalid admin credentials.' });
  setSession(res);
  return res.status(200).json({ ok: true });
};
