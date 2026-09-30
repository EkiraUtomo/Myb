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

function notificationSource(title, message, code) {
    const t = luaEscape(title);
    const m = luaEscape(message);
    const c = luaEscape(code);
    return `do
    local title = "${t}"
    local message = "${m}"
    local code = "${c}"

    local function warnFallback()
        pcall(function() warn("[ZumHub] " .. title .. " | " .. code .. "\\n" .. message) end)
    end

    local shown = false
    pcall(function()
        local StarterGui = game:GetService("StarterGui")
        for _ = 1, 8 do
            local ok = pcall(function()
                StarterGui:SetCore("SendNotification", {
                    Title = title,
                    Text = message,
                    Duration = 12
                })
            end)
            if ok then shown = true break end
            task.wait(0.35)
        end
    end)

    pcall(function()
        local CoreGui = game:GetService("CoreGui")
        local old = CoreGui:FindFirstChild("ZumHubAccessNotice")
        if old then old:Destroy() end

        local gui = Instance.new("ScreenGui")
        gui.Name = "ZumHubAccessNotice"
        gui.ResetOnSpawn = false
        gui.IgnoreGuiInset = true
        gui.ZIndexBehavior = Enum.ZIndexBehavior.Global
        gui.DisplayOrder = 1000000
        gui.Parent = CoreGui

        local shade = Instance.new("Frame")
        shade.Size = UDim2.fromScale(1, 1)
        shade.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
        shade.BackgroundTransparency = 0.32
        shade.BorderSizePixel = 0
        shade.Parent = gui

        local card = Instance.new("Frame")
        card.AnchorPoint = Vector2.new(0.5, 0.5)
        card.Position = UDim2.fromScale(0.5, 0.5)
        card.Size = UDim2.new(0.86, 0, 0, 190)
        card.BackgroundColor3 = Color3.fromRGB(18, 18, 23)
        card.BorderSizePixel = 0
        card.Parent = gui

        local corner = Instance.new("UICorner")
        corner.CornerRadius = UDim.new(0, 14)
        corner.Parent = card

        local stroke = Instance.new("UIStroke")
        stroke.Color = Color3.fromRGB(248, 113, 113)
        stroke.Thickness = 2
        stroke.Parent = card

        local titleLabel = Instance.new("TextLabel")
        titleLabel.BackgroundTransparency = 1
        titleLabel.Position = UDim2.new(0, 18, 0, 18)
        titleLabel.Size = UDim2.new(1, -36, 0, 34)
        titleLabel.Font = Enum.Font.GothamBold
        titleLabel.TextSize = 21
        titleLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
        titleLabel.TextXAlignment = Enum.TextXAlignment.Left
        titleLabel.Text = title
        titleLabel.Parent = card

        local body = Instance.new("TextLabel")
        body.BackgroundTransparency = 1
        body.Position = UDim2.new(0, 18, 0, 60)
        body.Size = UDim2.new(1, -36, 0, 78)
        body.Font = Enum.Font.Gotham
        body.TextSize = 15
        body.TextColor3 = Color3.fromRGB(205, 205, 212)
        body.TextWrapped = true
        body.TextYAlignment = Enum.TextYAlignment.Top
        body.TextXAlignment = Enum.TextXAlignment.Left
        body.Text = message
        body.Parent = card

        local codeLabel = Instance.new("TextLabel")
        codeLabel.BackgroundTransparency = 1
        codeLabel.Position = UDim2.new(0, 18, 1, -38)
        codeLabel.Size = UDim2.new(1, -36, 0, 22)
        codeLabel.Font = Enum.Font.Code
        codeLabel.TextSize = 12
        codeLabel.TextColor3 = Color3.fromRGB(150, 150, 160)
        codeLabel.TextXAlignment = Enum.TextXAlignment.Left
        codeLabel.Text = "ZumHub Locker • " .. code
        codeLabel.Parent = card

        task.delay(12, function()
            pcall(function() gui:Destroy() end)
        end)
        shown = true
    end)

    if not shown then warnFallback() end
end`;
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
        res.setHeader('X-ZumHub-Loader-Error', 'ip-banned');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(notificationSource('ZumHub • ACCESS DENIED', 'This network address is blocked by the ZumHub security layer.\\nNo protected script payload was released.', 'ip-banned'));
    }

    if (looksBrowsery(req) || isBlockedUA(ua)) {
        res.setHeader('X-ZumHub-Loader-Error', 'client-blocked');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(notificationSource('ZumHub • ACCESS DENIED', 'This request client is not allowed to use the Roblox loader.\\nRun the loader from Roblox instead of a browser or HTTP tool.', 'client-blocked'));
    }

    if (!safeSlug(slug)) {
        await emit('loader-preflight-failed', { ip, slug, reqId, reason: 'invalid slug', userAgent: ua });
        res.setHeader('X-ZumHub-Loader-Error', 'invalid-slug');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(notificationSource('ZumHub • INVALID SCRIPT', `The script slug "${slug || '(empty)'}" is invalid or does not exist.\\nCheck the loader you copied and get the latest loader from the ZumHub admin panel.`, 'invalid-slug'));
    }

    if (!rawKey) {
        await emit('loader-preflight-failed', { ip, slug, reqId, reason: 'missing access key', userAgent: ua });
        res.setHeader('X-ZumHub-Loader-Error', 'missing-key');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(notificationSource('ZumHub • ACCESS DENIED', `No access key was supplied for "${slug}".\\nThis loader is incomplete. Copy the complete loader from the ZumHub admin panel.`, 'missing-key'));
    }

    const { key, expired } = checkLoaderExpiry(rawKey);
    if (expired) {
        await emit('loader-preflight-failed', { ip, slug, reqId, reason: 'loader expired', userAgent: ua });
        res.setHeader('X-ZumHub-Loader-Error', 'loader-expired');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(notificationSource('ZumHub • LOADER EXPIRED', `Your loader for "${slug}" is too old.\\nGenerate or copy a fresh loader from the ZumHub admin panel.`, 'loader-expired'));
    }

    try {
        const { item } = await getScript(slug);
        if (!item || !item.enabled) {
            await emit('loader-preflight-failed', { ip, slug, reqId, reason: 'invalid slug or disabled script', userAgent: ua });
            res.setHeader('X-ZumHub-Loader-Error', 'invalid-slug');
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.status(200).send(notificationSource('ZumHub • SCRIPT UNAVAILABLE', `The script "${slug}" was not found or is currently disabled.\\nCheck the slug or get the current loader from the ZumHub admin panel.`, 'invalid-slug'));
        }

        if (!accessKeyOk(key, slug, item.accessKeyHash)) {
            await emit('loader-preflight-failed', { ip, slug, reqId, reason: 'invalid access key', userAgent: ua });
            res.setHeader('X-ZumHub-Loader-Error', 'invalid-key');
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.status(200).send(notificationSource('ZumHub • ACCESS DENIED', `The access key for "${slug}" is invalid or no longer active.\\nIf the script was updated or the key was regenerated, your old loader will not work.\\nGet the latest loader from the ZumHub admin panel.`, 'invalid-key'));
        }

        if (item.expiresAt && Date.now() >= new Date(item.expiresAt).getTime()) {
            await emit('loader-preflight-failed', { ip, slug, reqId, reason: 'script expired', userAgent: ua });
            res.setHeader('X-ZumHub-Loader-Error', 'script-expired');
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.status(200).send(notificationSource('ZumHub • SCRIPT EXPIRED', `The script "${slug}" has expired.\\nAsk the owner for an updated loader or an active script version.`, 'script-expired'));
        }

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(executionSource(req, slug, rawKey));
    } catch (e) {
        console.error(`[loader-error] rid=${reqId} slug="${slug}" err="${e.message}"`);
        await emit('loader-error', { ip, slug, reqId, reason: e.message, userAgent: ua });
        return res.status(500).send('internal server error');
    }
};
