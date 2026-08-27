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
    v: 1,
    // notification banner
    banner: {
        enabled: false,
        message: '',
        link: '',
        linkText: 'learn more',
        color: 'purple', // purple | blue | green | red | yellow
    },
    // hero section overrides
    hero: {
        name: 'DoggoJr',
        tag: 'Roblox Scripter',
        bio: 'Around 3 to 4 years building scripts, tools and whatever sounds fun to make. Known as DoggoJ on some platforms. Everything I work on lives here.',
        extraButtons: [], // [{label, url, style: 'primary'|'outline'}]
    },
    // extra link cards (on top of the hardcoded ones)
    extraCards: [], // [{title, sub, url, icon: 'link'|'star'|'code'|'gamepad'|'heart'|'discord'}]
    // music
    music: {
        enabled: false,
        playlistUrl: '',
        autoplay: true,
        volume: 60,
        label: 'ZumHub Radio',
    },
    // theme
    theme: {
        accentColor: '#7c5cbf',
        accentLight: '#a07ee0',
    },
    updatedAt: null,
};

async function fetchSettings() {
    const r = await fetch(apiUrl() + `?ref=${encodeURIComponent(BRANCH)}`, { headers: headers() });
    if (r.status === 404) return { settings: DEFAULT_SETTINGS, sha: null };
    if (!r.ok) throw new Error(`GitHub read failed (${r.status})`);
    const data = await r.json();
    const text = Buffer.from(data.content, 'base64').toString('utf8');
    return { settings: JSON.parse(text), sha: data.sha };
}

async function saveSettings(settings, sha) {
    settings.updatedAt = new Date().toISOString();
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
    // Allow public GET for settings (the home page needs them)
    // Write requires auth
    if (req.method === 'GET') {
        try {
            const { settings } = await fetchSettings();
            return res.json({ ok: true, settings });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST only' });

    const rl = checkAdmin(req);
    if (!rl.allowed) return res.status(429).json({ error: 'too many requests' });
    if (!validSession(req)) return res.status(401).json({ error: 'Authentication required.' });

    try {
        const { settings: incoming } = req.body || {};
        if (!incoming) return res.status(400).json({ error: 'settings required' });
        const { sha } = await fetchSettings();
        // merge with defaults so unknown keys are preserved
        const merged = { ...DEFAULT_SETTINGS, ...incoming, v: 1 };
        await saveSettings(merged, sha);
        return res.json({ ok: true, settings: merged });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
