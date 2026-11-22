// In-memory rate limiter — resets on cold start.
// Persistent ban enforcement is handled separately by the GitHub-backed security store.
const { getClientIp } = require('./_ip');
const kv = require('./_kv');
const windows = new Map();

function getKey(req, prefix) {
    const ip = getClientIp(req);
    return `${prefix}:${ip}`;
}

function check(req, opts) {
    // opts: { prefix, max, windowMs }
    const key = getKey(req, opts.prefix);
    const now = Date.now();
    const entry = windows.get(key) || { count: 0, reset: now + opts.windowMs };

    // reset window if expired
    if (now > entry.reset) {
        entry.count = 0;
        entry.reset = now + opts.windowMs;
    }

    entry.count++;
    windows.set(key, entry);

    if (windows.size > 2000 || Math.random() < 0.01) {
        for (const [k, v] of windows) {
            if (now > v.reset + 60000) windows.delete(k);
        }
    }

    return {
        allowed: entry.count <= opts.max,
        remaining: Math.max(0, opts.max - entry.count),
        resetIn: Math.ceil((entry.reset - now) / 1000),
    };
}

// 10 req/min on script run endpoint
function checkRun(req) {
    return check(req, { prefix: 'run', max: 10, windowMs: 60 * 1000 });
}

// 30 req/min on verify; a normal run needs exactly one, and run itself is capped at 10/min
function checkVerify(req) {
    return check(req, { prefix: 'verify', max: 30, windowMs: 60 * 1000 });
}

// 5 attempts per 15 min on admin login
function checkLogin(req) {
    return check(req, { prefix: 'login', max: 5, windowMs: 15 * 60 * 1000 });
}

// 30 req/min on admin API (for list/save operations)
function checkAdmin(req) {
    return check(req, { prefix: 'admin', max: 30, windowMs: 60 * 1000 });
}

async function checkShared(req, opts) {
    if (!kv.enabled()) return check(req, opts);
    const now = Date.now();
    const slot = Math.floor(now / opts.windowMs);
    const count = await kv.incr(`rl:${opts.prefix}:${getClientIp(req)}:${slot}`, Math.ceil(opts.windowMs / 1000) + 5);
    return {
        allowed: count <= opts.max,
        remaining: Math.max(0, opts.max - count),
        resetIn: Math.max(1, Math.ceil(((slot + 1) * opts.windowMs - now) / 1000)),
    };
}

const checkRunShared = req => checkShared(req, { prefix: 'run', max: 10, windowMs: 60 * 1000 });
const checkVerifyShared = req => checkShared(req, { prefix: 'verify', max: 30, windowMs: 60 * 1000 });
const checkLoginShared = req => checkShared(req, { prefix: 'login', max: 5, windowMs: 15 * 60 * 1000 });

module.exports = { checkRun, checkVerify, checkLogin, checkAdmin, checkRunShared, checkVerifyShared, checkLoginShared };
