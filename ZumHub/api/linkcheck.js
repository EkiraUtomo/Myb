const dns = require('dns').promises;
const net = require('net');
const { validSession } = require('./_auth');
const { checkAdmin } = require('./_ratelimit');

const MAX_URLS = 20;
const TIMEOUT_MS = 5000;

function isPrivateIp(ip) {
    const v = net.isIP(ip);
    if (v === 4) {
        const [a, b] = ip.split('.').map(Number);
        return a === 0 || a === 10 || a === 127 || a >= 224 ||
            (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
    }
    if (v === 6) {
        const low = ip.toLowerCase();
        if (low === '::1' || low === '::') return true;
        if (low.startsWith('::ffff:')) return isPrivateIp(low.slice(7));
        return /^f[cd]/.test(low) || /^fe[89ab]/.test(low);
    }
    return true;
}

async function hostIsPublic(hostname, lookup = dns.lookup) {
    const h = String(hostname || '').toLowerCase();
    if (!h || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return false;
    if (net.isIP(h)) return !isPrivateIp(h);
    if (!h.includes('.')) return false;
    try {
        const addrs = await lookup(h, { all: true });
        return addrs.length > 0 && addrs.every(a => !isPrivateIp(a.address));
    } catch {
        return false;
    }
}

function discordCode(u) {
    const h = u.hostname.toLowerCase();
    if (h === 'discord.gg') return u.pathname.split('/').filter(Boolean)[0] || '';
    if (h === 'discord.com' || h === 'www.discord.com' || h === 'discordapp.com') {
        const m = /^\/invite\/([A-Za-z0-9-]+)/.exec(u.pathname);
        return m ? m[1] : '';
    }
    return '';
}

async function timed(url, opts) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        return await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'ZumHub-LinkCheck/1.0' }, ...opts, signal: ctrl.signal });
    } finally { clearTimeout(t); }
}

function classify(status) {
    if (status >= 200 && status < 400) return { status: 'ok', detail: `HTTP ${status}` };
    if (status === 404 || status === 410) return { status: 'dead', detail: `HTTP ${status}, page is gone` };
    return { status: 'unknown', detail: `HTTP ${status}, site may block checks` };
}

async function checkOne(raw, deps = {}) {
    let u;
    try { u = new URL(String(raw)); } catch { return { url: raw, status: 'dead', detail: 'not a valid URL' }; }
    if (u.protocol === 'mailto:') return { url: raw, status: 'unknown', detail: 'mail link, not checked' };
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { url: raw, status: 'dead', detail: 'unsupported scheme' };

    const code = discordCode(u);
    try {
        if (code) {
            const r = await timed(`https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true`);
            if (r.status === 200) {
                const j = await r.json().catch(() => ({}));
                const n = j.approximate_member_count;
                return { url: raw, status: 'ok', detail: n ? `invite valid, ${n} members` : 'invite valid' };
            }
            if (r.status === 404) return { url: raw, status: 'dead', detail: 'invite expired or invalid' };
            return { url: raw, ...classify(r.status) };
        }
        if (!(await hostIsPublic(u.hostname, deps.lookup))) return { url: raw, status: 'blocked', detail: 'host is not a public address' };
        let r = await timed(u.href, { method: 'HEAD' });
        if ([403, 405, 501].includes(r.status)) r = await timed(u.href, { method: 'GET' });
        return { url: raw, ...classify(r.status) };
    } catch (e) {
        return { url: raw, status: 'unknown', detail: e && e.name === 'AbortError' ? 'timed out' : 'could not connect' };
    }
}

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const rl = checkAdmin(req);
    if (!rl.allowed) return res.status(429).json({ error: 'too many requests' });
    if (!validSession(req)) return res.status(401).json({ error: 'Authentication required.' });

    const urls = Array.isArray(req.body && req.body.urls) ? req.body.urls.slice(0, MAX_URLS).map(String) : [];
    if (!urls.length) return res.status(400).json({ error: 'urls required' });

    const results = [];
    for (let i = 0; i < urls.length; i += 5) {
        results.push(...await Promise.all(urls.slice(i, i + 5).map(u => checkOne(u))));
    }
    return res.json({ ok: true, results });
};

module.exports.isPrivateIp = isPrivateIp;
module.exports.hostIsPublic = hostIsPublic;
module.exports.checkOne = checkOne;
