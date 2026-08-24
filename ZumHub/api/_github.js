const REPO_OWNER = process.env.LOCKER_GITHUB_OWNER;
const REPO_NAME = process.env.LOCKER_GITHUB_REPO;
const BRANCH = process.env.LOCKER_GITHUB_BRANCH || 'main';
const FILE_PATH = process.env.LOCKER_GITHUB_FILE || 'locker/scripts.json';

function env(name, value) {
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}
function headers() {
  return {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${env('GITHUB_TOKEN', process.env.GITHUB_TOKEN)}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };
}
async function getDb() {
  const owner = env('LOCKER_GITHUB_OWNER', REPO_OWNER);
  const repo = env('LOCKER_GITHUB_REPO', REPO_NAME);
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${FILE_PATH}?ref=${encodeURIComponent(BRANCH)}`;
  const r = await fetch(url, { headers: headers() });
  if (r.status === 404) return { version: 1, scripts: {}, sha: null };
  if (!r.ok) throw new Error(`GitHub read failed (${r.status}).`);
  const data = await r.json();
  const text = Buffer.from(data.content, 'base64').toString('utf8');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('Locker database is not valid JSON.'); }
  return { version: parsed.version || 1, scripts: parsed.scripts || {}, sha: data.sha };
}
async function saveDb(scripts, sha, message) {
  const owner = env('LOCKER_GITHUB_OWNER', REPO_OWNER);
  const repo = env('LOCKER_GITHUB_REPO', REPO_NAME);
  const content = Buffer.from(JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), scripts }, null, 2) + '\n').toString('base64');
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${FILE_PATH}`;
  const body = { message, content, branch: BRANCH };
  if (sha) body.sha = sha;
  const r = await fetch(url, { method: 'PUT', headers: headers(), body: JSON.stringify(body) });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`GitHub write failed (${r.status}): ${t.slice(0, 300)}`);
  }
  return r.json();
}
module.exports = { getDb, saveDb };
