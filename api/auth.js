const { adminSecretOk, makeToken, validSession } = require('./_auth');
const { checkLogin } = require('./_ratelimit');

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // GET — check if current token is still valid
    if (req.method === 'GET') {
        return res.status(200).json({ authenticated: validSession(req) });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = req.body || {};

    if (body.action === 'logout') {
        // Client just discards the token — nothing to do server-side
        return res.status(200).json({ ok: true });
    }

    // Rate limit login attempts
    const rl = checkLogin(req);
    if (!rl.allowed) {
        res.setHeader('Retry-After', String(rl.resetIn));
        return res.status(429).json({ error: `Too many attempts — try again in ${rl.resetIn}s` });
    }

    if (!adminSecretOk(body.secret)) {
        await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
        return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Return signed token — client stores in sessionStorage and sends as Bearer
    const token = makeToken();
    return res.status(200).json({ ok: true, token });
};
