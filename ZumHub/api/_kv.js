const mem = new Map();
const TIMEOUT_MS = 1500;

function conf() {
    return {
        url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '',
        token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '',
    };
}

function enabled() {
    const c = conf();
    return !!(c.url && c.token);
}

async function command(args) {
    const c = conf();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const r = await fetch(c.url, {
            method: 'POST',
            signal: ctrl.signal,
            headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(args),
        });
        if (!r.ok) throw new Error(`kv ${r.status}`);
        const data = await r.json();
        if (data.error) throw new Error('kv error');
        return data.result;
    } finally {
        clearTimeout(timer);
    }
}

function sweep(now) {
    if (mem.size < 5000) return;
    for (const [k, v] of mem) if (v.exp <= now) mem.delete(k);
}

// True only for the first caller of a key inside the ttl. Shared across
// instances when Upstash/Vercel KV is configured, per instance otherwise.
async function once(key, ttlSec) {
    if (enabled()) {
        try { return (await command(['SET', key, '1', 'NX', 'EX', String(ttlSec)])) === 'OK'; } catch { /* fall back below */ }
    }
    const now = Date.now();
    sweep(now);
    const hit = mem.get(key);
    if (hit && hit.exp > now) return false;
    mem.set(key, { exp: now + ttlSec * 1000, n: 1 });
    return true;
}

async function incr(key, ttlSec) {
    if (enabled()) {
        try {
            const n = Number(await command(['INCR', key]));
            if (n === 1) await command(['EXPIRE', key, String(ttlSec)]);
            return n;
        } catch { /* fall back below */ }
    }
    const now = Date.now();
    sweep(now);
    const hit = mem.get(key);
    if (!hit || hit.exp <= now) { mem.set(key, { exp: now + ttlSec * 1000, n: 1 }); return 1; }
    hit.n += 1;
    return hit.n;
}

module.exports = { enabled, once, incr };
