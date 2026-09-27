// In-memory rate limiter — resets on cold start.
// Persistent ban enforcement is handled separately by the GitHub-backed security store.
const { getClientIp } = require('./_ip');
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

    // prune old entries occasionally to avoid memory leak
    if (Math.random() < 0.01) {
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

// 5 attempts per 15 min on admin login
function checkLogin(req) {
    return check(req, { prefix: 'login', max: 5, windowMs: 15 * 60 * 1000 });
}

// 30 req/min on admin API (for list/save operations)
function checkAdmin(req) {
    return check(req, { prefix: 'admin', max: 30, windowMs: 60 * 1000 });
}

module.exports = { checkRun, checkLogin, checkAdmin };
