const SETTINGS_PATH = 'locker/settings.json';
const CACHE_MS = Number(process.env.SETTINGS_CACHE_MS || 30000);
const TIMEOUT_MS = 6000;

const ICONS = ['link', 'star', 'code', 'gamepad', 'heart', 'discord', 'youtube', 'doc', 'github', 'globe', 'mail', 'music', 'bolt', 'shield'];
const LINK_STYLES = ['bento', 'grid', 'list'];
const SECTION_IDS = ['projects', 'links'];
const BANNER_COLORS = ['purple', 'blue', 'green', 'red', 'yellow', 'custom'];
const FONTS = ['Syne', 'Space Grotesk', 'Orbitron'];

const DEFAULT_LINKS = [
    { id: 'discord', title: 'Discord', sub: 'ZumHub Community', url: 'https://discord.gg/rUMe7x6BDp', icon: 'discord', color: '#7b8cff', size: 'lg', enabled: true, hero: true, nav: true },
    { id: 'youtube', title: 'YouTube', sub: '@zmh.j', url: 'https://youtube.com/@zmh.j', icon: 'youtube', color: '#ff4d5e', size: 'md', enabled: true, hero: true, nav: true },
    { id: 'scriptblox', title: 'ScriptBlox', sub: 'u/Jardin', url: 'https://scriptblox.com/u/Jardin', icon: 'code', color: '#34d399', size: 'md', enabled: true, hero: true, nav: false },
    { id: 'rscripts', title: 'Rscripts', sub: 'ZumHub', url: 'https://rscripts.net/user/ZumHub', icon: 'doc', color: '#fbbf24', size: 'md', enabled: true, hero: true, nav: false },
    { id: 'github', title: 'GitHub', sub: 'EkiraUtomo', url: 'https://github.com/EkiraUtomo', icon: 'github', color: '#c9b0ff', size: 'md', enabled: true, hero: false, nav: false },
];

const DEFAULT_SETTINGS = {
    v: 4,
    seo: {
        title: 'DoggoJr',
        description: 'Roblox scripter. ZumHub script community.',
        favicon: '',
    },
    banner: {
        enabled: false,
        message: '',
        link: '',
        linkText: 'learn more',
        color: 'purple',
        customColor: '',
        dismissible: true,
    },
    hero: {
        name: 'DoggoJr',
        tag: 'Roblox Scripter',
        bio: 'Around 3 to 4 years building scripts, tools and whatever sounds fun to make. Known as DoggoJ on some platforms. Everything I work on lives here.',
        typewriterLines: [
            '-- 3-4 years Luau',
            '-- ZumHub founder',
            '-- scripter not a coder',
            '-- DoggoJr / DoggoJ',
        ],
        extraButtons: [],
        showAvatar: true,
        avatarRingSpeed: 14,
        avatarGlow: true,
    },
    nav: { extraLinks: [] },
    extraCards: [],
    projects: [],
    links: DEFAULT_LINKS,
    profile: {
        show: true,
        topLeft: 'ZumHub',
        topRight: 'Founder',
        handle: 'aka DoggoJ',
        rows: [
            { label: 'role', value: 'Roblox scripter' },
            { label: 'runs', value: 'ZumHub' },
            { label: 'style', value: 'scripter, not a coder' },
        ],
        showBarcode: true,
        mark: 'DJ // ZH',
    },
    stats: {
        show: true,
        items: [{ n: '3+', l: 'years' }, { n: 'Luau', l: 'language' }, { n: 'active', l: 'status' }],
    },
    codeWindow: { show: true, file: 'zumhub.lua' },
    marquee: { show: true, words: ['LUAU', 'ZUMHUB', 'SCRIPTS', 'TOOLS', 'COMMUNITY', 'BUILT BY HAND'] },
    layout: {
        sections: [
            { id: 'projects', title: 'Projects', enabled: true },
            { id: 'links', title: 'Find me', enabled: true },
        ],
        linkStyle: 'bento',
        embed: { enabled: true, user: 'ZumHub' },
    },
    social: { twitter: '', tiktok: '', twitch: '', custom: [] },
    footer: {
        left: 'DoggoJr — ZumHub',
        right: 'built by hand',
        showClock: true,
        showEasterEggHint: true,
    },
    particles: {
        enabled: true,
        density: 65,
        speed: 0.22,
        connectionDistance: 85,
        orbCount: 3,
        orbOpacity: 0.14,
    },
    music: {
        enabled: false,
        playlistUrl: '',
        autoplay: true,
        volume: 60,
        label: 'ZumHub Radio',
        shuffle: true,
        showPlayer: true,
    },
    theme: {
        accentColor: '#7c5cbf',
        accentLight: '#a07ee0',
        accentDim: '#3d2475',
        bgBase: '#07070f',
        bgSurface: '#0c0c18',
        fontDisplay: 'Syne',
    },
    locker: {
        message: 'this is a locked endpoint. the source, loader, and access key are not available here.',
        contactText: 'contact DoggoJr if you need access.',
    },
    updatedAt: null,
};

function obj(v) {
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function str(v, max, fallback = '') {
    if (typeof v !== 'string') return fallback;
    return v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
}

function bool(v, fallback) {
    return typeof v === 'boolean' ? v : fallback;
}

function num(v, min, max, fallback) {
    if (v === '' || v === null || v === undefined) return fallback;
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function oneOf(v, list, fallback) {
    return list.includes(v) ? v : fallback;
}

function hex(v, fallback) {
    return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim() : fallback;
}

function arr(v, max) {
    return Array.isArray(v) ? v.slice(0, max) : [];
}

function safeUrl(value) {
    const s = String(value ?? '').trim();
    if (!s || s.length > 500 || /[\s\u0000-\u001f\\]/.test(s)) return '';
    if (s.startsWith('#')) return s;
    if (s.startsWith('/')) return s.startsWith('//') ? '' : s;
    try {
        const u = new URL(s);
        return u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:' ? s : '';
    } catch {
        return '';
    }
}

function youtubeUrl(value) {
    const s = safeUrl(value);
    if (!s || s.startsWith('/') || s.startsWith('#')) return '';
    try {
        const h = new URL(s).hostname.toLowerCase();
        const ok = h === 'youtu.be' || h === 'youtube.com' || h.endsWith('.youtube.com');
        return ok ? s : '';
    } catch {
        return '';
    }
}

function sanitizeLinks(input) {
    if (!Array.isArray(input)) return DEFAULT_LINKS.map(l => ({ ...l }));
    const seen = new Set();
    const out = [];
    for (const raw of input.slice(0, 20)) {
        const o = obj(raw);
        const title = str(o.title, 40);
        if (!title) continue;
        let id = str(o.id, 24).toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (!id || seen.has(id)) id = `l${out.length + 1}-${Math.random().toString(36).slice(2, 6)}`;
        seen.add(id);
        out.push({
            id,
            title,
            sub: str(o.sub, 60),
            url: safeUrl(o.url),
            icon: oneOf(o.icon, ICONS, 'link'),
            color: hex(o.color, '#a07ee0'),
            size: oneOf(o.size, ['lg', 'md'], 'md'),
            enabled: bool(o.enabled, true),
            hero: bool(o.hero, false),
            nav: bool(o.nav, false),
        });
    }
    return out;
}

function sanitizeSections(input) {
    const d = DEFAULT_SETTINGS.layout.sections;
    const out = [];
    for (const raw of arr(input, 6)) {
        const o = obj(raw);
        if (!SECTION_IDS.includes(o.id) || out.some(x => x.id === o.id)) continue;
        const def = d.find(x => x.id === o.id);
        out.push({ id: o.id, title: str(o.title, 40, def.title) || def.title, enabled: bool(o.enabled, true) });
    }
    for (const def of d) if (!out.some(x => x.id === def.id)) out.push({ ...def });
    return out;
}

function sanitizeSettings(input) {
    const src = obj(input);
    const d = DEFAULT_SETTINGS;

    const seo = obj(src.seo);
    const banner = obj(src.banner);
    const hero = obj(src.hero);
    const nav = obj(src.nav);
    const social = obj(src.social);
    const footer = obj(src.footer);
    const particles = obj(src.particles);
    const music = obj(src.music);
    const theme = obj(src.theme);
    const locker = obj(src.locker);
    const profile = obj(src.profile);
    const stats = obj(src.stats);
    const codeWindow = obj(src.codeWindow);
    const marquee = obj(src.marquee);
    const layout = obj(src.layout);
    const embed = obj(layout.embed);
    const dp = d.profile;

    const lines = arr(hero.typewriterLines, 12).map(x => str(x, 80)).filter(Boolean);

    return {
        v: 4,
        seo: {
            title: str(seo.title, 120, d.seo.title) || d.seo.title,
            description: str(seo.description, 300, d.seo.description),
            favicon: safeUrl(seo.favicon),
        },
        banner: {
            enabled: bool(banner.enabled, d.banner.enabled),
            message: str(banner.message, 300),
            link: safeUrl(banner.link),
            linkText: str(banner.linkText, 40, d.banner.linkText) || d.banner.linkText,
            color: oneOf(banner.color, BANNER_COLORS, d.banner.color),
            customColor: hex(banner.customColor, ''),
            dismissible: bool(banner.dismissible, d.banner.dismissible),
        },
        hero: {
            name: str(hero.name, 40, d.hero.name) || d.hero.name,
            tag: str(hero.tag, 60, d.hero.tag) || d.hero.tag,
            bio: str(hero.bio, 600, d.hero.bio),
            typewriterLines: lines.length ? lines : d.hero.typewriterLines.slice(),
            extraButtons: arr(hero.extraButtons, 8).map(b => {
                const o = obj(b);
                return {
                    label: str(o.label, 30),
                    url: safeUrl(o.url),
                    style: oneOf(o.style, ['primary', 'outline'], 'outline'),
                    icon: str(o.icon, 20),
                };
            }).filter(b => b.label && b.url),
            showAvatar: bool(hero.showAvatar, d.hero.showAvatar),
            avatarRingSpeed: num(hero.avatarRingSpeed, 4, 60, d.hero.avatarRingSpeed),
            avatarGlow: bool(hero.avatarGlow, d.hero.avatarGlow),
        },
        nav: {
            extraLinks: arr(nav.extraLinks, 6).map(l => {
                const o = obj(l);
                return { label: str(o.label, 24), url: safeUrl(o.url), external: bool(o.external, true) };
            }).filter(l => l.label && l.url),
        },
        extraCards: arr(src.extraCards, 24).map(c => {
            const o = obj(c);
            return {
                title: str(o.title, 60),
                sub: str(o.sub, 80),
                url: safeUrl(o.url),
                icon: oneOf(o.icon, ICONS, 'link'),
            };
        }).filter(c => c.title && c.url),
        projects: arr(src.projects, 12).map(p => {
            const o = obj(p);
            return {
                title: str(o.title, 60),
                desc: str(o.desc, 160),
                url: safeUrl(o.url),
                tags: arr(o.tags, 4).map(t => str(t, 20)).filter(Boolean),
            };
        }).filter(p => p.title),
        links: sanitizeLinks(src.links),
        profile: {
            show: bool(profile.show, dp.show),
            topLeft: str(profile.topLeft, 24, dp.topLeft),
            topRight: str(profile.topRight, 24, dp.topRight),
            handle: str(profile.handle, 40, dp.handle),
            rows: Array.isArray(profile.rows)
                ? arr(profile.rows, 5).map(r => ({ label: str(obj(r).label, 16), value: str(obj(r).value, 40) })).filter(r => r.label && r.value)
                : dp.rows.map(r => ({ ...r })),
            showBarcode: bool(profile.showBarcode, dp.showBarcode),
            mark: str(profile.mark, 20, dp.mark),
        },
        stats: {
            show: bool(stats.show, d.stats.show),
            items: Array.isArray(stats.items)
                ? arr(stats.items, 4).map(i => ({ n: str(obj(i).n, 14), l: str(obj(i).l, 18) })).filter(i => i.n && i.l)
                : d.stats.items.map(i => ({ ...i })),
        },
        codeWindow: {
            show: bool(codeWindow.show, d.codeWindow.show),
            file: str(codeWindow.file, 30, d.codeWindow.file) || d.codeWindow.file,
        },
        marquee: {
            show: bool(marquee.show, d.marquee.show),
            words: Array.isArray(marquee.words)
                ? arr(marquee.words, 12).map(w => str(w, 24)).filter(Boolean)
                : d.marquee.words.slice(),
        },
        layout: {
            sections: sanitizeSections(layout.sections),
            linkStyle: oneOf(layout.linkStyle, LINK_STYLES, 'bento'),
            embed: {
                enabled: bool(embed.enabled, true),
                user: /^[A-Za-z0-9_.-]{1,40}$/.test(String(embed.user || '')) ? String(embed.user) : d.layout.embed.user,
            },
        },
        social: {
            twitter: safeUrl(social.twitter),
            tiktok: safeUrl(social.tiktok),
            twitch: safeUrl(social.twitch),
            custom: arr(social.custom, 8).map(c => {
                const o = obj(c);
                return { label: str(o.label, 30), url: safeUrl(o.url), icon: str(o.icon, 20) };
            }).filter(c => c.label && c.url),
        },
        footer: {
            left: str(footer.left, 80, d.footer.left),
            right: str(footer.right, 80, d.footer.right),
            showClock: bool(footer.showClock, d.footer.showClock),
            showEasterEggHint: bool(footer.showEasterEggHint, d.footer.showEasterEggHint),
        },
        particles: {
            enabled: bool(particles.enabled, d.particles.enabled),
            density: num(particles.density, 0, 200, d.particles.density),
            speed: num(particles.speed, 0, 2, d.particles.speed),
            connectionDistance: num(particles.connectionDistance, 20, 200, d.particles.connectionDistance),
            orbCount: Math.round(num(particles.orbCount, 0, 5, d.particles.orbCount)),
            orbOpacity: num(particles.orbOpacity, 0, 0.5, d.particles.orbOpacity),
        },
        music: {
            enabled: bool(music.enabled, d.music.enabled),
            playlistUrl: youtubeUrl(music.playlistUrl),
            autoplay: bool(music.autoplay, d.music.autoplay),
            volume: Math.round(num(music.volume, 0, 100, d.music.volume)),
            label: str(music.label, 40, d.music.label) || d.music.label,
            shuffle: bool(music.shuffle, d.music.shuffle),
            showPlayer: bool(music.showPlayer, d.music.showPlayer),
        },
        theme: {
            accentColor: hex(theme.accentColor, d.theme.accentColor),
            accentLight: hex(theme.accentLight, d.theme.accentLight),
            accentDim: hex(theme.accentDim, d.theme.accentDim),
            bgBase: hex(theme.bgBase, d.theme.bgBase),
            bgSurface: hex(theme.bgSurface, d.theme.bgSurface),
            fontDisplay: oneOf(theme.fontDisplay, FONTS, d.theme.fontDisplay),
        },
        locker: {
            message: str(locker.message, 300, d.locker.message) || d.locker.message,
            contactText: str(locker.contactText, 200, d.locker.contactText) || d.locker.contactText,
        },
        updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt.slice(0, 40) : null,
    };
}

function config() {
    const owner = process.env.LOCKER_GITHUB_OWNER;
    const name = process.env.LOCKER_GITHUB_REPO;
    const token = process.env.GITHUB_TOKEN;
    if (!owner || !name || !token) throw new Error('GitHub vault is not configured.');
    return { owner, name, token, branch: process.env.LOCKER_GITHUB_BRANCH || 'main' };
}

function url(c) {
    return `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.name)}/contents/${SETTINGS_PATH}`;
}

function ghHeaders(c) {
    return {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${c.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'ZumHub-Locker/3.0',
    };
}

async function timedFetch(u, opts) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        return await fetch(u, { ...opts, signal: ctrl.signal });
    } finally {
        clearTimeout(timer);
    }
}

let cache = { at: 0, settings: null, sha: null };

async function readSettings({ force = false } = {}) {
    const now = Date.now();
    if (!force && cache.settings && now - cache.at < CACHE_MS) {
        return { settings: cache.settings, sha: cache.sha, degraded: false };
    }
    try {
        const c = config();
        const r = await timedFetch(`${url(c)}?ref=${encodeURIComponent(c.branch)}`, { headers: ghHeaders(c) });
        if (r.status === 404) {
            cache = { at: now, settings: sanitizeSettings(DEFAULT_SETTINGS), sha: null };
            return { settings: cache.settings, sha: null, degraded: false };
        }
        if (!r.ok) throw new Error(`GitHub read failed (${r.status})`);
        const data = await r.json();
        const parsed = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
        cache = { at: now, settings: sanitizeSettings(parsed), sha: data.sha };
        return { settings: cache.settings, sha: data.sha, degraded: false };
    } catch (e) {
        if (cache.settings) return { settings: cache.settings, sha: cache.sha, degraded: true };
        if (force) throw e;
        return { settings: sanitizeSettings(DEFAULT_SETTINGS), sha: null, degraded: true };
    }
}

async function writeSettings(incoming) {
    const { sha } = await readSettings({ force: true });
    const clean = sanitizeSettings(incoming);
    clean.updatedAt = new Date().toISOString();

    const c = config();
    const body = {
        message: 'locker: update site settings',
        content: Buffer.from(JSON.stringify(clean, null, 2) + '\n').toString('base64'),
        branch: c.branch,
    };
    if (sha) body.sha = sha;

    const r = await timedFetch(url(c), { method: 'PUT', headers: ghHeaders(c), body: JSON.stringify(body) });
    if (!r.ok) {
        const t = await r.text();
        throw new Error(`GitHub write failed (${r.status}): ${t.slice(0, 200)}`);
    }
    const out = await r.json();
    cache = { at: Date.now(), settings: clean, sha: out?.content?.sha || null };
    return clean;
}

module.exports = { DEFAULT_SETTINGS, DEFAULT_LINKS, sanitizeSettings, safeUrl, readSettings, writeSettings, ICONS };
