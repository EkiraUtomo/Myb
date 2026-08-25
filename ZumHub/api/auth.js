const { adminSecretOk, setSession, clearSession, validSession } = require('./_auth');
const { checkLogin } = require('./_ratelimit');

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method === 'GET') {
        return res.status(200).json({ authenticated: validSession(req) });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const action = String(req.body?.action || 'login');

    if (action === 'logout') {
        clearSession(res);
        return res.status(200).json({ ok: true });
    }

    // Rate limit login attempts before checking the secret
    const rl = checkLogin(req);
    if (!rl.allowed) {
        res.setHeader('Retry-After', String(rl.resetIn));
        return res.status(429).json({ error: `too many attempts — try again in ${rl.resetIn}s` });
    }

    // Constant-time secret check — timing safe
    if (!adminSecretOk(req.body?.secret)) {
        // Deliberate small delay to slow down brute force even further
        await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
        return res.status(401).json({ error: 'Invalid credentials.' });
    }

    setSession(req, res);
    return res.status(200).json({ ok: true });
};
