const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { putFile, makeReq, makeRes } = require('./helpers');
const page = require('../api/page');

const ROOT = path.join(__dirname, '..');

async function get(headers = {}) {
    const res = makeRes();
    await page(makeReq({ headers: { host: 'zumhub.example', 'user-agent': 'Discordbot/2.0', ...headers } }), res);
    return res;
}

function meta(html, attr, key) {
    const m = html.match(new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`));
    return m && m[1];
}

test('static page carries a full preview card even without the function', () => {
    const html = fs.readFileSync(path.join(ROOT, 'home', 'index.html'), 'utf8');
    for (const k of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:width', 'og:image:height', 'og:type']) {
        assert.ok(meta(html, 'property', k), k);
    }
    assert.equal(meta(html, 'name', 'twitter:card'), 'summary_large_image');
    assert.match(meta(html, 'property', 'og:image'), /^https:\/\/.+\.jpg$/);
});

test('preview image is a 1200x630 JPEG under 300 KB', () => {
    const buf = fs.readFileSync(path.join(ROOT, 'assets', 'og.jpg'));
    assert.ok(buf.length < 300 * 1024, `${buf.length} bytes`);
    assert.equal(buf[0], 0xff); assert.equal(buf[1], 0xd8);
    let i = 2, w = 0, h = 0;
    while (i < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xc3) { h = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7); break; }
        i += 2 + buf.readUInt16BE(i + 2);
    }
    assert.deepEqual([w, h], [1200, 630]);
});

test('served page uses the request origin for every absolute link', async () => {
    const res = await get();
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.ok(!res.body.includes('zumhub.vercel.app'));
    assert.equal(meta(res.body, 'property', 'og:image'), 'https://zumhub.example/assets/og.jpg');
    assert.equal(meta(res.body, 'property', 'og:url'), 'https://zumhub.example/home');
    assert.equal(meta(res.body, 'name', 'twitter:image'), 'https://zumhub.example/assets/og.jpg');
    assert.match(res.body, /<link rel="canonical" href="https:\/\/zumhub\.example\/home">/);
});

test('a hostile host header cannot inject markup', async () => {
    const res = await get({ host: 'evil.com"><script>alert(1)</script>' });
    assert.ok(!res.body.includes('<script>alert(1)</script>'));
    assert.ok(res.body.includes('https://zumhub.vercel.app'));
});

test('title, description and image come from site settings, escaped', async () => {
    putFile('locker/settings.json', { seo: { title: 'My "Hub" <b>', description: 'Desc & more', image: '/assets/custom.png' } });
    const mod = require('../api/_settings');
    await mod.readSettings({ force: true });
    const res = await get();
    assert.equal(meta(res.body, 'property', 'og:title'), 'My &quot;Hub&quot; &lt;b&gt;');
    assert.equal(meta(res.body, 'property', 'og:description'), 'Desc &amp; more');
    assert.equal(meta(res.body, 'property', 'og:image'), 'https://zumhub.example/assets/custom.png');
    assert.match(res.body, /<title>My &quot;Hub&quot; &lt;b&gt;<\/title>/);
    assert.ok(!res.body.includes('<b></title>'));
});

test('routes: / and /home use the function, the static file stays reachable', () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    for (const src of ['/', '/home', '/home/']) assert.ok(cfg.rewrites.some(r => r.source === src && r.destination === '/api/page'), src);
    assert.ok(!cfg.rewrites.some(r => r.source === '/home/index.html'));
    assert.ok(cfg.functions['api/page.js'].includeFiles.includes('home/index.html'));
    for (const src of ['/', '/home', '/home/']) {
        assert.ok(cfg.headers.some(h => h.source === src && h.headers.some(x => x.key === 'Content-Security-Policy')), `csp ${src}`);
    }
});
