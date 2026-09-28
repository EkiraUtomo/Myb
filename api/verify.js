const { decrypt, safeSlug } = require('../locker/crypto');
const { getScript } = require('./_github');
const { verifyChallenge, consumeChallenge, normaliseSecurity, normaliseSignals, fingerprint, firstFailures } = require('./_security');
const { getClientIp } = require('./_ip');
const { getBanForIp } = require('./_security_store');
const { checkVerify, recordVerifyFailure } = require('./_ratelimit');
const { checkRobloxPresence } = require('./_roblox_presence');
const { emit } = require('./_telemetry');

const GENERIC_FAILURE = 'Verification rejected. Execute a fresh loader.';

function debugEnabled() {
    return String(process.env.LOCKER_DEBUG_SECURITY || 'false').toLowerCase() === 'true';
}

function browserLike(req) {
    const h = req.headers || {};
    const ua = String(h['user-agent'] || '').toLowerCase();
    const blocked = [
        'python-requests','python-urllib','curl/','wget/','axios/','postman',
        'insomnia','httpie','scrapy','node-fetch','undici','okhttp','httpx',
    ];
    if (blocked.some(x => ua.includes(x))) return true;
    if (['sec-fetch-site','sec-fetch-mode','sec-fetch-dest','sec-ch-ua','sec-ch-ua-mobile','sec-ch-ua-platform'].some(hh => !!h[hh])) return true;
    return String(h.accept || '').toLowerCase().includes('text/html');
}

function clientResult(res, body, status = 200) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline');
    return res.status(status).send(JSON.stringify(body));
}

function failureResponse(res, reason, reqId, extra = {}) {
    const body = {
        ok: false,
        result: 'REJECTED',
        reason: String(reason || 'verification-failed'),
        requestId: reqId,
    };
    if (debugEnabled()) Object.assign(body, extra);
    return clientResult(res, body, 200);
}

function failureDetails(code, security, signals, presence) {
    if (code === 'game-type') return `Game object check failed: expected Roblox DataModel Instance, received ${signals.runtime.gameType || 'unknown'}.`;
    if (code === 'workspace-type') return `Workspace check failed: expected Roblox Workspace Instance, received ${signals.runtime.workspaceType || 'unknown'}.`;
    if (code === 'game-not-loaded') return 'Game load check failed: game:IsLoaded() returned false.';
    if (code === 'runtime-not-running') return 'Runtime check failed: RunService:IsRunning() returned false.';
    if (code === 'local-player-missing') return 'LocalPlayer check failed: Players.LocalPlayer was unavailable.';
    if (code === 'httpget-missing') return 'HTTP check failed: game.HttpGet was unavailable.';
    if (code === 'executor-id-missing') return 'Executor check failed: no usable executor identifier was returned.';
    if (code === 'executor-id-incomplete') return '/l/{slug} requires both executor identifiers.';
    if (code === 'executor-id-mismatch') return `Executor identifiers did not agree (${signals.executor.primary || 'empty'} / ${signals.executor.secondary || 'empty'}).`;
    if (code === 'game-id') return `Universe/Game policy failed for ${signals.gameId || 'empty'}.`;
    if (code === 'place-id') return `Place policy failed for ${signals.placeId || 'empty'}.`;
    if (code === 'executor-not-allowed') return `Executor allowlist failed for ${signals.executor.primary || signals.executor.secondary || 'unknown'}.`;
    if (code.startsWith('capability:')) return `Required capability "${code.slice(11)}" was not reported.`;
    if (code === 'roblox-presence-unavailable') return 'Roblox Presence API did not return a usable presence record.';
    if (code === 'roblox-not-in-game') return `Roblox Presence reported presence type ${presence?.userPresenceType ?? 'unknown'}, not InGame.`;
    if (code === 'roblox-user-mismatch') return 'Server-observed Roblox UserId did not match the client-reported UserId.';
    if (code === 'roblox-place-mismatch') return 'Server-observed Roblox PlaceId did not match the client-reported PlaceId.';
    if (code === 'roblox-universe-mismatch') return 'Server-observed Roblox UniverseId did not match the client-reported GameId.';
    if (code === 'roblox-server-mismatch') return 'Server-observed Roblox server JobId did not match the client-reported JobId.';
    if (code === 'session-request-mismatch') return 'Execution session did not match the request identifier it was issued for.';
    return `Verification check failed: ${code}.`;
}

function verificationChecks(security, signals, failures) {
    const failed = new Set(failures);
    const checks = [];
    const add = (name, bad) => checks.push(`${bad ? '✗' : '✓'} ${name}`);
    if (security.requireRuntime) {
        add('Game object', failed.has('game-type'));
        add('Workspace', failed.has('workspace-type'));
        add('Game loaded', failed.has('game-not-loaded'));
        add('Runtime running', failed.has('runtime-not-running'));
        add('Local player', failed.has('local-player-missing'));
        add('HttpGet', failed.has('httpget-missing'));
    }
    if (security.requireExecutorId) add('Executor identifier', failed.has('executor-id-missing'));
    if (security.gameIds.length) add('Universe/Game policy', failed.has('game-id'));
    if (security.placeIds.length) add('Place policy', failed.has('place-id'));
    if (security.allowedExecutors.length) add('Executor allowlist', failed.has('executor-not-allowed'));
    for (const c of security.requiredCapabilities) add(`Capability: ${c}`, failed.has(`capability:${c}`));
    if (signals.executor.primary || signals.executor.secondary) add('Executor identifiers match', failed.has('executor-id-mismatch'));
    if (security.requireRobloxPresence) {
        add('Roblox presence available', failed.has('roblox-presence-unavailable'));
        add('Roblox user online in experience', failed.has('roblox-not-in-game'));
        add('Roblox UserId match', failed.has('roblox-user-mismatch'));
        add('Roblox PlaceId match', failed.has('roblox-place-mismatch'));
        add('Roblox UniverseId match', failed.has('roblox-universe-mismatch'));
        add('Roblox server JobId match', failed.has('roblox-server-mismatch'));
    }
    return checks;
}

function parseInput(req) {
    if (req.method === 'POST') {
        let body = req.body;
        if (typeof body === 'string') body = JSON.parse(body);
        if (!body || typeof body !== 'object') return null;
        return {
            slug: body.slug,
            challenge: body.challenge,
            rid: body.rid,
            state: body.state,
        };
    }
    return {
        slug: req.query?.slug,
        challenge: req.query?.challenge,
        rid: req.query?.rid,
        state: req.query?.state,
    };
}

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).send('not found');

    const reqId = String(req.headers['x-request-id'] || '');
    const requestData = (() => { try { return parseInput(req); } catch { return null; } })();
    const slug = String(requestData?.slug || '').toLowerCase().trim();
    const challenge = String(requestData?.challenge || '');
    const claimedRid = String(requestData?.rid || '').slice(0, 64);
    const ip = getClientIp(req);
    const ua = String(req.headers['user-agent'] || '');
    const realReqId = claimedRid || reqId || Math.random().toString(36).slice(2);

    let ban;
    try {
        ban = await getBanForIp(ip);
    } catch (e) {
        await emit('security-store-error', { ip, slug, reqId: realReqId, description: 'Unable to read the GitHub-backed ban list; verification was stopped.' });
        return res.status(503).send('security check unavailable');
    }
    if (ban) {
        const reason = `Forbidden: IP banned — ${ban.reason}`;
        await emit('blocked-banned-ip', { ip, slug, reqId: realReqId, reason, userAgent: ua, path: '/api/verify' });
        return res.status(403).send(reason);
    }

    const rl = checkVerify(req);
    if (!rl.allowed) {
        res.setHeader('Retry-After', String(rl.resetIn));
        await emit('rate-limited', { ip, slug, reqId: realReqId, reason: 'verification rate limit exceeded', userAgent: ua, path: '/api/verify' });
        return res.status(429).send('too many verification requests');
    }

    if (browserLike(req)) {
        await emit('blocked-browser', { ip, slug, reqId: realReqId, reason: 'browser-like verification request', userAgent: ua, path: '/api/verify' });
        return res.status(403).send('Forbidden: browser request blocked');
    }

    if (!safeSlug(slug) || !challenge || !claimedRid || !requestData?.state) {
        await emit('verify-failed', { ip, slug, reqId: realReqId, reason: 'invalid-verification-request', details: ['Missing or malformed verification request fields.'], userAgent: ua });
        recordVerifyFailure(req);
        return failureResponse(res, 'invalid-verification-request', realReqId);
    }

    const stateSize = typeof requestData.state === 'object' ? JSON.stringify(requestData.state).length : String(requestData.state).length;
    if (stateSize > 10000) {
        await emit('verify-failed', { ip, slug, reqId: realReqId, reason: 'state-too-large', details: ['Verification state exceeded the request-size limit.'], userAgent: ua });
        recordVerifyFailure(req);
        return failureResponse(res, 'invalid-verification-request', realReqId);
    }

    const challengeData = verifyChallenge(challenge);
    if (!challengeData || challengeData.slug !== slug || challengeData.rid !== claimedRid) {
        const reason = 'invalid-or-expired-session';
        await emit('verify-failed', { ip, slug, reqId: realReqId, reason, details: ['The encrypted execution session is invalid, expired, or does not match this request.'], userAgent: ua });
        recordVerifyFailure(req);
        return failureResponse(res, reason, realReqId);
    }

    let suppliedState;
    try {
        suppliedState = typeof requestData.state === 'object'
            ? requestData.state
            : JSON.parse(decodeURIComponent(String(requestData.state)));
    } catch {
        try { suppliedState = JSON.parse(String(requestData.state)); }
        catch {
            const reason = 'invalid-state-payload';
            await emit('verify-failed', { ip, slug, reqId: realReqId, reason, details: ['The Roblox bootstrap sent an invalid state payload.'], userAgent: ua });
            recordVerifyFailure(req);
            return failureResponse(res, reason, realReqId);
        }
    }

    const signals = normaliseSignals(suppliedState);
    const consumed = consumeChallenge(challenge, ip, claimedRid);
    if (!consumed.ok) {
        const reason = consumed.reason || 'session-already-consumed';
        const details = reason === 'session-network-mismatch'
            ? ['The execution session was issued for a different network address.']
            : reason === 'session-request-mismatch'
                ? ['The request identifier does not match the encrypted execution session.']
                : ['This execution session has already been consumed or has expired.'];
        await emit('verify-failed', {
            ip, slug, reqId: realReqId, reason, details, userId: signals.userId,
            playerName: signals.playerName, displayName: signals.displayName,
            gameId: signals.gameId, placeId: signals.placeId,
            executor: signals.executor.primary, executorSecondary: signals.executor.secondary,
        });
        recordVerifyFailure(req);
        return failureResponse(res, reason, realReqId);
    }

    try {
        const { item } = await getScript(slug);
        if (!item || !item.enabled) return res.status(404).send('not found');
        if (challengeData.accessKeyHash !== item.accessKeyHash) return res.status(404).send('not found');
        if (challengeData.scriptVersion !== (item.updatedAt || item.v || 0)) return failureResponse(res, 'challenge-expired', realReqId);
        if (item.expiresAt && Date.now() >= new Date(item.expiresAt).getTime()) return res.status(404).send('not found');

        const baseSecurity = normaliseSecurity(item.security);
        const strictSlugPresence = challengeData.executorOnly === true && String(process.env.LOCKER_L_REQUIRE_PRESENCE || 'false').toLowerCase() === 'true';
        const security = { ...baseSecurity, requireRobloxPresence: baseSecurity.requireRobloxPresence || strictSlugPresence };

        const failures = firstFailures(security, signals, null);
        const forcedExecutorGate = challengeData.executorOnly === true;
        if (forcedExecutorGate) {
            if (!signals.executor.primary || !signals.executor.secondary) failures.push('executor-id-incomplete');
            if (!signals.executor.match) failures.push('executor-id-mismatch');
            if (signals.runtime.gameType !== 'Instance') failures.push('game-type');
            if (signals.runtime.workspaceType !== 'Instance') failures.push('workspace-type');
            if (!signals.runtime.gameLoaded) failures.push('game-not-loaded');
            if (!signals.runtime.runServiceRunning) failures.push('runtime-not-running');
            if (!signals.runtime.localPlayer) failures.push('local-player-missing');
            if (!signals.runtime.httpGet) failures.push('httpget-missing');
        }

        const uniqueBaseFailures = [...new Set(failures)];
        if (uniqueBaseFailures.length) {
            const checks = verificationChecks(security, signals, uniqueBaseFailures);
            const details = uniqueBaseFailures.map(code => `${code}: ${failureDetails(code, security, signals, null)}`);
            await emit('verify-failed', {
                ip, slug, reqId: realReqId,
                reason: uniqueBaseFailures.join(', '), details, checks,
                userId: signals.userId, playerName: signals.playerName, displayName: signals.displayName,
                gameId: signals.gameId, placeId: signals.placeId, executor: signals.executor.primary,
                executorSecondary: signals.executor.secondary,
                fingerprint: fingerprint(signals),
                capabilities: Object.entries(signals.capabilities).filter(([,v]) => v).map(([k]) => k).join(', ') || 'none',
            });
            recordVerifyFailure(req);
            return failureResponse(res, 'runtime-verification-failed', realReqId, { details, checks });
        }

        let presence = null;
        if (security.requireRobloxPresence) {
            presence = await checkRobloxPresence(signals.userId);
            const presenceFailures = firstFailures(security, signals, presence).filter(x => x.startsWith('roblox-'));
            if (presenceFailures.length) {
                const checks = verificationChecks(security, signals, presenceFailures);
                const details = presenceFailures.map(code => `${code}: ${failureDetails(code, security, signals, presence)}`);
                await emit('verify-failed', {
                    ip, slug, reqId: realReqId, reason: presenceFailures.join(', '), details, checks,
                    userId: signals.userId, playerName: signals.playerName, displayName: signals.displayName,
                    gameId: signals.gameId, placeId: signals.placeId, executor: signals.executor.primary,
                    executorSecondary: signals.executor.secondary,
                    fingerprint: fingerprint(signals), capabilities: 'presence-check',
                    presence: {
                        available: !!presence?.available,
                        type: presence?.userPresenceType,
                        placeId: presence?.placeId,
                        universeId: presence?.universeId,
                        gameId: presence?.gameId,
                    }
                });
                recordVerifyFailure(req);
                return failureResponse(res, 'roblox-presence-failed', realReqId, { details, checks });
            }
        }

        const finalFailures = firstFailures(security, signals, presence);
        if (finalFailures.length) {
            const checks = verificationChecks(security, signals, finalFailures);
            const details = finalFailures.map(code => `${code}: ${failureDetails(code, security, signals, presence)}`);
            await emit('verify-failed', {
                ip, slug, reqId: realReqId, reason: finalFailures.join(', '), details, checks,
                userId: signals.userId, playerName: signals.playerName, displayName: signals.displayName,
                gameId: signals.gameId, placeId: signals.placeId, executor: signals.executor.primary,
                executorSecondary: signals.executor.secondary,
                fingerprint: fingerprint(signals), capabilities: 'final-verification',
            });
            recordVerifyFailure(req);
            return failureResponse(res, 'verification-failed', realReqId, { details, checks });
        }

        const fp = fingerprint(signals);
        const checks = verificationChecks(security, signals, []);
        let source;
        try {
            source = decrypt(item.payload, slug);
        } catch (decryptError) {
            const reason = 'payload-decrypt-failed';
            const details = [`Protected payload decryption failed on the server: ${String(decryptError.message || decryptError).slice(0, 300)}`];
            await emit('verify-error', {
                ip, slug, reqId: realReqId, reason, details, checks,
                userId: signals.userId, playerName: signals.playerName, displayName: signals.displayName,
                gameId: signals.gameId, placeId: signals.placeId, executor: signals.executor.primary,
                executorSecondary: signals.executor.secondary, fingerprint: fp,
            });
            recordVerifyFailure(req);
            return failureResponse(res, reason, realReqId, { details });
        }

        await emit('verify-success', {
            ip, slug, reqId: realReqId,
            reason: 'all configured verification checks passed',
            details: ['Protected payload was authorized and decrypted on the server.'],
            userId: signals.userId, playerName: signals.playerName, displayName: signals.displayName,
            gameId: signals.gameId, placeId: signals.placeId,
            executor: signals.executor.primary, executorSecondary: signals.executor.secondary,
            fingerprint: fp,
            capabilities: Object.entries(signals.capabilities).filter(([,v]) => v).map(([k]) => k).join(', ') || 'none',
            checks,
            presence: security.requireRobloxPresence ? {
                available: true,
                type: presence?.userPresenceType,
                placeId: presence?.placeId,
                universeId: presence?.universeId,
                gameId: presence?.gameId,
            } : null,
        });

        return clientResult(res, {
            ok: true,
            result: 'ACCEPTED',
            requestId: realReqId,
            payload: source,
        }, 200);
    } catch (e) {
        console.error(`[verify-error] rid=${realReqId} slug="${slug}" err="${e.message}"`);
        await emit('verify-error', { ip, slug, reqId: realReqId, reason: e.message, userAgent: ua });
        recordVerifyFailure(req);
        return failureResponse(res, 'verification-server-error', realReqId);
    }
};
