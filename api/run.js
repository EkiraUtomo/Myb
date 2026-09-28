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
    const h = req.headers || {};
    const browserHeaders = [
        'sec-fetch-site','sec-fetch-mode','sec-fetch-dest',
        'sec-ch-ua','sec-ch-ua-mobile','sec-ch-ua-platform'
    ];
    if (browserHeaders.some(name => !!h[name])) return true;

    const accept = String(h.accept || '').toLowerCase();
    const referer = String(h.referer || '');
    const origin = String(h.origin || '');
    if (accept.includes('text/html') && (referer || origin || accept.includes('text/html'))) return true;
    return false;
}

function forbidden(res, reason = 'Forbidden') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
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

function buildBootstrap({ req, reqId, slug, challenge, scriptVersion }) {
    const proto = String(req?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim();
    const configuredOrigin = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
    const origin = configuredOrigin || (host ? `${proto}://${host}` : '');
    if (!origin) throw new Error('Unable to determine public origin');

    const verifyEndpoint = `${origin}/api/verify`;
    const verifyGetBase = `${verifyEndpoint}?slug=${encodeURIComponent(slug)}&challenge=${encodeURIComponent(challenge)}&rid=${encodeURIComponent(reqId || '')}`;
    const luaString = value => JSON.stringify(String(value ?? ''));

    return [
        '-- ZumHub Locker :: V11 verifier bootstrap',
        'do',
        '    local function notify(title, message, duration)',
        '        title = tostring(title or "ZumHub")',
        '        message = tostring(message or "")',
        '        duration = tonumber(duration) or 5',
        '        local sent = false',
        '        pcall(function()',
        '            local StarterGui = game:GetService("StarterGui")',
        '            for _ = 1, 5 do',
        '                local ok = pcall(function() StarterGui:SetCore("SendNotification", {Title = title, Text = message, Duration = duration}) end)',
        '                if ok then sent = true break end',
        '                task.wait(0.25)',
        '            end',
        '        end)',
        '        if not sent then pcall(function() warn("[ZumHub] " .. title .. ": " .. message) end) end',
        '    end',
        '',
        '    local function text(v)',
        '        if v == nil then return "" end',
        '        return tostring(v)',
        '    end',
        '',
        '    local function safeCall(fn, ...)',
        '        if type(fn) ~= "function" then return false, nil end',
        '        return pcall(fn, ...)',
        '    end',
        '',
        '    notify("ZumHub", "Verifying execution...", 3)',
        '',
        '    if typeof(game) ~= "Instance" or game.ClassName ~= "DataModel" then',
        '        error("ZumHub verification failed: invalid game runtime", 2)',
        '    end',
        '    if typeof(workspace) ~= "Instance" or workspace.ClassName ~= "Workspace" then',
        '        error("ZumHub verification failed: invalid workspace runtime", 2)',
        '    end',
        '',
        '    local HttpService = game:GetService("HttpService")',
        '    local Players = game:GetService("Players")',
        '    local RunService = game:GetService("RunService")',
        '',
        '    local primary = ""',
        '    local secondary = ""',
        '    safeCall(function()',
        '        if type(identifyexecutor) == "function" then primary = text(identifyexecutor()) end',
        '        if type(getexecutorname) == "function" then secondary = text(getexecutorname()) end',
        '    end)',
        '    local executorMatch = primary ~= "" and secondary ~= "" and primary:lower() == secondary:lower()',
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
        '    local running = false',
        '    pcall(function() running = RunService:IsRunning() end)',
        '',
        '    local localPlayer = false',
        '    local playerUserId, playerName, playerDisplayName = "", "", ""',
        '    pcall(function()',
        '        local p = Players.LocalPlayer',
        '        localPlayer = p ~= nil',
        '        if p then',
        '            playerUserId = text(p.UserId)',
        '            playerName = text(p.Name)',
        '            playerDisplayName = text(p.DisplayName)',
        '        end',
        '    end)',
        '',
        '    local state = {',
        '        clientNonce = text(HttpService:GenerateGUID(false)),',
        '        userId = playerUserId,',
        '        playerName = playerName,',
        '        displayName = playerDisplayName,',
        '        gameId = text(game.GameId),',
        '        placeId = text(game.PlaceId),',
        '        jobId = text(game.JobId),',
        '        runtime = {',
        '            gameType = typeof(game),',
        '            workspaceType = typeof(workspace),',
        '            gameLoaded = gameLoaded,',
        '            runServiceRunning = running,',
        '            localPlayer = localPlayer,',
        '            httpGet = type(game.HttpGet) == "function",',
        '        },',
        '        executor = { primary = primary, secondary = secondary, match = executorMatch },',
        '        capabilities = caps,',
        '    }',
        '',
        '    local stateJson = HttpService:JSONEncode(state)',
        `    local requestBody = HttpService:JSONEncode({slug = ${luaString(slug)}, challenge = ${luaString(challenge)}, rid = ${luaString(reqId)}, state = state})`,
        '',
        '    local function tryExecutorRequest()',
        '        local fn = nil',
        '        if type(request) == "function" then fn = request',
        '        elseif type(http_request) == "function" then fn = http_request',
        '        elseif type(syn) == "table" and type(syn.request) == "function" then fn = syn.request end',
        '        if not fn then return nil end',
        '        local ok, response = pcall(function()',
        `            return fn({Url = ${luaString(verifyEndpoint)}, Method = "POST", Headers = { ["Content-Type"] = "application/json", ["Accept"] = "application/json" }, Body = requestBody})`,
        '        end)',
        '        if not ok or type(response) ~= "table" then return nil end',
        '        return text(response.Body or response.body)',
        '    end',
        '',
        '    local result = tryExecutorRequest()',
        '    if not result or #result < 1 then',
        `        local verify = ${luaString(verifyGetBase)} .. "&state=" .. HttpService:UrlEncode(stateJson)`,
        '        local ok, body = pcall(function() return game:HttpGet(verify) end)',
        '        if not ok or type(body) ~= "string" or #body < 1 then',
        `            notify("ZumHub • Verification Failed", "The verification request was rejected or unavailable. Execute the loader again.\nRequest ID: " .. ${luaString(reqId)}, 8)`,
        '            error("ZumHub verification request failed", 2)',
        '        end',
        '        result = body',
        '    end',
        '',
        '    local response',
        '    local decodeOk = pcall(function() response = HttpService:JSONDecode(result) end)',
        '    if not decodeOk or type(response) ~= "table" then',
        `            notify("ZumHub • Verification Failed", "The verification request was rejected or unavailable. Execute the loader again.\nRequest ID: " .. ${luaString(reqId)}, 8)`,
        '        error("ZumHub invalid verification response", 2)',
        '    end',
        '',
        '    if response.ok ~= true or response.result ~= "ACCEPTED" then',
        '        local rid = text(response.requestId)',
        `            notify("ZumHub • Verification Failed", "The verification request was rejected or unavailable. Execute the loader again.\nRequest ID: " .. ${luaString(reqId)}, 8)`,
        '        error("ZumHub verification rejected", 2)',
        '    end',
        '',
        '    local payload = text(response.payload)',
        '    if payload == "" then',
        '        notify("ZumHub • Execution Failed", "Authorization succeeded but no payload was returned.\nRequest ID: " .. text(response.requestId), 10)',
        '        error("ZumHub accepted verification but returned an empty payload", 2)',
        '    end',
        '',
        '    notify("ZumHub • Verified", "Security verification passed. Starting script...", 4)',
        '    local loader, compileErr = loadstring(payload)',
        '    if not loader then',
        '        notify("ZumHub • Script Error", "The protected payload could not compile.\n" .. text(compileErr):sub(1, 700), 10)',
        '        error("ZumHub payload compile failed: " .. text(compileErr), 2)',
        '    end',
        '    local runOk, runErr = xpcall(loader, function(err) return debug.traceback(text(err), 2) end)',
        '    if not runOk then',
        '        notify("ZumHub • Script Error", "The protected script raised an error.\n" .. text(runErr):sub(1, 800), 10)',
        '        error("ZumHub protected script error: " .. text(runErr), 2)',
        '    end',
        '    return true',
        'end',
        `-- script-version:${String(scriptVersion || '')}`,
    ].join('\n');
}

async function issueBootstrap(req, res, options = {}) {
    const publicSlugRoute = options.publicSlugRoute === true;
    const reqId = crypto.randomBytes(8).toString('hex');

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Security-Policy', "default-src 'none'");
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('X-Request-ID', reqId);

    if (req.method !== 'GET') return res.status(405).send('not found');

    const rl = checkRun(req);
    if (!rl.allowed) {
        res.setHeader('Retry-After', String(rl.resetIn));
        const ip = getClientIp(req);
        await emit('rate-limited', { ip, reqId, path: publicSlugRoute ? '/l/:slug' : '/api/run' });
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
        await emit('security-store-error', { ip, reqId, slug, description: 'Unable to read the GitHub-backed ban list; execution was stopped.' });
        return res.status(503).send('security check unavailable');
    }
    if (ban) {
        const reason = `Forbidden: IP banned — ${ban.reason}`;
        await emit('blocked-banned-ip', { ip, slug, reqId, reason, userAgent: ua, path: publicSlugRoute ? `/l/${slug}` : '/api/run' });
        return forbidden(res, reason);
    }

    if (looksBrowsery(req)) {
        await emit('blocked-browser', { ip, slug, reqId, reason: 'browser-like request', userAgent: ua, path: publicSlugRoute ? `/l/${slug}` : '/api/run' });
        return forbidden(res, 'Forbidden: browser request blocked');
    }

    if (isBlockedUA(ua)) {
        await emit('blocked-user-agent', { ip, slug, reqId, reason: 'blocked user-agent', userAgent: ua, path: publicSlugRoute ? `/l/${slug}` : '/api/run' });
        return forbidden(res, 'Forbidden: request client blocked');
    }

    if (!safeSlug(slug)) return res.status(404).send('not found');

    let key = rawKey;
    if (!publicSlugRoute) {
        if (!rawKey) return res.status(404).send('not found');
        const checked = checkLoaderExpiry(rawKey);
        if (checked.expired) {
            await emit('loader-expired', { ip, slug, reqId, reason: 'loader timestamp expired' });
            return res.status(410).send('loader expired');
        }
        key = checked.key;
    }

    try {
        const { item } = await getScript(slug);
        if (!item || !item.enabled) return res.status(404).send('not found');

        if (!publicSlugRoute && !accessKeyOk(key, slug, item.accessKeyHash)) {
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
            ip,
            executorOnly: publicSlugRoute,
            reqId,
        });

        console.log(`[challenge-issued] rid=${reqId} slug="${slug}" ip="${ip}" path=${publicSlugRoute ? '/l/:slug' : '/api/run'} security="runtime=${security.requireRuntime},executor=${security.requireExecutorId},presence=${security.requireRobloxPresence},executorOnly=${publicSlugRoute}"`);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.send(buildBootstrap({ req, reqId, slug, challenge, scriptVersion: item.updatedAt || item.v || 0 }));
    } catch (e) {
        console.error(`[run-error] rid=${reqId} slug="${slug}" err="${e.message}"`);
        await emit('run-error', { ip, slug, reqId, reason: e.message, userAgent: ua, path: publicSlugRoute ? `/l/${slug}` : '/api/run' });
        return res.status(404).send('not found');
    }
}

module.exports = issueBootstrap;
module.exports.issueBootstrap = issueBootstrap;
module.exports.apiHandler = async (req, res) => issueBootstrap(req, res, { publicSlugRoute: false });
