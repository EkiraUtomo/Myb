const { adminSecretOk, makeToken, validSession, sessionCookie, clearCookie } = require('./_auth');
const { checkLogin } = require('./_ratelimit');

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method === 'GET') {
        return res.status(200).json({ authenticated: validSession(req) });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};

    if (body.action === 'logout') {
        res.setHeader('Set-Cookie', clearCookie(req));
        return res.status(200).json({ ok: true });
    }

    const rl = checkLogin(req);
    if (!rl.allowed) {
        res.setHeader('Retry-After', String(rl.resetIn));
        return res.status(429).json({ error: `Too many attempts — try again in ${rl.resetIn}s` });
    }

    if (!adminSecretOk(body.secret)) {
        await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
        return res.status(401).json({ error: 'Invalid credentials.' });
    }

    let token;
    try {
        token = makeToken();
    } catch (e) {
        console.error(`[auth] ${e.message}`);
        return res.status(500).json({ error: 'Server is missing LOCKER_SESSION_SECRET (32+ characters).' });
    }

    res.setHeader('Set-Cookie', sessionCookie(token, req));
    return res.status(200).json({ ok: true, token });
};
