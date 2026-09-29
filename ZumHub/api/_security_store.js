const SECURITY_PATH = process.env.LOCKER_SECURITY_PATH || 'locker/security/bans.json';
const TIMEOUT_MS = 5000;
const CACHE_TTL_MS = Number(process.env.SECURITY_BAN_CACHE_MS || 5000);

let cache = { expires: 0, sha: null, bans: [] };

function env(name, value) {
    if (!value) throw new Error(`${name} is not configured.`);
    return value;
}

function repo() {
    return {
        owner: env('LOCKER_GITHUB_OWNER', process.env.LOCKER_GITHUB_OWNER),
        name: env('LOCKER_GITHUB_REPO', process.env.LOCKER_GITHUB_REPO)
    };
}

function branch() { return process.env.LOCKER_GITHUB_BRANCH || 'main'; }
function token() { return env('GITHUB_TOKEN', process.env.GITHUB_TOKEN); }
function headers() {
    return {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token()}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'ZumHub-Security/1.0'
    };
}
function apiUrl(path, query = '') {
    const r = repo();
    return `https://api.github.com/repos/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.name)}/contents/${path}${query}`;
}

async function fetchTimeout(url, opts = {}) {
    const attempts = opts.method && String(opts.method).toUpperCase() !== 'GET' ? 1 : 3;
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const response = await fetch(url, { ...opts, signal: controller.signal });
            if (response.ok || ![429, 502, 503, 504].includes(response.status) || attempt === attempts - 1) return response;
            const retryAfter = Number(response.headers.get('retry-after') || 0);
            const delay = Math.min(750, Math.max(150, retryAfter > 0 ? retryAfter * 1000 : 150 * (attempt + 1)));
            await new Promise(resolve => setTimeout(resolve, delay));
        } catch (e) {
            lastError = e;
            if (attempt === attempts - 1) throw e;
            await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)));
        } finally {
            clearTimeout(timer);
        }
    }
    if (lastError) throw lastError;
    throw new Error('GitHub request failed.');
}

function validIpLike(value) {
    const ip = String(value || '').trim();
    if (!ip || ip.length > 128 || /[\s]/.test(ip)) return false;
    if (ip.includes('/')) {
        const [addr, prefix] = ip.split('/');
        if (!/^\d+$/.test(prefix)) return false;
        const n = Number(prefix);
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(addr)) return n >= 0 && n <= 32;
        if (addr.includes(':')) return n >= 0 && n <= 128;
        return false;
    }
    return /^[0-9a-fA-F:.]+$/.test(ip);
}

function normaliseBan(raw) {
    if (typeof raw === 'string') {
        const ip = raw.trim();
        return validIpLike(ip) ? { ip, reason: 'manual ban', expiresAt: null, createdAt: null } : null;
    }
    if (!raw || typeof raw !== 'object') return null;
    const ip = String(raw.ip || '').trim();
    if (!validIpLike(ip)) return null;
    let expiresAt = null;
    if (raw.expiresAt) {
        const parsed = new Date(raw.expiresAt);
        if (Number.isNaN(parsed.getTime())) return null;
        expiresAt = parsed.toISOString();
    }
    return {
        ip: ip.slice(0, 128),
        reason: String(raw.reason || 'manual ban').slice(0, 500),
        expiresAt,
        createdAt: raw.createdAt ? String(raw.createdAt) : null
    };
}

function sanitiseBans(data) {
    const source = Array.isArray(data) ? data : Array.isArray(data?.bans) ? data.bans : [];
    const out = [];
    for (const entry of source) {
        const ban = normaliseBan(entry);
        if (!ban) continue;
        if (!out.some(x => x.ip === ban.ip)) out.push(ban);
    }
    return out.slice(0, 500);
}

async function readBans({ force = false } = {}) {
    if (!force && Date.now() < cache.expires) return { bans: cache.bans, sha: cache.sha };

    const r = await fetchTimeout(apiUrl(SECURITY_PATH, `?ref=${encodeURIComponent(branch())}`), { headers: headers() });
    if (r.status === 404) {
        cache = { expires: Date.now() + CACHE_TTL_MS, sha: null, bans: [] };
        return { bans: [], sha: null };
    }
    if (!r.ok) throw new Error(`GitHub security read failed (${r.status}).`);
    const data = await r.json();
    let parsed = {};
    try { parsed = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8')); }
    catch { throw new Error('Security ban file is invalid JSON.'); }
    const bans = sanitiseBans(parsed);
    cache = { expires: Date.now() + CACHE_TTL_MS, sha: data.sha, bans };
    return { bans, sha: data.sha };
}

async function saveBans(bans, sha, message = 'security: update IP bans') {
    const safe = sanitiseBans({ bans });
    const content = Buffer.from(JSON.stringify({ v: 1, bans: safe }, null, 2) + '\n').toString('base64');
    const body = { message, content, branch: branch() };
    if (sha) body.sha = sha;

    const r = await fetchTimeout(apiUrl(SECURITY_PATH), {
        method: 'PUT', headers: headers(), body: JSON.stringify(body)
    });
    if (!r.ok) {
        const t = await r.text();
        throw new Error(`GitHub security write failed (${r.status}): ${t.slice(0, 300)}`);
    }
    const data = await r.json();
    cache = { expires: Date.now() + CACHE_TTL_MS, sha: data?.content?.sha || null, bans: safe };
    return { bans: safe, sha: cache.sha };
}

function ipv4ToInt(ip) {
    const parts = String(ip).split('.');
    if (parts.length !== 4 || parts.some(x => !/^\d+$/.test(x))) return null;
    const nums = parts.map(Number);
    if (nums.some(x => x < 0 || x > 255)) return null;
    return (((nums[0] * 256 + nums[1]) * 256 + nums[2]) * 256 + nums[3]) >>> 0;
}

function matchesBan(clientIp, bannedIp) {
    const a = String(clientIp || '').toLowerCase();
    const b = String(bannedIp || '').toLowerCase();
    if (a === b) return true;
    if (!b.includes('/') || !a.includes('.')) return false;

    const [base, prefixRaw] = b.split('/');
    if (!/^\d+$/.test(prefixRaw)) return false;
    const prefix = Number(prefixRaw);
    if (prefix < 0 || prefix > 32) return false;

    const ai = ipv4ToInt(a);
    const bi = ipv4ToInt(base);
    if (ai === null || bi === null) return false;
    if (prefix === 0) return true;
    const mask = (0xffffffff << (32 - prefix)) >>> 0;
    return (ai & mask) === (bi & mask);
}

async function getBanForIp(ip) {
    const { bans } = await readBans();
    const now = Date.now();
    for (const ban of bans) {
        if (ban.expiresAt && new Date(ban.expiresAt).getTime() <= now) continue;
        if (matchesBan(ip, ban.ip)) return ban;
    }
    return null;
}

async function upsertBan({ ip, reason, expiresAt = null }) {
    const normal = normaliseBan({ ip, reason, expiresAt, createdAt: new Date().toISOString() });
    if (!normal) throw new Error('Invalid IP or CIDR.');
    const { bans, sha } = await readBans({ force: true });
    const next = bans.filter(x => x.ip !== normal.ip);
    next.push(normal);
    return saveBans(next, sha, `security: ban ${normal.ip}`);
}

async function removeBan(ip) {
    const target = String(ip || '').trim();
    const { bans, sha } = await readBans({ force: true });
    const next = bans.filter(x => x.ip !== target);
    return saveBans(next, sha, `security: unban ${target}`);
}

module.exports = { readBans, saveBans, getBanForIp, upsertBan, removeBan, matchesBan, SECURITY_PATH };
