const { validSession } = require('./_auth');
const { checkAdmin } = require('./_ratelimit');
const { readSettings, writeSettings } = require('./_settings');

const BODY_LIMIT = 64 * 1024;

function hasCredentials(req) {
    return !!(req.headers?.authorization || req.headers?.cookie);
}

module.exports = async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Request-ID', Math.random().toString(36).slice(2));
    res.setHeader('Vary', 'Authorization, Cookie');

    if (req.method === 'GET') {
        const admin = hasCredentials(req);
        res.setHeader('Cache-Control', admin ? 'no-store' : 'public, s-maxage=30, stale-while-revalidate=300');
        try {
            const { settings, degraded } = await readSettings({ force: admin });
            return res.json({ ok: true, settings, degraded });
        } catch (e) {
            console.error(`[settings-read] ${e.message}`);
            return res.status(500).json({ error: 'Could not load settings.' });
        }
    }

    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST only' });

    const rl = checkAdmin(req);
    if (!rl.allowed) {
        res.setHeader('Retry-After', String(rl.resetIn));
        return res.status(429).json({ error: 'too many requests' });
    }
    if (!validSession(req)) return res.status(401).json({ error: 'Authentication required.' });

    if (JSON.stringify(req.body || {}).length > BODY_LIMIT) {
        return res.status(413).json({ error: 'Settings payload too large.' });
    }

    const incoming = req.body && req.body.settings;
    if (!incoming || typeof incoming !== 'object') return res.status(400).json({ error: 'settings required' });

    try {
        const settings = await writeSettings(incoming);
        return res.json({ ok: true, settings });
    } catch (e) {
        console.error(`[settings-write] ${e.message}`);
        return res.status(500).json({ error: e.message });
    }
};
