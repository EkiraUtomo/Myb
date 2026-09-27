const { decrypt, safeSlug } = require('../locker/crypto');
const { getScript } = require('./_github');
const { checkRun } = require('./_ratelimit');
const { verifyChallenge, normaliseSecurity, normaliseSignals, fingerprint, firstFailures } = require('./_security');
const { getClientIp } = require('./_ip');
const { getBanForIp } = require('./_security_store');
const { emit } = require('./_telemetry');

function forbidden(res, reason = 'Forbidden') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(403).send(reason);
}

const BLOCKED_UA = [
    'python-requests','python-urllib','curl/','wget/','axios/',
    'go-http-client','java/','ruby/','php/','perl/',
    'scrapy','postman','insomnia','httpie','libwww-perl',
    'lwp-','mechanize','okhttp','node-fetch','undici',
    'got/','superagent','request/','aiohttp','httpx','pycurl',
];

function isBrowserLike(req) {
    const ua = String(req.headers['user-agent'] || '').toLowerCase();
    if (BLOCKED_UA.some(x => ua.includes(x))) return true;
    if (['sec-fetch-site','sec-fetch-mode','sec-fetch-dest','sec-ch-ua','sec-ch-ua-mobile','sec-ch-ua-platform']
        .some(h => !!req.headers[h])) return true;
    return String(req.headers['accept'] || '').toLowerCase().includes('text/html');
}

function verificationChecks(security, signals, failures) {
    const failed = new Set(failures);
    const checks = [];
    const add=(name,bad)=>checks.push(`${bad?'✗':'✓'} ${name}`);
    if(security.requireRuntime){
        add('Game object', failed.has('game-type')); add('Workspace', failed.has('workspace-type')); add('Game loaded', failed.has('game-not-loaded')); add('Runtime running', failed.has('runtime-not-running')); add('Local player', failed.has('local-player-missing')); add('HttpGet', failed.has('httpget-missing'));
    }
    if(security.requireExecutorId) add('Executor identifier', failed.has('executor-id-missing'));
    if(security.gameIds.length) add('Universe/Game policy', failed.has('game-id'));
    if(security.placeIds.length) add('Place policy', failed.has('place-id'));
    if(security.allowedExecutors.length) add('Executor allowlist', failed.has('executor-not-allowed'));
    for(const c of security.requiredCapabilities) add(`Capability: ${c}`, failed.has(`capability:${c}`));
    if(signals.executor.primary && signals.executor.secondary) add('Executor identifiers match', failed.has('executor-id-mismatch'));
    return checks;
}

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('Referrer-Policy', 'no-referrer');

    if (req.method !== 'GET') return res.status(405).send('not found');

    const ip = getClientIp(req);
    const reqId = String(req.headers['x-request-id'] || Math.random().toString(36).slice(2));
    const ua = String(req.headers['user-agent'] || '');
    const slug = String(req.query?.slug || '').toLowerCase().trim();

    const rl = checkRun(req);
    if (!rl.allowed) {
        res.setHeader('Retry-After', String(rl.resetIn));
        await emit('rate-limited', { ip, slug, reqId, path: '/api/verify' });
        return res.status(429).send('too many requests');
    }

    let ban;
    try {
        ban = await getBanForIp(ip);
    } catch (e) {
        console.error(`[security-ban-read-error] rid=${reqId} ip="${ip}" err="${e.message}"`);
        await emit('security-store-error', { ip, slug, reqId, description: 'Unable to read the GitHub-backed ban list; verification was stopped.' });
        return res.status(503).send('security check unavailable');
    }
    if (ban) {
        const reason = `Forbidden: IP banned — ${ban.reason}`;
        await emit('blocked-banned-ip', { ip, slug, reqId, reason, userAgent: ua, path: '/api/verify' });
        return forbidden(res, reason);
    }

    if (isBrowserLike(req)) {
        await emit('blocked-browser', { ip, slug, reqId, reason: 'browser-like verification request', userAgent: ua, path: '/api/verify' });
        return forbidden(res, 'Forbidden: browser request blocked');
    }

    const challenge = String(req.query?.challenge || '');
    const stateParam = String(req.query?.state || '');
    if (!safeSlug(slug) || !challenge || !stateParam) return res.status(404).send('not found');

    const challengeData = verifyChallenge(challenge);
    if (!challengeData || challengeData.slug !== slug) return res.status(404).send('not found');

    let suppliedState;
    try {
        suppliedState = JSON.parse(decodeURIComponent(stateParam));
    } catch {
        try {
            suppliedState = JSON.parse(stateParam);
        } catch {
            await emit('verify-failed', { ip, slug, reqId, reason: 'invalid state payload', userAgent: ua });
            return forbidden(res, 'verification failed: invalid state payload');
        }
    }

    const signals = normaliseSignals(suppliedState);
    try {
        const { item } = await getScript(slug);
        if (!item || !item.enabled) return res.status(404).send('not found');
        if (challengeData.accessKeyHash !== item.accessKeyHash) return res.status(404).send('not found');
        if (challengeData.scriptVersion !== (item.updatedAt || item.v || 0)) {
            await emit('verify-failed', { ip, slug, reqId, reason: 'script version changed; challenge expired' });
            return forbidden(res, 'verification expired: script version changed');
        }
        if (item.expiresAt && Date.now() >= new Date(item.expiresAt).getTime()) return res.status(404).send('not found');

        const security = normaliseSecurity(item.security);
        const failures = firstFailures(security, signals);
        const fp = fingerprint(signals);
        const executor = signals.executor.primary || signals.executor.secondary || 'unknown';
        const capabilities = Object.entries(signals.capabilities).filter(([,v]) => v).map(([k]) => k).join(', ') || 'none';

        console.log(`[verify] rid=${reqId} slug="${slug}" ip="${ip}" fp=${fp.slice(0,16)} game="${signals.gameId}" place="${signals.placeId}" executor="${executor}" failures=${failures.join(',') || 'none'}`);

        if (failures.length) {
            const reason = failures.join(', ');
            await emit('verify-failed', {
                ip, slug, reqId, reason,
                userId: signals.userId, playerName: signals.playerName, displayName: signals.displayName,
                gameId: signals.gameId, placeId: signals.placeId,
                executor: signals.executor.primary, executorSecondary: signals.executor.secondary,
                fingerprint: fp, capabilities, checks: verificationChecks(security, signals, failures)
            });
            return forbidden(res, `verification failed: ${reason}`);
        }

        await emit('verify-success', {
            ip, slug, reqId, reason: 'all configured verification checks passed',
            userId: signals.userId, playerName: signals.playerName, displayName: signals.displayName,
            gameId: signals.gameId, placeId: signals.placeId,
            executor: signals.executor.primary, executorSecondary: signals.executor.secondary,
            fingerprint: fp, capabilities, checks: verificationChecks(security, signals, failures)
        });

        const source = decrypt(item.payload, slug);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', 'inline');
        return res.send(source);
    } catch (e) {
        console.error(`[verify-error] rid=${reqId} slug="${slug}" err="${e.message}"`);
        await emit('verify-error', { ip, slug, reqId, reason: e.message, userAgent: ua });
        return res.status(404).send('not found');
    }
};
