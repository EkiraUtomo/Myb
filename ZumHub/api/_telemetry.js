const WEBHOOK_URL = String(process.env.DISCORD_WEBHOOK_URL || '').trim();
const TIMEOUT_MS = 4000;
const recent = new Map();

function redact(value, max = 500) {
    return String(value ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, max);
}

function field(name, value, inline = true) {
    return { name: redact(name, 256), value: redact(value || '—', 1024), inline };
}

function colour(event) {
    if (event === 'verify-success') return 0x4ade80;
    if (event.includes('ban') || event.includes('blocked') || event.includes('failed')) return 0xf87171;
    return 0xa07ee0;
}

async function postWebhook(payload) {
    if (!WEBHOOK_URL) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const r = await fetch(WEBHOOK_URL, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return r.ok || r.status === 204;
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

async function emit(event, data = {}) {
    if (!WEBHOOK_URL) return false;

    // Prevent one noisy client from hammering a single webhook during a hot Vercel instance.
    const key = `${event}:${data.ip || 'unknown'}:${data.slug || ''}`;
    const now = Date.now();
    const last = recent.get(key) || 0;
    const dedupeMs = Number(process.env.DISCORD_WEBHOOK_DEDUPE_MS || 5000);
    if (now - last < dedupeMs) return false;
    recent.set(key, now);
    if (recent.size > 1000) {
        for (const [k, t] of recent) if (now - t > dedupeMs * 2) recent.delete(k);
    }

    const fields = [
        field('IP', data.ip || 'unknown'),
        field('Script', data.slug || 'unknown'),
        field('Request ID', data.reqId || '—'),
    ];

    if (data.reason) fields.push(field('Reason', data.reason, false));
    if (data.gameId) fields.push(field('Game ID', data.gameId));
    if (data.placeId) fields.push(field('Place ID', data.placeId));
    if (data.executor) fields.push(field('Executor', data.executor));
    if (data.executorSecondary) fields.push(field('Executor #2', data.executorSecondary));
    if (data.fingerprint) fields.push(field('Fingerprint', data.fingerprint));
    if (data.capabilities) fields.push(field('Capabilities', data.capabilities, false));
    if (data.userAgent) fields.push(field('User-Agent', data.userAgent, false));
    if (data.path) fields.push(field('Path', data.path, false));

    const payload = {
        username: process.env.DISCORD_WEBHOOK_USERNAME || 'ZumHub Security',
        allowed_mentions: { parse: [] },
        embeds: [{
            title: `ZumHub • ${redact(event, 80)}`,
            description: data.description ? redact(data.description, 2000) : undefined,
            color: colour(event),
            fields: fields.slice(0, 25),
            footer: { text: 'ZumHub security telemetry' },
            timestamp: new Date().toISOString()
        }]
    };

    const ok = await postWebhook(payload);
    if (!ok) console.warn(`[webhook-failed] event=${event} slug=${redact(data.slug, 64)} ip=${redact(data.ip, 64)}`);
    return ok;
}

function currentEvents() {
    return [];
}

module.exports = { emit, currentEvents };
