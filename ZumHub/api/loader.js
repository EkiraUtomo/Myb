const { accessKeyOk, safeSlug } = require('../locker/crypto');
const { getScript } = require('./_github');
const { checkRun } = require('./_ratelimit');
const { getClientIp } = require('./_ip');
const { getBanForIp } = require('./_security_store');
const { emit } = require('./_telemetry');

const BLOCKED_UA = [
    'python-requests','python-urllib','curl/','wget/','axios/',
    'go-http-client','java/','ruby/','php/','perl/',
    'scrapy','postman','insomnia','httpie','libwww-perl',
    'lwp-','mechanize','okhttp','node-fetch','undici',
    'got/','superagent','request/','aiohttp','httpx','pycurl',
];

function isBlockedUA(ua) {
    const low = String(ua || '').toLowerCase();
    return !!low && BLOCKED_UA.some(b => low.includes(b));
}

function looksBrowsery(req) {
    const browserHeaders = ['sec-fetch-site','sec-fetch-mode','sec-fetch-dest','sec-ch-ua','sec-ch-ua-mobile','sec-ch-ua-platform'];
    if (browserHeaders.some(h => !!req.headers[h])) return true;
    const accept = String(req.headers['accept'] || '').toLowerCase();
    const referer = String(req.headers['referer'] || '');
    const origin = String(req.headers['origin'] || '');
    return accept.includes('text/html') && (referer || origin || accept.includes('text/html'));
}

function checkLoaderExpiry(keyParam) {
    const match = String(keyParam || '').match(/^(.+)\.ts(\d+)$/);
    if (!match) return { key: String(keyParam || ''), expired: false };
    const key = match[1];
    const ts = parseInt(match[2], 10);
    const now = Math.floor(Date.now() / 1000);
    return { key, expired: now - ts > 30 * 24 * 60 * 60 };
}

function luaEscape(v) {
    return String(v ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '').replace(/\n/g, '\\n');
}

function forbidden(res, reason = 'Forbidden', code = 'forbidden', extra = {}) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('X-ZumHub-Loader-Error', code);
    return res.status(403).send(JSON.stringify({
        ok: false,
        status: 403,
        error: code,
        message: reason,
        ...extra
    }));
}

function executionSource(req, slug, key) {
    const proto = String(req?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim();
    const configuredOrigin = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
    const origin = configuredOrigin || (host ? `${proto}://${host}` : '');
    if (!origin) throw new Error('Unable to determine public origin');
    const runUrl = `${origin}/api/run?slug=${encodeURIComponent(slug)}&key=${encodeURIComponent(key)}`;
    return `do
    local function notify(title, message, duration)
        pcall(function()
            local StarterGui = game:GetService("StarterGui")
            for _ = 1, 6 do
                local ok = pcall(function() StarterGui:SetCore("SendNotification", {Title = title, Text = message, Duration = duration or 7}) end)
                if ok then return end
                task.wait(0.3)
            end
        end)
        pcall(function() warn("[ZumHub] " .. tostring(title) .. " | " .. tostring(message)) end)
    end

    notify("ZumHub • Script Found", "Script: ${luaEscape(slug)}\\nSource: ZumHub Locker → /api/loader → /api/run", 5)

    local ok, result = pcall(function()
        return game:HttpGet("${luaEscape(runUrl)}")
    end)
    if not ok or type(result) ~= "string" or #result < 1 then
        notify("ZumHub • Access Denied", "The execution endpoint rejected this loader.\\nYour key may have expired, been regenerated, or the script may have been disabled.\\nGet the latest loader from the ZumHub admin panel.", 12)
        error("ZumHub execution endpoint rejected the loader", 2)
    end

    local loader, compileErr = loadstring(result)
    if not loader then
        notify("ZumHub • Loader Error", "The execution bootstrap could not compile.\\n" .. tostring(compileErr):sub(1, 500), 12)
        error("ZumHub loader compile error: " .. tostring(compileErr), 2)
    end
    return loader()
end`;
}

module.exports = async (req, res) => {
    const reqId = Math.random().toString(36).slice(2, 14);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Request-ID', reqId);

    if (req.method !== 'GET') return res.status(405).send('not found');

    const rl = checkRun(req);
    if (!rl.allowed) return res.status(429).send('too many requests');

    const ip = getClientIp(req);
    const ua = String(req.headers['user-agent'] || '');
    const slug = String(req.query?.slug || '').toLowerCase().trim();
    const rawKey = String(req.query?.key || '');

    let ban;
    try {
        ban = await getBanForIp(ip);
    } catch {
        return res.status(503).send('security check unavailable');
    }
    if (ban) {
        await emit('blocked-banned-ip', { ip, slug, reqId, reason: `IP banned — ${ban.reason}`, userAgent: ua, path: '/api/loader' });
        return forbidden(res, 'This network address is blocked by the ZumHub security layer.', 'ip-banned');
    }

    if (looksBrowsery(req) || isBlockedUA(ua)) {
        return forbidden(res, 'This request client is not allowed to use the Roblox loader.', 'client-blocked');
    }

    if (!safeSlug(slug)) {
        await emit('loader-preflight-failed', { ip, slug, reqId, reason: 'invalid slug', userAgent: ua });
        return forbidden(res, `The script slug "${slug || '(empty)'}" is invalid or does not exist.`, 'invalid-slug', { slug: slug || null });
    }

    if (!rawKey) {
        await emit('loader-preflight-failed', { ip, slug, reqId, reason: 'missing access key', userAgent: ua });
        return forbidden(res, `No access key was supplied for "${slug}".`, 'missing-key', { slug });
    }

    const { key, expired } = checkLoaderExpiry(rawKey);
    if (expired) {
        await emit('loader-preflight-failed', { ip, slug, reqId, reason: 'loader expired', userAgent: ua });
        return forbidden(res, `Your loader for "${slug}" is too old. Generate or copy a fresh loader from the ZumHub admin panel.`, 'loader-expired', { slug });
    }

    try {
        const { item } = await getScript(slug);
        if (!item || !item.enabled) {
            await emit('loader-preflight-failed', { ip, slug, reqId, reason: 'invalid slug or disabled script', userAgent: ua });
            return forbidden(res, `The script "${slug}" was not found or is currently disabled.`, 'invalid-slug', { slug });
        }

        if (!accessKeyOk(key, slug, item.accessKeyHash)) {
            await emit('loader-preflight-failed', { ip, slug, reqId, reason: 'invalid access key', userAgent: ua });
            return forbidden(res, `The access key for "${slug}" is invalid or no longer active.`, 'invalid-key', { slug });
        }

        if (item.expiresAt && Date.now() >= new Date(item.expiresAt).getTime()) {
            await emit('loader-preflight-failed', { ip, slug, reqId, reason: 'script expired', userAgent: ua });
            return forbidden(res, `The script "${slug}" has expired.`, 'script-expired', { slug });
        }

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(executionSource(req, slug, rawKey));
    } catch (e) {
        console.error(`[loader-error] rid=${reqId} slug="${slug}" err="${e.message}"`);
        await emit('loader-error', { ip, slug, reqId, reason: e.message, userAgent: ua });
        return res.status(500).send('internal server error');
    }
};
