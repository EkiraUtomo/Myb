const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');

const auth = require('../api/_auth');
const { sanitizeSettings, safeUrl, DEFAULT_SETTINGS } = require('../api/_settings');

test('admin secret compare rejects NUL-padded variants', () => {
    assert.ok(auth.adminSecretOk('correct-horse-battery'));
    assert.ok(!auth.adminSecretOk('correct-horse-battery\u0000\u0000'));
    assert.ok(!auth.adminSecretOk('correct-horse-batter'));
    assert.ok(!auth.adminSecretOk(''));
    assert.ok(!auth.adminSecretOk(undefined));
});

test('bearer token sessions still work (old admin clients)', () => {
    const token = auth.makeToken();
    assert.ok(auth.validSession({ method: 'POST', headers: { authorization: `Bearer ${token}` } }));
    assert.ok(!auth.validSession({ method: 'GET', headers: { authorization: `Bearer ${token}x` } }));
    assert.ok(!auth.validSession({ method: 'GET', headers: {} }));
});

test('cookie sessions need csrf header and same origin on writes', () => {
    const token = auth.makeToken();
    const cookie = `${auth.COOKIE}=${token}`;
    const base = { host: 'zumhub.test', cookie };
    assert.ok(auth.validSession({ method: 'GET', headers: base }));
    assert.ok(!auth.validSession({ method: 'POST', headers: base }));
    assert.ok(auth.validSession({ method: 'POST', headers: { ...base, 'x-zh-csrf': '1' } }));
    assert.ok(auth.validSession({ method: 'POST', headers: { ...base, 'x-zh-csrf': '1', origin: 'https://zumhub.test' } }));
    assert.ok(!auth.validSession({ method: 'POST', headers: { ...base, 'x-zh-csrf': '1', origin: 'https://evil.test' } }));
});

test('session cookie is HttpOnly, SameSite=Strict and Secure on https', () => {
    const c = auth.sessionCookie('tok', { headers: { 'x-forwarded-proto': 'https' } });
    assert.match(c, /HttpOnly/);
    assert.match(c, /SameSite=Strict/);
    assert.match(c, /Secure/);
    assert.match(c, /Max-Age=28800/);
    assert.match(auth.clearCookie({ headers: {} }), /Max-Age=0/);
});

test('safeUrl only lets http, https, mailto, relative and hash through', () => {
    assert.equal(safeUrl('https://example.com/a'), 'https://example.com/a');
    assert.equal(safeUrl('/home'), '/home');
    assert.equal(safeUrl('#links'), '#links');
    assert.equal(safeUrl('mailto:a@b.co'), 'mailto:a@b.co');
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', '//evil.com', 'vbscript:x', 'https://a b.com', '', '/\\evil.com']) {
        assert.equal(safeUrl(bad), '', bad);
    }
});

test('sanitizer strips hostile settings and keeps text as plain strings', () => {
    const out = sanitizeSettings({
        hero: { name: '<img src=x onerror=alert(1)>', extraButtons: [{ label: 'x', url: 'javascript:alert(1)' }, { label: 'ok', url: 'https://a.co', style: 'primary' }] },
        extraCards: [{ title: '<b>t</b>', sub: 's', url: 'javascript:1', icon: 'nope' }, { title: 'fine', url: 'https://a.co', icon: 'star' }],
        banner: { color: 'orange', link: 'javascript:1', customColor: 'red' },
        theme: { accentColor: 'url(javascript:1)', fontDisplay: 'Comic Sans' },
        music: { playlistUrl: 'https://evil.example/watch?list=1' },
        particles: { density: 99999, speed: -5 },
        injected: { anything: true },
    });
    assert.equal(out.hero.extraButtons.length, 1);
    assert.equal(out.hero.extraButtons[0].label, 'ok');
    assert.equal(out.extraCards.length, 1);
    assert.equal(out.extraCards[0].icon, 'star');
    assert.equal(out.banner.color, 'purple');
    assert.equal(out.banner.link, '');
    assert.equal(out.theme.accentColor, DEFAULT_SETTINGS.theme.accentColor);
    assert.equal(out.theme.fontDisplay, 'Syne');
    assert.equal(out.music.playlistUrl, '');
    assert.equal(out.particles.density, 200);
    assert.equal(out.particles.speed, 0);
    assert.equal(out.injected, undefined);
    assert.equal(typeof out.hero.name, 'string');
});

test('sanitizer is idempotent and accepts the old settings shape', () => {
    const once = sanitizeSettings(DEFAULT_SETTINGS);
    assert.deepEqual(sanitizeSettings(once), once);
    const old = { v: 2, seo: { title: 'DoggoJr' }, hero: { name: 'DoggoJr', typewriterLines: ['a', 'b'] }, extraCards: [{ title: 'T', sub: 'S', url: 'https://x.co', icon: 'code' }] };
    const out = sanitizeSettings(old);
    assert.deepEqual(out.hero.typewriterLines, ['a', 'b']);
    assert.equal(out.extraCards[0].title, 'T');
    assert.deepEqual(out.projects, []);
});

test('youtube-only playlist url', () => {
    const ok = sanitizeSettings({ music: { enabled: true, playlistUrl: 'https://www.youtube.com/playlist?list=PL123' } });
    assert.equal(ok.music.playlistUrl, 'https://www.youtube.com/playlist?list=PL123');
});
