const { encrypt, decrypt, safeSlug, newAccessKey, hashAccessKey } = require('../locker/crypto');
const { getScript, saveScript, deleteScript, listScripts } = require('./_github');
const { validSession } = require('./_auth');
const { checkAdmin } = require('./_ratelimit');
const { normaliseSecurity } = require('./_security');

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
            const slugParam = String(req.query?.slug || '').trim().toLowerCase();
            if (slugParam) {
                if (!safeSlug(slugParam)) return res.status(400).json({ error: 'invalid slug' });
                const { item } = await getScript(slugParam);
                if (!item) return res.status(404).json({ error: 'Script not found.' });

                let source = '';
                try {
                    source = decrypt(item.payload, slugParam);
                } catch {
                    source = '';
                }

                return res.json({
                    ok: true,
                    script: {
                        slug: slugParam,
                        source,
                        enabled: item.enabled !== false,
                        expiresAt: item.expiresAt || null,
                        description: String(item.description || ''),
                        security: normaliseSecurity(item.security),
                        updatedAt: item.updatedAt || null,
                    }
                });
            }

            const q = String(req.query?.q || '').trim().toLowerCase();
            const items = await listScripts();
            const filtered = q ? items.filter(x => x.slug.toLowerCase().includes(q)) : items;
            return res.json({ ok: true, scripts: filtered.sort((a, b) => a.slug.localeCompare(b.slug)) });
        }

        if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST only' });

        const {
            action = 'upsert', slug, source,
            enabled = true, expiresAt = null,
            description = '', regenerateKey = false,
            security = null,
        } = req.body || {};

        if (!safeSlug(slug)) return res.status(400).json({ error: 'Slug must be 2-64 chars: letters, numbers, _ or -.' });

        const current = await getScript(slug);

        if (action === 'delete') {
            if (!current.item) return res.status(404).json({ error: 'Script not found.' });
            await deleteScript(slug, current.sha, `locker: delete ${slug}`);
            return res.json({ ok: true, slug, deleted: true });
        }

        const old = current.item;
        const wantsNewSource = typeof source === 'string' && source.length > 0;

        if (!wantsNewSource && !(regenerateKey && old)) {
            return res.status(400).json({ error: 'Source is required.' });
        }

        if (wantsNewSource && source.length > 1024 * 1024) {
            return res.status(413).json({ error: 'Source exceeds 1 MiB.' });
        }

        const accessKey = (old?.accessKeyHash && !regenerateKey) ? null : newAccessKey();
        const securityConfig = security === null
            ? normaliseSecurity(old?.security)
            : normaliseSecurity(security);

        const payload = wantsNewSource
            ? encrypt(source, slug)
            : old.payload;

        const item = {
            v: 4,
            slug,
            payload,
            accessKeyHash: accessKey ? hashAccessKey(accessKey, slug) : old.accessKeyHash,
            enabled: !!enabled,
            expiresAt: expiresAt || null,
            description: String(description).slice(0, 300),
            security: securityConfig,
            updatedAt: new Date().toISOString()
        };

        await saveScript(slug, item, current.sha, `locker: ${old ? 'update' : 'create'} ${slug}`);
        return res.json({
            ok: true,
            slug,
            regenerated: !!accessKey,
            accessKey: accessKey || null,
            updatedAt: item.updatedAt,
            security: securityConfig,
        });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message || 'Server error' });
    }
};
