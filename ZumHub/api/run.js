const { decrypt, accessKeyOk, safeSlug } = require('../locker/crypto');
const { getScript } = require('./_github');
const { checkRun } = require('./_ratelimit');
const crypto = require('crypto');

const BLOCKED_UA = [
    'python-requests','python-urllib','curl/','wget/','axios/',
    'go-http-client','java/','ruby/','php/','perl/',
    'scrapy','postman','insomnia','httpie','libwww-perl',
    'lwp-','mechanize','okhttp','node-fetch','undici',
    'got/','superagent','request/','aiohttp','httpx','pycurl',
];

const BROWSER_HEADERS = [
    'accept-language','sec-fetch-site','sec-fetch-mode','sec-fetch-dest',
    'sec-ch-ua','sec-ch-ua-mobile','sec-ch-ua-platform',
    'upgrade-insecure-requests','dnt','origin',
];

const HONEYPOT_SLUGS = new Set([
    'test','admin','free','hack','script','op','sample',
    'demo','scripts','gui','inf','kill','esp','fly','aimbot',
    'wallhack','rce','exploit','bypass','key','cheat',
]);

function isBlockedUA(ua) {
    if (!ua) return true;
    const low = ua.toLowerCase();
    return BLOCKED_UA.some(b => low.includes(b));
}

function looksBrowsery(req) {
    for (const h of BROWSER_HEADERS) {
        if (req.headers[h]) return true;
    }
    const accept = req.headers['accept'] || '';
    if (accept.includes('text/html')) return true;
    return false;
}

function fuckYou(res) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(
        '-- nice try :)\n' +
        '-- this script is protected by ZumHub Locker\n' +
        '-- you\'re not getting anything here lmao\n' +
        'print("\\240\\159\\150\\128 DoggoJr says: nice try skidder")\n' +
        'error("access denied", 2)'
    );
}

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

function wrapWithEnvCheck(source) {
    return [
        '-- ZumHub Locker :: protected script',
        'do',
        '    local _ok = pcall(function()',
        '        assert(type(game) == "userdata", "invalid env")',
        '        assert(type(workspace) == "userdata", "invalid env")',
        '        local rs = game:GetService("RunService")',
        '        assert(rs:IsRunning(), "invalid env")',
        '    end)',
        '    if not _ok then',
        '        error("\\240\\159\\150\\128 DoggoJr says: nice try", 2)',
        '    end',
        'end',
        source,
    ].join('\n');
}

// Verify loader URL hasn't expired via a timestamp embedded in the key query param
// Format: key.timestamp (base64url encoded timestamp appended)
// This is optional — if no timestamp found, fall through to normal key check
function checkLoaderExpiry(keyParam) {
    // timestamps are appended as .ts{unixSeconds} suffix
    const match = keyParam.match(/^(.+)\.ts(\d+)$/);
    if (!match) return { key: keyParam, expired: false };
    const key = match[1];
    const ts = parseInt(match[2], 10);
    const now = Math.floor(Date.now() / 1000);
    // loader links expire after 30 days by default
    const MAX_AGE = 30 * 24 * 60 * 60;
    return { key, expired: (now - ts) > MAX_AGE };
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
        return res.status(429).send('too many requests');
    }

    const slug = String(req.query?.slug || '').toLowerCase().trim();
    const rawKey = String(req.query?.key || '');
    const ua = req.headers['user-agent'] || '';
    const ip = (req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();

    if (!safeSlug(slug) || !rawKey) return res.status(404).send('not found');

    if (isBlockedUA(ua)) {
        console.log(`[blocked-ua] rid=${reqId} slug="${slug}" ip="${ip}" ua="${ua.slice(0,80)}"`);
        return fuckYou(res);
    }

    if (looksBrowsery(req)) {
        console.log(`[blocked-browser] rid=${reqId} slug="${slug}" ip="${ip}"`);
        return fuckYou(res);
    }

    if (HONEYPOT_SLUGS.has(slug)) {
        console.log(`[honeypot] rid=${reqId} slug="${slug}" ip="${ip}" ua="${ua.slice(0,80)}"`);
        return honeypot(res);
    }

    // Check loader expiry
    const { key, expired } = checkLoaderExpiry(rawKey);
    if (expired) {
        console.log(`[expired-loader] rid=${reqId} slug="${slug}" ip="${ip}"`);
        return res.status(410).send('loader expired');
    }

    try {
        const { item } = await getScript(slug);
        if (!item)                                        return res.status(404).send('not found');
        if (!item.enabled)                                return res.status(404).send('not found');
        if (!accessKeyOk(key, slug, item.accessKeyHash)) return res.status(404).send('not found');
        if (item.expiresAt && Date.now() >= new Date(item.expiresAt).getTime())
                                                          return res.status(404).send('not found');

        const source = decrypt(item.payload, slug);
        const final = wrapWithEnvCheck(source);

        console.log(`[script-served] rid=${reqId} slug="${slug}" ip="${ip}"`);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.send(final);

    } catch (e) {
        console.error(`[run-error] rid=${reqId} slug="${slug}" err="${e.message}"`);
        return res.status(404).send('not found');
    }
};
