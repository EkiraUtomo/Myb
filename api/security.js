const { validSession } = require('./_auth');
const { checkAdmin } = require('./_ratelimit');
const { readBans, upsertBan, removeBan } = require('./_security_store');

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const rl = checkAdmin(req);
    if (!rl.allowed) {
        res.setHeader('Retry-After', String(rl.resetIn));
        return res.status(429).json({ error: 'too many requests' });
    }
    if (!validSession(req)) return res.status(401).json({ error: 'Authentication required.' });

    try {
        if (req.method === 'GET') {
            const { bans } = await readBans({ force: true });
            return res.json({ ok: true, bans, webhookConfigured: !!process.env.DISCORD_WEBHOOK_URL });
        }
        if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST only' });

        const body = req.body || {};
        if (body.action === 'ban') {
            const ip = String(body.ip || '').trim();
            const reason = String(body.reason || '').trim();
            if (!ip) return res.status(400).json({ error: 'IP or CIDR is required.' });
            if (!reason) return res.status(400).json({ error: 'A ban reason is required.' });
            const expiresAt = body.expiresAt ? new Date(body.expiresAt).toISOString() : null;
            const result = await upsertBan({ ip, reason, expiresAt });
            return res.json({ ok: true, bans: result.bans });
        }
        if (body.action === 'unban') {
            const ip = String(body.ip || '').trim();
            if (!ip) return res.status(400).json({ error: 'IP or CIDR is required.' });
            const result = await removeBan(ip);
            return res.json({ ok: true, bans: result.bans });
        }
        return res.status(400).json({ error: 'Unknown action.' });
    } catch (e) {
        console.error(`[security-api] ${e.message}`);
        return res.status(500).json({ error: e.message || 'Security API failed.' });
    }
};
