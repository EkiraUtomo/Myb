const { readSettings } = require('./_settings');

const FALLBACK = {
    message: 'this is a locked endpoint. the source, loader, and access key are not available here.',
    contactText: 'contact DoggoJr if you need access.',
};

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function page(copy) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
<meta name="color-scheme" content="dark">
<title>Locked — ZumHub</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box;margin:0}
body{min-height:100vh;display:grid;place-items:center;padding:24px;background:#07070f;color:#a89fcc;font:15px/1.7 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
main{max-width:460px;width:100%}
.code{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#564e70}
h1{font:700 clamp(2.4rem,9vw,3.6rem)/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:-.04em;color:#f0ecff;margin:.5rem 0 1.25rem}
h1 span{color:#a07ee0}
p{margin-bottom:.75rem}
.contact{color:#f0ecff}
a{display:inline-block;margin-top:1.25rem;color:#a07ee0;text-decoration:none;border-bottom:1px solid #3d2475;padding-bottom:2px}
a:hover,a:focus-visible{color:#c9b0ff;border-color:#a07ee0}
</style>
</head>
<body>
<main>
<div class="code">403 / locked endpoint</div>
<h1>Nothing<span>.</span></h1>
<p>${esc(copy.message)}</p>
<p class="contact">${esc(copy.contactText)}</p>
<a href="/home">back to the site</a>
</main>
</body>
</html>`;
}

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Referrer-Policy', 'no-referrer');

    const wantsHtml = req.method === 'GET' && String(req.headers?.accept || '').toLowerCase().includes('text/html');
    if (!wantsHtml) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(403).send('Forbidden');
    }

    let copy = FALLBACK;
    try {
        const { settings } = await readSettings();
        copy = settings.locker || FALLBACK;
    } catch {
        copy = FALLBACK;
    }

    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(403).send(page(copy));
};
