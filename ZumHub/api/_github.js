const REPO_OWNER = process.env.LOCKER_GITHUB_OWNER;
const REPO_NAME = process.env.LOCKER_GITHUB_REPO;
const BRANCH = process.env.LOCKER_GITHUB_BRANCH || 'main';
const ROOT = 'locker/scripts';

function env(name, value) { if (!value) throw new Error(`${name} is not configured.`); return value; }
function headers() {
  return {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${env('GITHUB_TOKEN', process.env.GITHUB_TOKEN)}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };
}
function repo() {
  return {
    owner: env('LOCKER_GITHUB_OWNER', REPO_OWNER),
    name: env('LOCKER_GITHUB_REPO', REPO_NAME)
  };
}
function pathFor(slug) { return `${ROOT}/${slug}.json`; }
function apiUrl(path, query='') {
  const {owner,name}=repo();
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${path}${query}`;
}
async function getScript(slug) {
  const r = await fetch(apiUrl(pathFor(slug), `?ref=${encodeURIComponent(BRANCH)}`), {headers: headers()});
  if (r.status === 404) return {item:null, sha:null};
  if (!r.ok) throw new Error(`GitHub read failed (${r.status}).`);
  const data = await r.json();
  const text = Buffer.from(data.content, 'base64').toString('utf8');
  let item; try { item = JSON.parse(text); } catch { throw new Error('Locker script file is not valid JSON.'); }
  return {item, sha:data.sha};
}
async function saveScript(slug, item, sha, message) {
  const content = Buffer.from(JSON.stringify(item, null, 2) + '\n').toString('base64');
  const body = {message, content, branch:BRANCH};
  if (sha) body.sha = sha;
  const r = await fetch(apiUrl(pathFor(slug)), {method:'PUT',headers:headers(),body:JSON.stringify(body)});
  if (!r.ok) { const t=await r.text(); throw new Error(`GitHub write failed (${r.status}): ${t.slice(0,300)}`); }
  return r.json();
}
async function deleteScript(slug, sha, message) {
  const body={message,sha,branch:BRANCH};
  const r=await fetch(apiUrl(pathFor(slug)), {method:'DELETE',headers:headers(),body:JSON.stringify(body)});
  if (!r.ok) { const t=await r.text(); throw new Error(`GitHub delete failed (${r.status}): ${t.slice(0,300)}`); }
  return r.json();
}
async function listScripts() {
  const r=await fetch(apiUrl(ROOT, `?ref=${encodeURIComponent(BRANCH)}`), {headers:headers()});
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`GitHub list failed (${r.status}).`);
  const data=await r.json();
  if (!Array.isArray(data)) return [];
  return data.filter(x=>x.type==='file' && /\.json$/i.test(x.name)).map(x=>({
    slug:x.name.replace(/\.json$/i,''),
    path:x.path,
    sha:x.sha,
    size:x.size
  }));
}
module.exports={getScript,saveScript,deleteScript,listScripts};
