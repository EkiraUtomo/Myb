export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

    const token = process.env.GITHUB_TOKEN;
    if (!token) return res.status(500).json({ error: 'no token configured' });

    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch(e) { return res.status(400).json({ error: 'invalid body' }); }

    const { content, filename } = body;
    if (!content || !filename) return res.status(400).json({ error: 'missing content or filename' });

    const owner = 'UwURaww';
    const repo = 'Obfuscateds';
    const branch = 'main';
    const encoded = Buffer.from(content).toString('base64');

    let sha = null;
    try {
        const check = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filename}?ref=${branch}`, {
            headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'ZumHub' }
        });
        if (check.ok) { const ex = await check.json(); sha = ex.sha; }
    } catch(e) {}

    const payload = { message: `upload ${filename}`, content: encoded, branch };
    if (sha) payload.sha = sha;

    const upload = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filename}`, {
        method: 'PUT',
        headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'ZumHub' },
        body: JSON.stringify(payload)
    });

    if (!upload.ok) {
        const err = await upload.json();
        return res.status(500).json({ error: err.message || 'upload failed' });
    }

    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filename}`;
    return res.status(200).json({ url: rawUrl, filename });
}
