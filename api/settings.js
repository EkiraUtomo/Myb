const { validSession } = require('./_auth');
const { checkAdmin } = require('./_ratelimit');

const SETTINGS_PATH = 'locker/settings.json';
const REPO_OWNER = process.env.LOCKER_GITHUB_OWNER;
const REPO_NAME  = process.env.LOCKER_GITHUB_REPO;
const BRANCH     = process.env.LOCKER_GITHUB_BRANCH || 'main';

function headers() {
    return {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'ZumHub-Locker/2.0'
    };
}

function apiUrl() {
    return `https://api.github.com/repos/${encodeURIComponent(REPO_OWNER)}/${encodeURIComponent(REPO_NAME)}/contents/${SETTINGS_PATH}`;
}

const DEFAULT_SETTINGS = {
    v: 2,

    // ── SEO ──
    seo: {
        title: 'DoggoJr',
        description: 'Roblox scripter. ZumHub script community.',
        favicon: '',          // URL to custom favicon
    },

    // ── NOTIFICATION BANNER ──
    banner: {
        enabled: false,
        message: '',
        link: '',
        linkText: 'learn more',
        color: 'purple',      // purple | blue | green | red | yellow | custom
        customColor: '',      // hex color if color === 'custom'
        dismissible: true,
    },

    // ── HERO ──
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
        extraButtons: [],     // [{label, url, style: 'primary'|'outline', icon: ''}]
        showAvatar: true,
        avatarRingSpeed: 14,  // seconds per rotation
        avatarGlow: true,
    },

    // ── NAV ──
    nav: {
        extraLinks: [],       // [{label, url, external: true}]
    },

    // ── LINK CARDS ──
    extraCards: [],           // [{title, sub, url, icon}]

    // ── SOCIAL ──
    social: {
        twitter: '',
        tiktok: '',
        twitch: '',
        custom: [],           // [{label, url, icon}]
    },

    // ── FOOTER ──
    footer: {
        left: 'DoggoJr — ZumHub',
        right: 'built by hand',
        showClock: true,
        showEasterEggHint: true,  // "built by hand" easter egg trigger
    },

    // ── PARTICLES / BACKGROUND ──
    particles: {
        enabled: true,
        density: 65,          // max particle count
        speed: 0.22,          // base velocity
        connectionDistance: 85,
        orbCount: 3,          // 0-5 background orbs
        orbOpacity: 0.14,
    },

    // ── MUSIC ──
    music: {
        enabled: false,
        playlistUrl: '',
        autoplay: true,
        volume: 60,
        label: 'ZumHub Radio',
        shuffle: true,
        showPlayer: true,
    },

    // ── THEME ──
    theme: {
        accentColor: '#7c5cbf',
        accentLight: '#a07ee0',
        accentDim: '#3d2475',
        bgBase: '#07070f',
        bgSurface: '#0c0c18',
        fontDisplay: 'Syne',  // Syne | Space Grotesk | Orbitron
    },

    // ── LOCKER PAGE ──
    locker: {
        message: 'this is a locked endpoint. the source, loader, and access key are not available here.',
        contactText: 'contact DoggoJr if you need access.',
    },

    updatedAt: null,
};

const BODY_LIMIT = 64 * 1024; // 64KB max settings payload

async function fetchSettings() {
    const r = await fetch(apiUrl() + `?ref=${encodeURIComponent(BRANCH)}`, { headers: headers() });
    if (r.status === 404) return { settings: DEFAULT_SETTINGS, sha: null };
    if (!r.ok) throw new Error(`GitHub read failed (${r.status})`);
    const data = await r.json();
    const text = Buffer.from(data.content, 'base64').toString('utf8');
    return { settings: { ...DEFAULT_SETTINGS, ...JSON.parse(text) }, sha: data.sha };
}

async function saveSettings(settings, sha) {
    settings.updatedAt = new Date().toISOString();
    settings.v = 2;
    const content = Buffer.from(JSON.stringify(settings, null, 2) + '\n').toString('base64');
    const body = { message: 'locker: update site settings', content, branch: BRANCH };
    if (sha) body.sha = sha;
    const r = await fetch(apiUrl(), { method: 'PUT', headers: headers(), body: JSON.stringify(body) });
    if (!r.ok) {
        const t = await r.text();
        throw new Error(`GitHub write failed (${r.status}): ${t.slice(0, 200)}`);
    }
    return r.json();
}

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Request-ID', Math.random().toString(36).slice(2));

    if (req.method === 'GET') {
        try {
            const { settings } = await fetchSettings();
            // strip any sensitive fields before serving publicly
            const pub = { ...settings };
            return res.json({ ok: true, settings: pub });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST only' });

    const rl = checkAdmin(req);
    if (!rl.allowed) return res.status(429).json({ error: 'too many requests' });
    if (!validSession(req)) return res.status(401).json({ error: 'Authentication required.' });

    // Body size limit
    const raw = JSON.stringify(req.body || {});
    if (raw.length > BODY_LIMIT) return res.status(413).json({ error: 'Settings payload too large.' });

    try {
        const { settings: incoming } = req.body || {};
        if (!incoming) return res.status(400).json({ error: 'settings required' });
        const { sha } = await fetchSettings();
        const merged = { ...DEFAULT_SETTINGS, ...incoming, v: 2 };
        await saveSettings(merged, sha);
        return res.json({ ok: true, settings: merged });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
