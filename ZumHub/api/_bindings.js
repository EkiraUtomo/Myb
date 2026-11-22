const crypto = require('crypto');
const { safeSlug } = require('../locker/crypto');

const TIMEOUT_MS = 6000;
const TOUCH_MS = 10 * 60 * 1000;
const CACHE_MS = 20 * 1000;
const cache = new Map();

function cfg() {
    const owner = process.env.LOCKER_GITHUB_OWNER;
    const name = process.env.LOCKER_GITHUB_REPO;
    const token = process.env.GITHUB_TOKEN;
    if (!owner || !name || !token) throw new Error('GitHub vault is not configured.');
    return { owner, name, token, branch: process.env.LOCKER_GITHUB_BRANCH || 'main' };
}

function fileUrl(c, slug) {
    return `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.name)}/contents/locker/bindings/${slug}.json`;
}

function headers(c) {
    return {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${c.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'ZumHub-Locker/3.0',
    };
}

async function timed(url, opts) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try { return await fetch(url, { ...opts, signal: ctrl.signal }); } finally { clearTimeout(timer); }
}

function clientRef(clientId) {
    if (!clientId) return '';
    const key = crypto.createHmac('sha256', 'zumhub-client-ref').update(String(process.env.LOCKER_MASTER_SECRET || '')).digest();
    return crypto.createHmac('sha256', key).update(String(clientId)).digest('hex').slice(0, 32);
}

async function readBindings(slug, { force = false } = {}) {
    if (!safeSlug(slug)) throw new Error('bad slug');
    const hit = cache.get(slug);
    if (!force && hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const c = cfg();
    const r = await timed(`${fileUrl(c, slug)}?ref=${encodeURIComponent(c.branch)}`, { headers: headers(c) });
    let value;
    if (r.status === 404) value = { data: { v: 1, slug, entries: [] }, sha: null };
    else if (!r.ok) throw new Error(`bindings read failed (${r.status})`);
    else {
        const j = await r.json();
        const data = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8'));
        if (!data || !Array.isArray(data.entries)) throw new Error('bindings file malformed');
        value = { data, sha: j.sha };
    }
    cache.set(slug, { at: Date.now(), value });
    return value;
}

async function writeBindings(slug, data, sha) {
    const c = cfg();
    const body = {
        message: `locker: bindings for ${slug}`,
        content: Buffer.from(JSON.stringify(data, null, 2) + '\n').toString('base64'),
        branch: c.branch,
    };
    if (sha) body.sha = sha;
    const r = await timed(fileUrl(c, slug), { method: 'PUT', headers: headers(c), body: JSON.stringify(body) });
    if (r.status === 409 || r.status === 422) return { conflict: true };
    if (!r.ok) throw new Error(`bindings write failed (${r.status})`);
    const j = await r.json();
    cache.set(slug, { at: Date.now(), value: { data, sha: j?.content?.sha || null } });
    return { conflict: false };
}

function matches(entry, mode, userId, ref) {
    if (mode === 'user') return entry.u === userId;
    if (mode === 'client') return entry.c === ref;
    return entry.u === userId && entry.c === ref;
}

// Fails closed: a store problem rejects instead of releasing the payload.
async function checkAndBind({ slug, mode, max, userId, clientId }) {
    if (mode === 'off') return { ok: true, bound: false };
    const ref = clientRef(clientId);
    if ((mode === 'client' || mode === 'both') && !ref) return { ok: false, reason: 'client-id-missing' };
    if ((mode === 'user' || mode === 'both') && !userId) return { ok: false, reason: 'user-id-missing' };

    try {
        for (let attempt = 0; attempt < 3; attempt++) {
            const { data, sha } = await readBindings(slug, { force: attempt > 0 });
            const now = Date.now();
            const found = data.entries.find(e => matches(e, mode, userId, ref));
            if (found) {
                if (now - new Date(found.last || 0).getTime() > TOUCH_MS) {
                    found.last = new Date(now).toISOString();
                    found.n = (found.n || 0) + 1;
                    const w = await writeBindings(slug, data, sha).catch(() => ({ conflict: false }));
                    if (w.conflict) continue;
                }
                return { ok: true, bound: true, created: false, count: data.entries.length };
            }
            if (data.entries.length >= max) return { ok: false, reason: 'identity-limit-reached', count: data.entries.length };

            data.entries.push({ u: userId || '', c: ref, first: new Date(now).toISOString(), last: new Date(now).toISOString(), n: 1 });
            const w = await writeBindings(slug, data, sha);
            if (w.conflict) continue;
            return { ok: true, bound: true, created: true, count: data.entries.length };
        }
        return { ok: false, reason: 'binding-store-busy' };
    } catch (e) {
        console.error(`[bindings] ${String(e.message || e).slice(0, 200)}`);
        return { ok: false, reason: 'binding-store-unavailable' };
    }
}

async function listBindings(slug) {
    const { data } = await readBindings(slug, { force: true });
    return data.entries.map((e, i) => ({ index: i, userId: e.u || '', client: e.c ? e.c.slice(0, 10) : '', first: e.first, last: e.last, uses: e.n || 0 }));
}

async function removeBinding(slug, index) {
    for (let attempt = 0; attempt < 3; attempt++) {
        const { data, sha } = await readBindings(slug, { force: true });
        if (!Number.isInteger(index) || index < 0 || index >= data.entries.length) throw new Error('no such binding');
        data.entries.splice(index, 1);
        const w = await writeBindings(slug, data, sha);
        if (!w.conflict) return data.entries.length;
    }
    throw new Error('binding store busy, try again');
}

async function resetBindings(slug) {
    for (let attempt = 0; attempt < 3; attempt++) {
        const { data, sha } = await readBindings(slug, { force: true });
        data.entries = [];
        const w = await writeBindings(slug, data, sha);
        if (!w.conflict) return;
    }
    throw new Error('binding store busy, try again');
}

module.exports = { checkAndBind, listBindings, removeBinding, resetBindings, clientRef };
