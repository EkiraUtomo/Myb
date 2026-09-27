const WEBHOOK_URL = String(process.env.DISCORD_WEBHOOK_URL || '').trim();
const TIMEOUT_MS = 4500;
const recent = new Map();
const { enrich } = require('./_roblox');

function redact(value, max = 500) {
    return String(value ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, max);
}

function field(name, value, inline = true) {
    return {
        name: redact(name, 256),
        value: redact(value || '—', 1024),
        inline,
    };
}

function colour(result) {
    if (result === 'ACCEPTED') return 0x57f287;
    if (result === 'REJECTED' || result === 'BLOCKED') return 0xed4245;
    if (result === 'RATE LIMITED') return 0xfee75c;
    return 0x5865f2;
}

function maskIp(ip) {
    const s = String(ip || 'unknown');
    if (s.includes('.')) {
        const p = s.split('.');
        if (p.length === 4) return `${p[0]}.${p[1]}.${p[2]}.xxx`;
    }
    if (s.includes(':')) return `${s.split(':').slice(0, 3).join(':')}:…`;
    return s;
}

async function postWebhook(payload) {
    if (!WEBHOOK_URL) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        return response.ok || response.status === 204;
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

function classify(event) {
    if (event === 'verify-success') return 'ACCEPTED';
    if (event === 'verify-failed') return 'REJECTED';
    if (event.startsWith('blocked-') || event === 'bad-access-key') return 'BLOCKED';
    if (event === 'rate-limited') return 'RATE LIMITED';
    return 'INFO';
}

async function emit(event, data = {}) {
    if (!WEBHOOK_URL) return false;

    // execution-start is intentionally not sent. Only meaningful security outcomes
    // should reach the Discord channel.
    if (event === 'execution-start') return false;

    const result = classify(event);
    const key = `${event}:${data.ip || 'unknown'}:${data.slug || ''}`;
    const now = Date.now();
    const last = recent.get(key) || 0;
    const dedupeMs = Number(process.env.DISCORD_WEBHOOK_DEDUPE_MS || 5000);
    if (now - last < dedupeMs) return false;
    recent.set(key, now);
    if (recent.size > 1000) {
        for (const [k, t] of recent) {
            if (now - t > dedupeMs * 2) recent.delete(k);
        }
    }

    const d = await enrich(data);
    const u = d.userProfile;
    const g = d.gameProfile;
    const geo = d.geo;
    const fields = [];

    fields.push(field('Script', d.slug));
    fields.push(field('Request ID', d.reqId));

    if (u) {
        fields.push(field('Player', u.displayName || u.username));
        fields.push(field('Username', u.username ? `@${u.username}` : '—'));
        fields.push(field('User ID', u.userId));
        if (u.created) {
            const days = Math.max(0, Math.floor((Date.now() - new Date(u.created).getTime()) / 86400000));
            fields.push(field('Account Age', `${days} days`));
        }
    } else if (d.userId) {
        fields.push(field('User ID', d.userId));
        if (d.playerName) fields.push(field('Username', `@${d.playerName}`));
        if (d.displayName) fields.push(field('Display Name', d.displayName));
    }

    if (g) {
        fields.push(field('Game', g.name, false));
        fields.push(field('Universe ID', g.universeId));
        if (g.rootPlaceId) fields.push(field('Root Place', g.rootPlaceId));
        if (g.creator) fields.push(field('Creator', g.creator));
    } else {
        if (d.gameId) fields.push(field('Universe ID', d.gameId));
    }
    if (d.placeId) fields.push(field('Place ID', d.placeId));

    if (d.executor) fields.push(field('Executor', d.executor));
    if (d.executorSecondary) fields.push(field('Executor #2', d.executorSecondary));
    if (d.capabilities) fields.push(field('Capabilities', d.capabilities, false));

    if (geo) {
        fields.push(field('Location', [geo.city, geo.region, geo.country].filter(Boolean).join(', '), false));
        fields.push(field('Country', geo.countryCode ? `${geo.country} (${geo.countryCode})` : geo.country));
        if (geo.isp) fields.push(field('ISP / ASN', `${geo.isp}${geo.asn ? ` / AS${geo.asn}` : ''}`, false));
    }

    // Explicitly show the full client IP. If you want masking later, set the env back to false.
    const showRawIp = String(process.env.DISCORD_SHOW_RAW_IP || 'true').toLowerCase() === 'true';
    fields.push(field('IP Address', showRawIp ? d.ip : maskIp(d.ip)));

    if (d.reason) fields.push(field('Reason', d.reason, false));
    if (d.fingerprint) fields.push(field('Fingerprint', d.fingerprint));
    if (d.userAgent && String(process.env.DISCORD_SHOW_USER_AGENT || 'false').toLowerCase() === 'true') {
        fields.push(field('User-Agent', d.userAgent, false));
    }

    const checks = d.checks || [];
    if (checks.length) fields.push(field('Verification', checks.join('\n'), false));

    let description;
    if (result === 'ACCEPTED') description = 'Verification passed. Protected script payload was released.';
    else if (result === 'REJECTED') description = 'Verification failed. Protected script payload was NOT released.';
    else if (result === 'BLOCKED') description = 'Request blocked by the security layer. Protected script payload was NOT released.';
    else if (result === 'RATE LIMITED') description = 'Request was rate limited. No protected payload was released.';
    else description = redact(d.description || `Security event: ${event}`, 2000);

    const embed = {
        title: `ZumHub • ${result}`,
        description,
        color: colour(result),
        fields: fields.slice(0, 25),
        footer: { text: 'ZumHub Security • server-observed network data + client-reported Roblox data' },
        timestamp: new Date().toISOString(),
    };

    if (u?.avatarUrl) embed.thumbnail = { url: u.avatarUrl };
    if (g?.iconUrl) embed.image = { url: g.iconUrl };

    const payload = {
        username: process.env.DISCORD_WEBHOOK_USERNAME || 'ZumHub Security',
        allowed_mentions: { parse: [] },
        embeds: [embed],
    };

    const ok = await postWebhook(payload);
    if (!ok) console.warn(`[webhook-failed] event=${event} slug=${redact(d.slug, 64)} ip=${redact(d.ip, 64)}`);
    return ok;
}

module.exports = { emit };
