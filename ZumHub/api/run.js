const { decrypt, accessKeyOk, safeSlug } = require('../locker/crypto');
const { getScript } = require('./_github');
const { checkRun } = require('./_ratelimit');

// ── ENVIRONMENT FINGERPRINTING ──
// Roblox HttpService sends a very specific set of headers
// Browsers and scrapers always leak extra headers that Roblox never sends

// Headers that browsers/scrapers always include but Roblox HttpService never does
const BROWSER_HEADERS = [
    'accept-language',   // browsers always send this, Roblox never does
    'sec-fetch-site',    // browser fetch API metadata
    'sec-fetch-mode',
    'sec-fetch-dest',
    'sec-ch-ua',         // Chrome user-agent client hints
    'sec-ch-ua-mobile',
    'sec-ch-ua-platform',
    'upgrade-insecure-requests',
    'dnt',
    'origin',            // CORS preflight — real executor fetches don't do CORS
];

// Scrapers and testing tools — block these entirely
const BLOCKED_UA = [
    'python-requests', 'python-urllib', 'curl/', 'wget/', 'axios/',
    'go-http-client', 'java/', 'ruby/', 'php/', 'perl/',
    'scrapy', 'postman', 'insomnia', 'httpie', 'libwww-perl',
    'lwp-', 'mechanize', 'okhttp', 'node-fetch', 'undici',
    'got/', 'superagent', 'request/', 'aiohttp', 'httpx'
];

function looksBrowsery(req) {
    // Check for browser-only headers
    for (const h of BROWSER_HEADERS) {
        if (req.headers[h]) return true;
    }
    // Browsers always send Accept with text/html
    const accept = req.headers['accept'] || '';
    if (accept.includes('text/html')) return true;
    return false;
}

function isBlockedUA(ua) {
    if (!ua) return true; // no UA at all = definitely not a real executor
    const low = ua.toLowerCase();
    return BLOCKED_UA.some(b => low.includes(b));
}

// The "fuck you" response — served to anything that isn't a real executor
function fuckYou(res) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(
        '-- nice try :)\n' +
        '-- this script is protected by ZumHub Locker\n' +
        '-- you\'re not getting anything here lmao\n' +
        '-- go outside\n' +
        'print("\\240\\159\\96\\128 DoggoJr says: fuck you skidder")\n' +
        'error("access denied")'
    );
}

// Honeypot slug decoy — convincing fake script to waste skidder time
function honeypot(res) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send([
        '-- ZumHub :: Universal Script v2.4',
        'local Players = game:GetService("Players")',
        'local lp = Players.LocalPlayer',
        'local char = lp.Character or lp.CharacterAdded:Wait()',
        'local hum = char:WaitForChild("Humanoid")',
        'local rs = game:GetService("RunService")',
        '',
        'hum.WalkSpeed = 50',
        'hum.JumpPower = 100',
        '',
        'rs.RenderStepped:Connect(function()',
        '    if lp.Character then',
        '        lp.Character:FindFirstChild("Humanoid").Health = 100',
        '    end',
        'end)',
        '',
        'print("[ZumHub] loaded")',
    ].join('\n'));
}

// Wrap the real script with a Roblox environment check
// If someone somehow gets the source and tries to run it outside Roblox, it kills itself
function wrapWithEnvCheck(source) {
    return [
        '-- ZumHub Locker :: protected script',
        'if not game or not workspace or not game.GetService then',
        '    error("\\240\\159\\96\\128 DoggoJr says: fuck you skidder", 2)',
        'end',
        'local ok, svc = pcall(function() return game:GetService("RunService") end)',
        'if not ok or not svc then',
        '    error("invalid environment", 2)',
        'end',
        'if not svc:IsRunning() then',
        '    error("invalid environment", 2)',
        'end',
        '-- payload',
        source,
    ].join('\n');
}

const HONEYPOT_SLUGS = new Set([
    'test', 'admin', 'free', 'hack', 'script', 'op', 'sample',
    'demo', 'scripts', 'gui', 'inf', 'kill', 'esp', 'fly'
]);

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('Referrer-Policy', 'no-referrer');

    if (req.method !== 'GET') return res.status(405).send('not found');

    // Rate limit before doing any real work
    const rl = checkRun(req);
    if (!rl.allowed) {
        res.setHeader('Retry-After', String(rl.resetIn));
        return res.status(429).send('too many requests');
    }

    const slug = String(req.query?.slug || '').toLowerCase();
    const key  = String(req.query?.key  || '');
    const ua   = req.headers['user-agent'] || '';
    const ip   = (req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();

    if (!safeSlug(slug) || !key) return res.status(404).send('not found');

    // Block scrapers by UA
    if (isBlockedUA(ua)) {
        console.log(`[blocked-ua] slug="${slug}" ip="${ip}" ua="${ua.slice(0,80)}"`);
        return fuckYou(res);
    }

    // Block anything that looks like a browser (has browser-only headers)
    if (looksBrowsery(req)) {
        console.log(`[blocked-browser] slug="${slug}" ip="${ip}" ua="${ua.slice(0,80)}"`);
        return fuckYou(res);
    }

    // Honeypot slugs — convincing fake response, log it
    if (HONEYPOT_SLUGS.has(slug)) {
        console.log(`[honeypot] slug="${slug}" ip="${ip}" ua="${ua.slice(0,80)}"`);
        return honeypot(res);
    }

    try {
        const { item } = await getScript(slug);

        // All real failures look identical — never leak whether slug exists
        if (!item)                                         return res.status(404).send('not found');
        if (!item.enabled)                                 return res.status(404).send('not found');
        if (!accessKeyOk(key, slug, item.accessKeyHash))  return res.status(404).send('not found');
        if (item.expiresAt && Date.now() >= new Date(item.expiresAt).getTime())
                                                           return res.status(404).send('not found');

        const source = decrypt(item.payload, slug);

        // Wrap with in-script Roblox environment check
        const final = wrapWithEnvCheck(source);

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.send(final);

    } catch (e) {
        console.error('[run error]', e.message);
        return res.status(404).send('not found');
    }
};
