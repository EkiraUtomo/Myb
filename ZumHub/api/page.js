const fs = require('fs');
const path = require('path');
const { readSettings } = require('./_settings');

const DEFAULT_ORIGIN = 'https://zumhub.vercel.app';
let template = null;

function loadTemplate() {
    if (template) return template;
    for (const p of [path.join(process.cwd(), 'home', 'index.html'), path.join(__dirname, '..', 'home', 'index.html')]) {
        try { template = fs.readFileSync(p, 'utf8'); return template; } catch { /* try next */ }
    }
    return null;
}

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function originOf(req) {
    const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
    if ((proto === 'https' || proto === 'http') && /^[a-z0-9.-]+(:\d{1,5})?$/.test(host)) return `${proto}://${host}`;
    const env = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
    return /^https?:\/\/[a-z0-9.:-]+$/i.test(env) ? env : DEFAULT_ORIGIN;
}

function setMeta(html, attr, key, value) {
    const re = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`, 'i');
    return html.replace(re, (_, a, b) => a + esc(value) + b);
}

module.exports = async (req, res) => {
    const html0 = loadTemplate();
    if (!html0) {
        res.statusCode = 302;
        res.setHeader('Location', '/home/index.html');
        return res.end();
    }

    let seo = {};
    try { seo = (await readSettings()).settings.seo || {}; } catch { seo = {}; }

    const origin = originOf(req);
    const title = String(seo.title || '').trim() || 'DoggoJr \u2014 ZumHub';
    const desc = String(seo.description || '').trim().slice(0, 200);
    const image = seo.image ? (seo.image.startsWith('/') ? origin + seo.image : seo.image) : `${origin}/assets/og.jpg`;

    let html = html0;
    html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${esc(title)}</title>`);
    html = setMeta(html, 'property', 'og:title', title);
    html = setMeta(html, 'name', 'twitter:title', title);
    if (desc) {
        html = setMeta(html, 'name', 'description', desc);
        html = setMeta(html, 'property', 'og:description', desc);
        html = setMeta(html, 'name', 'twitter:description', desc);
    }
    html = html.split(DEFAULT_ORIGIN + '/assets/og.jpg').join(image);
    html = html.split(DEFAULT_ORIGIN).join(origin);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(html);
};
