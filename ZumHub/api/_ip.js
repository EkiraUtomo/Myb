function firstHeader(req, name) {
    const value = req.headers?.[name];
    return Array.isArray(value) ? value[0] : value;
}

function normaliseIp(value) {
    let ip = String(value || '').trim();
    if (!ip) return 'unknown';

    if (ip.includes(',')) ip = ip.split(',')[0].trim();
    if (ip.startsWith('[') && ip.includes(']')) ip = ip.slice(1, ip.indexOf(']'));
    if (ip.startsWith('::ffff:')) ip = ip.slice(7);

    if (ip === '::1') return '127.0.0.1';
    return ip.slice(0, 128);
}

function getClientIp(req) {
    // Vercel supplies the connecting client IP in x-forwarded-for.
    // Prefer the first address, then fall back to the other standard headers.
    return normaliseIp(
        firstHeader(req, 'x-forwarded-for') ||
        firstHeader(req, 'x-real-ip') ||
        req.socket?.remoteAddress ||
        'unknown'
    );
}

module.exports = { getClientIp, normaliseIp };
