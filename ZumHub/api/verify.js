const { decrypt, safeSlug } = require('../locker/crypto');
const { getScript } = require('./_github');
const { verifyChallenge, consumeChallenge, normaliseSecurity, normaliseSignals, fingerprint, firstFailures, isBlockedUA } = require('./_security');
const { checkVerifyShared } = require('./_ratelimit');
const { placeBelongsToUniverse, userExists } = require('./_roblox');
const { checkAndBind, clientRef } = require('./_bindings');
const { getClientIp } = require('./_ip');
const { getBanForIp } = require('./_security_store');
const { emit } = require('./_telemetry');

function detailedFailureReason(code, security, signals) {
    const value = String(code || 'verification-failed');
    if (value === 'game-type') return `Game object check failed: expected a Roblox DataModel Instance, received ${signals.runtime.gameType || 'unknown'}.`;
    if (value === 'workspace-type') return `Workspace check failed: expected a Roblox Workspace Instance, received ${signals.runtime.workspaceType || 'unknown'}.`;
    if (value === 'game-not-loaded') return 'Game load check failed: game:IsLoaded() returned false.';
    if (value === 'runtime-not-running') return 'Runtime check failed: RunService:IsRunning() returned false.';
    if (value === 'local-player-missing') return 'LocalPlayer check failed: Players.LocalPlayer was not available.';
    if (value === 'httpget-missing') return 'HTTP check failed: game.HttpGet was not available as a function.';
    if (value === 'executor-id-missing') return 'Executor check failed: neither identifyexecutor() nor getexecutorname() returned a usable identifier.';
    if (value === 'executor-id-mismatch') return `Executor identifier mismatch: identifyexecutor()=${signals.executor.primary || 'empty'}; getexecutorname()=${signals.executor.secondary || 'empty'}.`;
    if (value === 'game-id') return `Universe/Game policy failed: received GameId ${signals.gameId || 'empty'}; allowed GameIds: ${security.gameIds.join(', ') || 'none configured'}.`;
    if (value === 'place-id') return `Place policy failed: received PlaceId ${signals.placeId || 'empty'}; allowed PlaceIds: ${security.placeIds.join(', ') || 'none configured'}.`;
    if (value === 'executor-not-allowed') return `Executor allowlist failed: received ${signals.executor.primary || signals.executor.secondary || 'unknown'}; allowed executors: ${security.allowedExecutors.join(', ') || 'none configured'}.`;
    if (value === 'user-id-missing') return 'Identity check failed: no Roblox user id was reported.';
    if (value === 'client-id-missing') return 'Identity check failed: no client identifier was reported.';
    if (value === 'user-not-allowed') return `Identity allowlist failed: user ${signals.userId || 'unknown'} is not permitted for this script.`;
    if (value === 'account-too-new') return `Account age check failed: reported ${signals.accountAgeDays === null ? 'nothing' : signals.accountAgeDays + ' days'}; ${security.minAccountAgeDays} days required.`;
    if (value === 'user-not-found') return `Roblox lookup failed: user id ${signals.userId} does not exist.`;
    if (value === 'place-universe-mismatch') return `Roblox lookup failed: place ${signals.placeId} does not belong to universe ${signals.gameId}.`;
    if (value === 'identity-limit-reached') return `Key binding failed: this key is already bound to ${security.maxBindings} other identit${security.maxBindings === 1 ? 'y' : 'ies'}.`;
    if (value === 'binding-store-unavailable' || value === 'binding-store-busy') return 'Key binding could not be checked right now, so the payload was withheld. Try again shortly.';
    if (value.startsWith('capability:')) {
        const capability = value.slice('capability:'.length);
        return `Capability check failed: required capability "${capability}" was not reported by the runtime.`;
    }
    return `Verification failed at check "${value}".`;
}

function detailedFailureReasonList(failures, security, signals) {
    return failures.map(code => `${code}: ${detailedFailureReason(code, security, signals)}`);
}

function forbidden(res, reason = 'Forbidden') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(403).send(reason);
}

function clientResult(res, body, status = 200) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline');
    return res.status(status).send(JSON.stringify(body));
}

function isBrowserLike(req) {
    if (isBlockedUA(req.headers['user-agent'])) return true;
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
    if(security.allowedUserIds.length) add('User allowlist', failed.has('user-not-allowed'));
    if(security.minAccountAgeDays>0) add('Account age', failed.has('account-too-new'));
    if(security.requireClientId||security.bindMode==='client'||security.bindMode==='both') add('Client identifier', failed.has('client-id-missing'));
    if(failed.has('user-not-found')||failed.has('place-universe-mismatch')) add('Roblox cross-check', true);
    if(security.bindMode!=='off') add('Key binding', ['identity-limit-reached','binding-store-unavailable','binding-store-busy'].some(c=>failed.has(c)));
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
    const ridIn = String(req.query?.rid || req.headers['x-request-id'] || '');
    const reqId = /^[a-zA-Z0-9]{6,32}$/.test(ridIn) ? ridIn : Math.random().toString(36).slice(2);
    const ua = String(req.headers['user-agent'] || '');
    let slug = String(req.query?.slug || '').toLowerCase().trim();

    const rl = await checkVerifyShared(req);
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
    if (!challengeData || challengeData.slug.toLowerCase() !== slug) {
        const reason = 'invalid-or-expired-session';
        const details = ['The signed execution session is invalid, expired, or was not issued by this ZumHub deployment. Execute a fresh loader.'];
        await emit('verify-failed', { ip, slug, reqId, reason, details, userAgent: ua });
        return clientResult(res, { ok: false, result: 'REJECTED', reason, details, requestId: reqId }, 200);
    }

    let suppliedState;
    try {
        suppliedState = JSON.parse(decodeURIComponent(stateParam));
    } catch {
        try {
            suppliedState = JSON.parse(stateParam);
        } catch {
            const reason = 'invalid-state-payload';
            const details = ['The Roblox bootstrap sent a state payload that could not be decoded as JSON.'];
            await emit('verify-failed', { ip, slug, reqId, reason, details, userAgent: ua });
            return clientResult(res, { ok: false, reason, details, requestId: reqId }, 200);
        }
    }

    slug = challengeData.slug;
    const signals = normaliseSignals(suppliedState);

    // Consume the signed capability before any asynchronous work. This closes the
    // replay window where two requests could otherwise validate the same ticket.
    const consumed = await consumeChallenge(challenge, ip, ua);
    if (!consumed.ok) {
        const reason = consumed.reason || 'session-already-consumed';
        const details = reason === 'session-network-mismatch'
            ? ['The execution session was issued for a different network address. Execute a fresh loader.']
            : reason === 'session-client-mismatch'
            ? ['The execution session was issued to a different HTTP client. Execute a fresh loader.']
            : ['This execution session has already been consumed or expired. Execute a fresh loader to obtain a new session.'];
        await emit('verify-failed', {
            ip, slug, reqId, reason, details, userId: signals.userId, playerName: signals.playerName,
            displayName: signals.displayName, gameId: signals.gameId, placeId: signals.placeId,
            executor: signals.executor.primary, executorSecondary: signals.executor.secondary
        });
        return clientResult(res, { ok: false, result: 'REJECTED', reason, details, requestId: reqId }, 200);
    }

    try {
        const { item } = await getScript(slug);
        if (!item || !item.enabled) return res.status(404).send('not found');
        if (challengeData.accessKeyHash !== item.accessKeyHash) return res.status(404).send('not found');
        if (challengeData.scriptVersion !== (item.updatedAt || item.v || 0)) {
            const reason = 'challenge-expired';
            const details = ['The script changed after the challenge was issued, so the challenge is no longer valid. Execute a fresh loader.'];
            await emit('verify-failed', { ip, slug, reqId, reason, details });
            return clientResult(res, { ok: false, reason, details, requestId: reqId }, 200);
        }
        if (item.expiresAt && Date.now() >= new Date(item.expiresAt).getTime()) return res.status(404).send('not found');

        const security = normaliseSecurity(item.security);
        const failures = firstFailures(security, signals);

        if (!failures.length && String(process.env.VERIFY_ROBLOX_CROSSCHECK || 'on').toLowerCase() !== 'off') {
            const [exists, placeOk] = await Promise.all([
                signals.userId ? userExists(signals.userId) : Promise.resolve(null),
                signals.placeId && signals.gameId ? placeBelongsToUniverse(signals.placeId, signals.gameId) : Promise.resolve(null),
            ]);
            if (exists === false) failures.push('user-not-found');
            if (placeOk === false) failures.push('place-universe-mismatch');
        }

        if (!failures.length && security.bindMode !== 'off') {
            const bound = await checkAndBind({
                slug, mode: security.bindMode, max: security.maxBindings,
                userId: signals.userId, clientId: signals.clientId,
            });
            if (!bound.ok) failures.push(bound.reason);
        }
        const fp = fingerprint(signals);
        const executor = signals.executor.primary || signals.executor.secondary || 'unknown';
        const capabilities = Object.entries(signals.capabilities).filter(([,v]) => v).map(([k]) => k).join(', ') || 'none';

        console.log(`[verify] rid=${reqId} slug="${slug}" ip="${ip}" fp=${fp.slice(0,16)} game="${signals.gameId}" place="${signals.placeId}" executor="${executor}" failures=${failures.join(',') || 'none'}`);

        if (failures.length) {
            const reason = failures.join(', ');
            const details = detailedFailureReasonList(failures, security, signals);
            const checks = verificationChecks(security, signals, failures);
            await emit('verify-failed', {
                ip, slug, reqId, reason,
                userId: signals.userId, playerName: signals.playerName, displayName: signals.displayName,
                gameId: signals.gameId, placeId: signals.placeId,
                executor: signals.executor.primary + (signals.executor.version ? ' ' + signals.executor.version : ''), executorSecondary: signals.executor.secondary,
                clientRef: clientRef(signals.clientId), accountAgeDays: signals.accountAgeDays,
                fingerprint: fp, capabilities, checks, details
            });
            return clientResult(res, {
                ok: false,
                result: 'REJECTED',
                reason,
                details,
                checks,
                requestId: reqId
            }, 200);
        }

        const checks = verificationChecks(security, signals, failures);
        let source;
        try {
            source = decrypt(item.payload, slug);
        } catch (decryptError) {
            const reason = 'payload-decrypt-failed';
            const details = [`The server authorized the execution context, but the protected payload could not be decrypted: ${String(decryptError.message || decryptError).slice(0, 300)}`];
            await emit('verify-error', {
                ip, slug, reqId, reason, details,
                userId: signals.userId, playerName: signals.playerName, displayName: signals.displayName,
                gameId: signals.gameId, placeId: signals.placeId,
                executor: signals.executor.primary, executorSecondary: signals.executor.secondary,
                fingerprint: fp, capabilities, checks
            });
            return clientResult(res, { ok: false, result: 'REJECTED', reason, details, checks, requestId: reqId }, 200);
        }

        const successDetails = ['All configured runtime, executor, game/place, and capability checks passed. Protected payload was decrypted and is ready for release.'];
        await emit('verify-success', {
            ip, slug, reqId, reason: 'all configured verification checks passed',
            details: successDetails,
            userId: signals.userId, playerName: signals.playerName, displayName: signals.displayName,
            gameId: signals.gameId, placeId: signals.placeId,
            executor: signals.executor.primary, executorSecondary: signals.executor.secondary,
            fingerprint: fp, capabilities, checks
        });

        return clientResult(res, {
            ok: true,
            result: 'ACCEPTED',
            reason: 'all configured verification checks passed',
            details: successDetails,
            checks,
            requestId: reqId,
            payload: source
        }, 200);
    } catch (e) {
        console.error(`[verify-error] rid=${reqId} slug="${slug}" err="${e.message}"`);
        await emit('verify-error', { ip, slug, reqId, reason: e.message, userAgent: ua });
        return res.status(404).send('not found');
    }
};
