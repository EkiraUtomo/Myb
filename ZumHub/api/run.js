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

function buildBootstrap({ req, reqId, slug, challenge, scriptVersion }) {
    const proto = String(req?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim();
    const configuredOrigin = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
    const origin = configuredOrigin || (host ? `${proto}://${host}` : '');
    if (!origin) throw new Error('Unable to determine public origin');
    const verifyUrl = `${origin}/api/verify?slug=${encodeURIComponent(slug)}&challenge=${encodeURIComponent(challenge)}&rid=${encodeURIComponent(reqId || '')}`;
    return [
        '-- ZumHub Locker :: verifier bootstrap',
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
        '                task.wait(0.35)',
        '            end',
        '        end)',
        '        if not sent then pcall(function() warn("[ZumHub] " .. title .. ": " .. message) end) end',
        '    end',
        '    notify("ZumHub", "Verifying execution...", 3)',
        '',
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
        '    local playerUserId, playerName, playerDisplayName = "", "", ""',
        '    pcall(function()',
        '        local p = Players.LocalPlayer',
        '        localPlayer = p ~= nil',
        '        if p then playerUserId = text(p.UserId); playerName = text(p.Name); playerDisplayName = text(p.DisplayName) end',
        '    end)',
        '    local running = false',
        '    pcall(function() running = RunService:IsRunning() end)',
        '    local state = {',
        '        userId = playerUserId,',
        '        playerName = playerName,',
        '        displayName = playerDisplayName,',
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
        '        local raw = text(result)',
        '        notify("ZumHub • Verification Failed", "Could not contact the verification server. Try executing the loader again.\n" .. raw:sub(1, 180), 8)',
        '        error("ZumHub verification request failed: " .. (raw ~= "" and raw or "HTTP request failed"), 2)',
        '    end',
        '',
        '    local response',
        '    local decodeOk, decodeErr = pcall(function() response = HttpService:JSONDecode(result) end)',
        '    if not decodeOk or type(response) ~= "table" then',
        '        notify("ZumHub • Verification Failed", "The server returned an invalid verification response.\n" .. text(decodeErr):sub(1, 160), 8)',
        '        error("ZumHub invalid verification response: " .. text(decodeErr), 2)',
        '    end',
        '',
        '    if response.ok ~= true or response.result ~= "ACCEPTED" then',
        '        local reason = text((response.reason and response.reason ~= "") and response.reason or "verification-failed")',
        '        local details = response.details',
        '        local detailText = ""',
        '        if type(details) == "table" then detailText = table.concat(details, "\n") else detailText = text(details) end',
        '        local checks = response.checks',
        '        local checkText = ""',
        '        if type(checks) == "table" then checkText = table.concat(checks, " | " ) end',
        '        local message = "Reason: " .. reason .. "\n" .. detailText',
        '        if checkText ~= "" then message = message .. "\n\nChecks: " .. checkText end',
        '        notify("ZumHub • Verification Failed", message:sub(1, 950), 10)',
        '        error("ZumHub verification rejected: " .. reason .. " | " .. detailText, 2)',
        '    end',
        '',
        '    notify("ZumHub • Verified", "All security checks passed. Starting script...", 4)',
        '    local payload = text(response.payload)',
        '    if payload == "" then',
        '        notify("ZumHub • Execution Failed", "Verification was accepted, but the server returned an empty payload.\nRequest ID: " .. text(response.requestId), 10)',
        '        error("ZumHub accepted verification but returned an empty payload", 2)',
        '    end',
        '',
        '    local loader, compileErr = loadstring(payload)',
        '    if not loader then',
        '        notify("ZumHub • Script Error", "The protected payload could not compile.\n" .. text(compileErr):sub(1, 700), 10)',
        '        error("ZumHub payload rejected: " .. text(compileErr), 2)',
        '    end',
        '    local runOk, runErr = xpcall(loader, function(err) return debug.traceback(text(err), 2) end)',
        '    if not runOk then',
        '        notify("ZumHub • Script Error", "The protected script started but raised an error.\n" .. text(runErr):sub(1, 800), 10)',
        '        error("ZumHub protected script error: " .. text(runErr), 2)',
        '    end',
        '    return runOk',
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
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.send(buildBootstrap({ req, reqId, slug, challenge, scriptVersion: item.updatedAt || item.v || 0 }));
    } catch (e) {
        console.error(`[run-error] rid=${reqId} slug="${slug}" err="${e.message}"`);
        await emit('run-error', { ip, slug, reqId, reason: e.message, userAgent: ua });
        return res.status(404).send('not found');
    }
};
