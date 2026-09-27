const { accessKeyOk, safeSlug } = require('../locker/crypto');
const { getScript } = require('./_github');
const { checkRun } = require('./_ratelimit');
const { makeChallenge, normaliseSecurity } = require('./_security');
const { getClientIp } = require('./_ip');
const { getBanForIp } = require('./_security_store');
const { emit } = require('./_telemetry');
const crypto = require('crypto');

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
    const browserHeaders = [
        'sec-fetch-site','sec-fetch-mode','sec-fetch-dest',
        'sec-ch-ua','sec-ch-ua-mobile','sec-ch-ua-platform'
    ];
    if (browserHeaders.some(h => !!req.headers[h])) return true;

    const accept = String(req.headers['accept'] || '').toLowerCase();
    const referer = String(req.headers['referer'] || '');
    const origin = String(req.headers['origin'] || '');
    if (accept.includes('text/html') && (referer || origin || accept.includes('text/html'))) return true;
    return false;
}

function forbidden(res, reason = 'Forbidden') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(403).send(reason);
}

function checkLoaderExpiry(keyParam) {
    const match = String(keyParam || '').match(/^(.+)\.ts(\d+)$/);
    if (!match) return { key: String(keyParam || ''), expired: false };
    const key = match[1];
    const ts = parseInt(match[2], 10);
    const now = Math.floor(Date.now() / 1000);
    const MAX_AGE = 30 * 24 * 60 * 60;
    return { key, expired: now - ts > MAX_AGE };
}

function buildBootstrap({ slug, challenge, scriptVersion }) {
    const verifyUrl = `/api/verify?slug=${encodeURIComponent(slug)}&challenge=${encodeURIComponent(challenge)}`;
    return [
        '-- ZumHub Locker :: verifier bootstrap',
        'do',
        '    if typeof(game) ~= "Instance" or game.ClassName ~= "DataModel" then',
        '        error("ZumHub verification failed: invalid game object", 2)',
        '    end',
        '    if typeof(workspace) ~= "Instance" or workspace.ClassName ~= "Workspace" then',
        '        error("ZumHub verification failed: invalid workspace", 2)',
        '    end',
        '    local function safeCall(fn, ...)',
        '        if type(fn) ~= "function" then return false, nil end',
        '        return pcall(fn, ...)',
        '    end',
        '',
        '    local HttpService = game:GetService("HttpService")',
        '    local Players = game:GetService("Players")',
        '    local RunService = game:GetService("RunService")',
        '',
        '    local function text(v)',
        '        if v == nil then return "" end',
        '        return tostring(v)',
        '    end',
        '',
        '    local function getExecutorName(fn)',
        '        local ok, value = safeCall(fn)',
        '        if ok and type(value) == "string" and #value > 0 then return value end',
        '        return ""',
        '    end',
        '',
        '    local primary = getExecutorName(identifyexecutor)',
        '    local secondary = getExecutorName(getexecutorname)',
        '    local match = (primary ~= "" and secondary ~= "" and primary:lower() == secondary:lower())',
        '',
        '    local caps = {',
        '        identifyexecutor = type(identifyexecutor) == "function",',
        '        getexecutorname = type(getexecutorname) == "function",',
        '        request = type(request) == "function",',
        '        http_request = type(http_request) == "function",',
        '        syn_request = type(syn) == "table" and type(syn.request) == "function",',
        '        getgenv = type(getgenv) == "function",',
        '        hookmetamethod = type(hookmetamethod) == "function",',
        '        getconnections = type(getconnections) == "function",',
        '        getgc = type(getgc) == "function",',
        '    }',
        '',
        '    local gameLoaded = false',
        '    pcall(function() gameLoaded = game:IsLoaded() end)',
        '    local localPlayer = false',
        '    pcall(function() localPlayer = Players.LocalPlayer ~= nil end)',
        '    local running = false',
        '    pcall(function() running = RunService:IsRunning() end)',
        '    local state = {',
        '        gameId = text(game.GameId),',
        '        placeId = text(game.PlaceId),',
        '        runtime = {',
        '            gameType = typeof(game),',
        '            workspaceType = typeof(workspace),',
        '            gameLoaded = gameLoaded,',
        '            runServiceRunning = running,',
        '            localPlayer = localPlayer,',
        '            httpGet = type(game.HttpGet) == "function",',
        '        },',
        '        executor = { primary = primary, secondary = secondary, match = match },',
        '        capabilities = caps,',
        '    }',
        '',
        `    local verify = "${verifyUrl}" .. "&state=" .. HttpService:UrlEncode(HttpService:JSONEncode(state))`,
        '    local ok, result = pcall(function() return game:HttpGet(verify) end)',
        '    if not ok or type(result) ~= "string" or #result < 1 then',
        '        error("ZumHub verification failed", 2)',
        '    end',
        '',
        '    local loader, compileErr = loadstring(result)',
        '    if not loader then error("ZumHub payload rejected: " .. text(compileErr), 2) end',
        '    return loader()',
        'end',
        `-- script-version:${String(scriptVersion || 0)}`,
    ].join('\n');
}

module.exports = async (req, res) => {
    const reqId = crypto.randomBytes(6).toString('hex');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Request-ID', reqId);

    if (req.method !== 'GET') return res.status(405).send('not found');

    const rl = checkRun(req);
    if (!rl.allowed) {
        res.setHeader('Retry-After', String(rl.resetIn));
        const ip = getClientIp(req);
        await emit('rate-limited', { ip, reqId, path: '/api/run' });
        return res.status(429).send('too many requests');
    }

    const slug = String(req.query?.slug || '').toLowerCase().trim();
    const rawKey = String(req.query?.key || '');
    const ua = String(req.headers['user-agent'] || '');
    const ip = getClientIp(req);

    let ban;
    try {
        ban = await getBanForIp(ip);
    } catch (e) {
        console.error(`[security-ban-read-error] rid=${reqId} ip="${ip}" err="${e.message}"`);
        await emit('security-store-error', { ip, reqId, description: 'Unable to read the GitHub-backed ban list; execution was stopped.' });
        return res.status(503).send('security check unavailable');
    }
    if (ban) {
        const reason = `Forbidden: IP banned — ${ban.reason}`;
        await emit('blocked-banned-ip', { ip, slug, reqId, reason, userAgent: ua });
        return forbidden(res, reason);
    }

    if (looksBrowsery(req)) {
        console.log(`[forbidden-browser] rid=${reqId} slug="${slug}" ip="${ip}"`);
        await emit('blocked-browser', { ip, slug, reqId, reason: 'browser-like request', userAgent: ua });
        return forbidden(res, 'Forbidden: browser request blocked');
    }

    if (isBlockedUA(ua)) {
        console.log(`[forbidden-ua] rid=${reqId} slug="${slug}" ip="${ip}" ua="${ua.slice(0,80)}"`);
        await emit('blocked-user-agent', { ip, slug, reqId, reason: 'blocked user-agent', userAgent: ua });
        return forbidden(res, 'Forbidden: request client blocked');
    }

    if (!safeSlug(slug) || !rawKey) return res.status(404).send('not found');

    const { key, expired } = checkLoaderExpiry(rawKey);
    if (expired) {
        await emit('loader-expired', { ip, slug, reqId, reason: 'loader timestamp expired' });
        return res.status(410).send('loader expired');
    }

    try {
        const { item } = await getScript(slug);
        if (!item || !item.enabled) return res.status(404).send('not found');
        if (!accessKeyOk(key, slug, item.accessKeyHash)) {
            await emit('bad-access-key', { ip, slug, reqId, reason: 'invalid access key' });
            return res.status(404).send('not found');
        }
        if (item.expiresAt && Date.now() >= new Date(item.expiresAt).getTime()) {
            await emit('script-expired', { ip, slug, reqId, reason: 'script expired' });
            return res.status(404).send('not found');
        }

        const security = normaliseSecurity(item.security);
        const challenge = makeChallenge({
            slug,
            accessKeyHash: item.accessKeyHash,
            version: item.updatedAt || item.v || 0,
        });

        console.log(`[challenge-issued] rid=${reqId} slug="${slug}" ip="${ip}" security="runtime=${security.requireRuntime},executor=${security.requireExecutorId}"`);
        await emit('execution-start', {
            ip, slug, reqId,
            reason: `challenge issued; runtime=${security.requireRuntime ? 'required' : 'off'}, executor=${security.requireExecutorId ? 'required' : 'off'}`,
            userAgent: ua,
            path: '/api/run'
        });
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.send(buildBootstrap({ slug, challenge, scriptVersion: item.updatedAt || item.v || 0 }));
    } catch (e) {
        console.error(`[run-error] rid=${reqId} slug="${slug}" err="${e.message}"`);
        await emit('run-error', { ip, slug, reqId, reason: e.message, userAgent: ua });
        return res.status(404).send('not found');
    }
};
