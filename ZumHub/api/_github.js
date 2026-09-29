const REPO_OWNER = process.env.LOCKER_GITHUB_OWNER;
const REPO_NAME  = process.env.LOCKER_GITHUB_REPO;
const BRANCH     = process.env.LOCKER_GITHUB_BRANCH || 'main';
const ROOT       = 'locker/scripts';
const LEGACY_ROOTS = ['scripts', 'locker'];
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

async function parseScriptResponse(r, slug) {
    if (!r.ok) return null;
    const data = await r.json();
    if (!data || !data.content) return null;
    const text = Buffer.from(data.content, 'base64').toString('utf8');
    let item;
    try { item = JSON.parse(text); }
    catch { throw new Error('Script file is corrupted or invalid JSON.'); }
    if (item.slug && item.slug !== slug) throw new Error('Slug mismatch — possible path traversal attempt.');
    return { item, sha: data.sha || null };
}

async function getAtPath(path, slug, ref = BRANCH) {
    const r = await fetchGitHub(
        apiUrl(path, `?ref=${encodeURIComponent(ref)}`),
        { headers: headers() }
    );
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub read failed (${r.status}).`);
    return parseScriptResponse(r, slug);
}

async function findHistoricalScript(slug) {
    const path = pathFor(slug);
    const r = await fetchGitHub(
        apiUrl('commits', `?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(BRANCH)}&per_page=1`),
        { headers: headers() }
    );
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub history lookup failed (${r.status}).`);
    const commits = await r.json();
    if (!Array.isArray(commits) || !commits.length || !commits[0]?.sha) return null;

    const commitSha = commits[0].sha;
    const current = await getAtPath(path, slug, commitSha);
    if (current) return current;

    // If the newest commit deleted the file, inspect its first parent.
    const detail = await fetchGitHub(
        apiUrl(`commits/${encodeURIComponent(commitSha)}`),
        { headers: headers() }
    );
    if (!detail.ok) return null;
    const commit = await detail.json();
    const parentSha = commit?.parents?.[0]?.sha;
    if (!parentSha) return null;
    return getAtPath(path, slug, parentSha);
}

async function getScript(slug, options = {}) {
    const current = await getAtPath(pathFor(slug), slug, BRANCH);
    if (current) return current;

    // Backwards compatibility for older installations that stored scripts outside locker/scripts.
    for (const root of LEGACY_ROOTS) {
        const candidates = [`${root}/${slug}.json`, `${root}/scripts/${slug}.json`];
        for (const path of candidates) {
            const legacy = await getAtPath(path, slug, BRANCH);
            if (!legacy) continue;
            if (options.migrate !== false) {
                try {
                    const restored = await saveScript(slug, legacy.item, null, `locker: migrate legacy ${slug}`);
                    return { item: legacy.item, sha: restored?.content?.sha || null, migrated: true };
                } catch (e) {
                    // Read compatibility must still work when the token is read-only.
                    return { item: legacy.item, sha: legacy.sha, migrated: false };
                }
            }
            return legacy;
        }
    }

    // If a deployment accidentally removed a script file from the current tree,
    // recover the latest version still present in Git history and restore it.
    const historical = await findHistoricalScript(slug);
    if (historical) {
        if (options.migrate !== false) {
            try {
                const restored = await saveScript(slug, historical.item, null, `locker: restore deleted script ${slug}`);
                return { item: historical.item, sha: restored?.content?.sha || null, migrated: true };
            } catch (e) {
                return { item: historical.item, sha: historical.sha, migrated: false };
            }
        }
        return historical;
    }

    return { item: null, sha: null, migrated: false };
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
