process.env.LOCKER_MASTER_SECRET = 'm'.repeat(40);
process.env.LOCKER_SESSION_SECRET = 's'.repeat(40);
process.env.LOCKER_ADMIN_SECRET = 'correct-horse-battery';
process.env.LOCKER_GITHUB_OWNER = 'owner';
process.env.LOCKER_GITHUB_REPO = 'vault';
process.env.GITHUB_TOKEN = 'test-token';
process.env.LOCKER_GITHUB_BRANCH = 'main';
delete process.env.DISCORD_WEBHOOK_URL;

const files = new Map();
const calls = [];

function putFile(path, obj) {
    files.set(path, { sha: 'sha-' + files.size, text: JSON.stringify(obj) });
}

const net = { users: 200, universe: 200, universeId: 123, bindingsDown: false, kv: new Map(), kvDown: false };
let shaCounter = 0;

global.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const json = (status, body) => ({ status, ok: status >= 200 && status < 300, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) });

    if (u.hostname === 'users.roblox.com') return json(net.users, net.users === 200 ? { id: 1 } : {});
    if (u.hostname === 'apis.roblox.com') return json(net.universe, net.universe === 200 ? { universeId: net.universeId } : {});
    if (u.hostname === 'kv.test') {
        if (net.kvDown) return json(500, {});
        const cmd = JSON.parse(opts.body);
        if (cmd[0] === 'SET') { if (net.kv.has(cmd[1])) return json(200, { result: null }); net.kv.set(cmd[1], '1'); return json(200, { result: 'OK' }); }
        if (cmd[0] === 'INCR') { const n = (Number(net.kv.get(cmd[1])) || 0) + 1; net.kv.set(cmd[1], n); return json(200, { result: n }); }
        return json(200, { result: 1 });
    }

    const marker = '/contents/';
    const path = decodeURIComponent(u.pathname.slice(u.pathname.indexOf(marker) + marker.length));
    calls.push({ method: opts.method || 'GET', path });
    if (path.startsWith('locker/bindings/') && net.bindingsDown) return json(500, {});

    if ((opts.method || 'GET') === 'DELETE') {
        if (!files.has(path)) return json(404, {});
        files.delete(path);
        return json(200, {});
    }

    if ((opts.method || 'GET') === 'PUT') {
        const body = JSON.parse(opts.body);
        const cur = files.get(path);
        if (cur && body.sha !== cur.sha) return json(409, {});
        const text = Buffer.from(body.content, 'base64').toString('utf8');
        const sha = 'w' + (++shaCounter);
        files.set(path, { sha, text });
        return json(200, { content: { sha } });
    }
    const f = files.get(path);
    if (!f) return json(404, {});
    return json(200, { content: Buffer.from(f.text).toString('base64'), sha: f.sha });
};

let ipCounter = 10;
function freshIp() {
    ipCounter += 1;
    return `203.0.113.${ipCounter}`;
}

function makeReq({ method = 'GET', query = {}, headers = {}, body } = {}) {
    return {
        method,
        query,
        body,
        headers: {
            'user-agent': 'Roblox/WinInet',
            'x-forwarded-for': freshIp(),
            'x-forwarded-proto': 'https',
            host: 'zumhub.test',
            ...headers,
        },
        socket: {},
    };
}

function makeRes() {
    const res = {
        statusCode: 200,
        headers: {},
        body: undefined,
        setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
        status(c) { this.statusCode = c; return this; },
        send(b) { this.body = b; return this; },
        json(b) { this.headers['content-type'] = 'application/json'; this.body = JSON.stringify(b); return this; },
    };
    return res;
}

const goodState = {
    userId: '1', playerName: 'tester', displayName: 'tester', accountAgeDays: 900, clientId: 'client-aaaaaaaa-0001', jobId: 'job-1',
    gameId: '123', placeId: '456',
    runtime: { gameType: 'Instance', workspaceType: 'Instance', gameLoaded: true, runServiceRunning: true, localPlayer: true, httpGet: true },
    executor: { primary: 'Wave', secondary: 'Wave', match: true },
    capabilities: { identifyexecutor: true, request: true },
};

module.exports = { files, calls, putFile, makeReq, makeRes, goodState, net, freshIp };
