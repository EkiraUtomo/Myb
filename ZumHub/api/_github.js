const REPO_OWNER = process.env.LOCKER_GITHUB_OWNER;
const REPO_NAME  = process.env.LOCKER_GITHUB_REPO;
const BRANCH     = process.env.LOCKER_GITHUB_BRANCH || 'main';
const ROOT       = process.env.LOCKER_GITHUB_ROOT || 'locker/scripts';
const LEGACY_MANIFEST = process.env.LOCKER_GITHUB_MANIFEST || 'locker/scripts.json';
const TIMEOUT_MS = 8000;

function env(name, value) {
    if (!value) throw new Error(`${name} is not configured.`);
    return value;
}

function headers() {
    return {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${env('GITHUB_TOKEN', process.env.GITHUB_TOKEN)}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'ZumHub-Locker/2.0'
    };
}

function repo() {
    return {
        owner: env('LOCKER_GITHUB_OWNER', REPO_OWNER),
        name:  env('LOCKER_GITHUB_REPO', REPO_NAME)
    };
}

function pathFor(slug) { return `${ROOT}/${slug}.json`; }

function apiUrl(path, query = '') {
    const { owner, name } = repo();
    return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${path}${query}`;
}

// Fetch with timeout — prevents Vercel function from hanging on slow GitHub responses
async function fetchWithTimeout(url, opts = {}, ms = TIMEOUT_MS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
        return await fetch(url, { ...opts, signal: ctrl.signal });
    } finally {
        clearTimeout(timer);
    }
}

// Fetch with one automatic retry on transient 5xx or network errors
async function fetchGitHub(url, opts = {}) {
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const r = await fetchWithTimeout(url, opts);
            // Retry on GitHub 5xx
            if (attempt === 0 && r.status >= 500) {
                await new Promise(res => setTimeout(res, 600));
                continue;
            }
            return r;
        } catch (e) {
            lastErr = e;
            if (attempt === 0) await new Promise(res => setTimeout(res, 600));
        }
    }
    throw lastErr || new Error('GitHub request failed after retries.');
}



async function getLegacyManifest() {
    const r = await fetchGitHub(
        apiUrl(LEGACY_MANIFEST, `?ref=${encodeURIComponent(BRANCH)}`),
        { headers: headers() }
    );
    if (r.status === 404) return { manifest: null, sha: null };
    if (!r.ok) throw new Error(`GitHub legacy manifest read failed (${r.status}).`);
    const data = await r.json();
    const text = Buffer.from(data.content, 'base64').toString('utf8');
    let manifest;
    try { manifest = JSON.parse(text); }
    catch { throw new Error('Legacy script manifest is corrupted or invalid JSON.'); }
    if (!manifest || typeof manifest !== 'object' || typeof manifest.scripts !== 'object') {
        throw new Error('Legacy script manifest has an invalid format.');
    }
    return { manifest, sha: data.sha };
}

async function getScript(slug) {
    const r = await fetchGitHub(
        apiUrl(pathFor(slug), `?ref=${encodeURIComponent(BRANCH)}`),
        { headers: headers() }
    );
    if (r.ok) {
        const data = await r.json();
        const text = Buffer.from(data.content, 'base64').toString('utf8');
        let item;
        try { item = JSON.parse(text); }
        catch { throw new Error('Script file is corrupted or invalid JSON.'); }
        if (item.slug && item.slug !== slug) throw new Error('Slug mismatch — possible path traversal attempt.');
        return { item, sha: data.sha, storage: 'file' };
    }
    if (r.status !== 404) throw new Error(`GitHub read failed (${r.status}).`);

    // Backward-compatible fallback for the older single-file locker/scripts.json store.
    const legacy = await getLegacyManifest();
    if (!legacy.manifest) return { item: null, sha: null, storage: 'none' };
    const item = legacy.manifest.scripts?.[slug];
    if (!item) return { item: null, sha: null, storage: 'legacy-manifest' };
    if (item.slug && item.slug !== slug) throw new Error('Slug mismatch — possible path traversal attempt.');
    return { item, sha: legacy.sha, storage: 'legacy-manifest' };
}

async function saveScript(slug, item, sha, message) {
    const content = Buffer.from(JSON.stringify(item, null, 2) + '\n').toString('base64');
    const body = { message, content, branch: BRANCH };
    if (sha) body.sha = sha;
    const r = await fetchGitHub(
        apiUrl(pathFor(slug)),
        { method: 'PUT', headers: headers(), body: JSON.stringify(body) }
    );
    if (!r.ok) {
        const t = await r.text();
        throw new Error(`GitHub write failed (${r.status}): ${t.slice(0, 300)}`);
    }
    return r.json();
}

async function deleteScript(slug, sha, message) {
    const body = { message, sha, branch: BRANCH };
    const r = await fetchGitHub(
        apiUrl(pathFor(slug)),
        { method: 'DELETE', headers: headers(), body: JSON.stringify(body) }
    );
    if (!r.ok) {
        const t = await r.text();
        throw new Error(`GitHub delete failed (${r.status}): ${t.slice(0, 300)}`);
    }
    return r.json();
}

async function listScripts() {
    const r = await fetchGitHub(
        apiUrl(ROOT, `?ref=${encodeURIComponent(BRANCH)}`),
        { headers: headers() }
    );
    if (r.status === 404) return [];
    if (!r.ok) throw new Error(`GitHub list failed (${r.status}).`);
    const data = await r.json();
    if (!Array.isArray(data)) return [];
    return data
        .filter(x => x.type === 'file' && /\.json$/i.test(x.name))
        .map(x => ({
            slug: x.name.replace(/\.json$/i, ''),
            path: x.path,
            sha: x.sha,
            size: x.size
        }));
}

module.exports = { getScript, saveScript, deleteScript, listScripts };
