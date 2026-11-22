const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeReq, makeRes, net } = require('./helpers');
const auth = require('../api/_auth');
const linkcheck = require('../api/linkcheck');
const { sanitizeSettings, DEFAULT_SETTINGS } = require('../api/_settings');

beforeEach(() => { net.discord = 200; });

test('private and loopback addresses are recognised', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.5', '172.16.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
        assert.ok(linkcheck.isPrivateIp(ip), ip);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700::1111']) assert.ok(!linkcheck.isPrivateIp(ip), ip);
});

test('only public hosts are fetched', async () => {
    const pub = async () => [{ address: '93.184.216.34' }];
    const priv = async () => [{ address: '127.0.0.1' }];
    assert.equal(await linkcheck.hostIsPublic('example.com', pub), true);
    assert.equal(await linkcheck.hostIsPublic('example.com', priv), false);
    assert.equal(await linkcheck.hostIsPublic('localhost', pub), false);
    assert.equal(await linkcheck.hostIsPublic('intranet', pub), false);
    assert.equal(await linkcheck.hostIsPublic('svc.internal', pub), false);
    assert.equal(await linkcheck.hostIsPublic('10.0.0.1', pub), false);
    assert.equal(await linkcheck.hostIsPublic('8.8.8.8', pub), true);
});

test('discord invites are validated through the invite API', async () => {
    const ok = await linkcheck.checkOne('https://discord.gg/abc123');
    assert.equal(ok.status, 'ok');
    assert.match(ok.detail, /42 members/);
    net.discord = 404;
    const dead = await linkcheck.checkOne('https://discord.com/invite/abc123');
    assert.equal(dead.status, 'dead');
    assert.match(dead.detail, /expired/);
});

test('internal targets are blocked and bad urls rejected', async () => {
    assert.equal((await linkcheck.checkOne('http://127.0.0.1:8080/x')).status, 'blocked');
    assert.equal((await linkcheck.checkOne('http://localhost/admin')).status, 'blocked');
    assert.equal((await linkcheck.checkOne('javascript:alert(1)')).status, 'dead');
    assert.equal((await linkcheck.checkOne('not a url')).status, 'dead');
});

function call(body, session = true) {
    const headers = { 'x-zh-csrf': '1' };
    if (session) headers.authorization = `Bearer ${auth.makeToken()}`;
    const res = makeRes();
    return linkcheck(makeReq({ method: 'POST', body, headers }), res).then(() => res);
}

test('link checker endpoint is admin only and capped', async () => {
    assert.equal((await call({ urls: ['https://discord.gg/x'] }, false)).statusCode, 401);
    assert.equal((await call({})).statusCode, 400);
    const res = await call({ urls: Array.from({ length: 40 }, (_, i) => `https://discord.gg/code${i}`) });
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).results.length, 20);
});

test('links keep their order, can be emptied, and hostile urls are dropped', () => {
    const out = sanitizeSettings({ links: [
        { title: 'B', url: 'https://b.co', id: 'b' }, { title: 'A', url: 'https://a.co', id: 'a' },
        { title: 'Evil', url: 'javascript:alert(1)', id: 'a' },
    ] });
    assert.deepEqual(out.links.map(l => l.title), ['B', 'A', 'Evil']);
    assert.equal(out.links[2].url, '');
    assert.equal(new Set(out.links.map(l => l.id)).size, 3);
    assert.equal(sanitizeSettings({ links: [] }).links.length, 0);
    assert.equal(sanitizeSettings({}).links.length, DEFAULT_SETTINGS.links.length);
});

test('sections always include both ids and keep the chosen order', () => {
    const out = sanitizeSettings({ layout: { sections: [{ id: 'links', title: 'Hi', enabled: false }] } });
    assert.deepEqual(out.layout.sections.map(s => s.id), ['links', 'projects']);
    assert.equal(out.layout.sections[0].enabled, false);
    assert.equal(out.layout.sections[0].title, 'Hi');
});

test('profile, stats and marquee are bounded and plain text', () => {
    const out = sanitizeSettings({
        profile: { rows: Array.from({ length: 9 }, (_, i) => ({ label: `l${i}`, value: '<b>v</b>' })) },
        stats: { items: Array.from({ length: 9 }, (_, i) => ({ n: String(i), l: 'x' })) },
        marquee: { words: Array.from({ length: 30 }, () => 'w'), show: 'yes' },
        layout: { embed: { user: '../evil' }, linkStyle: 'weird' },
    });
    assert.equal(out.profile.rows.length, 5);
    assert.equal(out.stats.items.length, 4);
    assert.equal(out.marquee.words.length, 12);
    assert.equal(out.marquee.show, true);
    assert.equal(out.layout.embed.user, 'ZumHub');
    assert.equal(out.layout.linkStyle, 'bento');
});
