const { validSession } = require('./_auth');
const { checkAdmin } = require('./_ratelimit');

const REQUIRED = ['LOCKER_MASTER_SECRET', 'LOCKER_SESSION_SECRET', 'LOCKER_ADMIN_SECRET', 'LOCKER_GITHUB_OWNER', 'LOCKER_GITHUB_REPO', 'GITHUB_TOKEN'];
const OPTIONAL = ['DISCORD_WEBHOOK_URL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'LOCKER_DEBUG'];

function status(name) {
    const v = process.env[name] || '';
    if (!v) return 'missing';
    if (name.endsWith('_SECRET') && name !== 'LOCKER_ADMIN_SECRET' && v.length < 32) return 'too-short';
    if (name === 'LOCKER_ADMIN_SECRET' && v.length < 8) return 'too-short';
    return 'set';
}

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
    const rl = checkAdmin(req);
    if (!rl.allowed) return res.status(429).json({ error: 'too many requests' });
    if (!validSession(req)) return res.status(401).json({ error: 'Authentication required.' });

    const required = Object.fromEntries(REQUIRED.map(n => [n, status(n)]));
    const optional = Object.fromEntries(OPTIONAL.map(n => [n, status(n)]));
    const problems = Object.entries(required).filter(([, v]) => v !== 'set').map(([k, v]) => `${k}: ${v}`);

    return res.json({ ok: problems.length === 0, problems, required, optional, node: process.version });
};
