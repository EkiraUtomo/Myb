// In-memory abuse controls. They reset on cold starts; persistent bans remain GitHub-backed.
const { getClientIp } = require('./_ip');
const windows = new Map();
const failures = new Map();

function getKey(req, prefix) {
    const ip = getClientIp(req);
    return `${prefix}:${ip}`;
}

function check(req, opts) {
    const key = getKey(req, opts.prefix);
    const now = Date.now();
    const entry = windows.get(key) || { count: 0, reset: now + opts.windowMs };

    if (now > entry.reset) {
        entry.count = 0;
        entry.reset = now + opts.windowMs;
    }

    entry.count++;
    windows.set(key, entry);

    if (Math.random() < 0.02) {
        for (const [k, v] of windows) {
            if (now > v.reset + 60000) windows.delete(k);
        }
        for (const [k, v] of failures) {
            if (now > v.reset + 60000) failures.delete(k);
        }
    }

    return {
        allowed: entry.count <= opts.max,
        remaining: Math.max(0, opts.max - entry.count),
        resetIn: Math.max(1, Math.ceil((entry.reset - now) / 1000)),
    };
}

function checkRun(req) {
    return check(req, { prefix: 'run', max: 10, windowMs: 60 * 1000 });
}

function checkVerify(req) {
    const key = getKey(req, 'verify');
    const now = Date.now();
    const strike = failures.get(key);
    if (strike && now < strike.cooldownUntil) {
        return { allowed: false, remaining: 0, resetIn: Math.ceil((strike.cooldownUntil - now) / 1000), cooldown: true };
    }
    return check(req, { prefix: 'verify', max: 20, windowMs: 60 * 1000 });
}

function recordVerifyFailure(req) {
    const key = getKey(req, 'verify-failure');
    const now = Date.now();
    const entry = failures.get(key) || { count: 0, reset: now + 60 * 1000, cooldownUntil: 0 };
    if (now > entry.reset) {
        entry.count = 0;
        entry.reset = now + 60 * 1000;
        entry.cooldownUntil = 0;
    }
    entry.count++;
    if (entry.count >= 6) {
        entry.cooldownUntil = now + 30 * 1000;
    }
    failures.set(key, entry);
    return {
        strikes: entry.count,
        cooldownIn: Math.max(0, Math.ceil((entry.cooldownUntil - now) / 1000)),
    };
}

function checkLogin(req) {
    return check(req, { prefix: 'login', max: 5, windowMs: 15 * 60 * 1000 });
}

function checkAdmin(req) {
    return check(req, { prefix: 'admin', max: 30, windowMs: 60 * 1000 });
}

module.exports = { checkRun, checkVerify, recordVerifyFailure, checkLogin, checkAdmin };
