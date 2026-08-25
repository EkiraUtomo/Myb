const { encrypt, safeSlug, newAccessKey, hashAccessKey } = require('../locker/crypto');
const { getScript, saveScript, deleteScript, listScripts } = require('./_github');
const { validSession } = require('./_auth');
const { checkAdmin } = require('./_ratelimit');

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Rate limit before auth check
    const rl = checkAdmin(req);
    if (!rl.allowed) {
        res.setHeader('Retry-After', String(rl.resetIn));
        return res.status(429).json({ error: 'too many requests' });
    }

    if (!validSession(req)) return res.status(401).json({ error: 'Authentication required.' });

    try {
        if (req.method === 'GET') {
            const q = String(req.query?.q || '').trim().toLowerCase();
            const items = await listScripts();
            const filtered = q ? items.filter(x => x.slug.toLowerCase().includes(q)) : items;
            return res.json({ ok: true, scripts: filtered.sort((a, b) => a.slug.localeCompare(b.slug)) });
        }

        if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST only' });

        const {
            action = 'upsert', slug, source,
            enabled = true, expiresAt = null,
            description = '', regenerateKey = false
        } = req.body || {};

        if (!safeSlug(slug)) return res.status(400).json({ error: 'Slug must be 2-64 chars: letters, numbers, _ or -.' });

        const current = await getScript(slug);

        if (action === 'delete') {
            if (!current.item) return res.status(404).json({ error: 'Script not found.' });
            await deleteScript(slug, current.sha, `locker: delete ${slug}`);
            return res.json({ ok: true, slug, deleted: true });
        }

        if (typeof source !== 'string' || !source.length) return res.status(400).json({ error: 'Source is required.' });
        if (source.length > 1024 * 1024) return res.status(413).json({ error: 'Source exceeds 1 MiB.' });

        const old = current.item;
        const accessKey = (old?.accessKeyHash && !regenerateKey) ? null : newAccessKey();

        const item = {
            v: 3,
            slug,
            // Encrypt with slug as AAD — ties payload cryptographically to its slug
            payload: encrypt(source, slug),
            accessKeyHash: accessKey ? hashAccessKey(accessKey, slug) : old.accessKeyHash,
            enabled: !!enabled,
            expiresAt: expiresAt || null,
            description: String(description).slice(0, 300),
            updatedAt: new Date().toISOString()
        };

        await saveScript(slug, item, current.sha, `locker: ${old ? 'update' : 'create'} ${slug}`);
        return res.json({
            ok: true, slug,
            regenerated: !!accessKey,
            accessKey: accessKey || null,
            updatedAt: item.updatedAt
        });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message || 'Server error' });
    }
};
