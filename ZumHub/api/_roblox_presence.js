const TIMEOUT_MS = 4500;

async function postJson(url, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const r = await fetch(url, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'ZumHub-Locker/12',
            },
            body: JSON.stringify(body),
        });
        if (!r.ok) return null;
        return await r.json();
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

async function checkRobloxPresence(userId) {
    if (!/^\d+$/.test(String(userId || ''))) {
        return { available: false, error: 'invalid-user-id' };
    }

    const data = await postJson('https://presence.roblox.com/v1/presence/users', {
        userIds: [Number(userId)]
    });
    const p = Array.isArray(data?.userPresences) ? data.userPresences[0] : null;
    if (!p) return { available: false, error: 'no-presence-record' };

    return {
        available: true,
        userId: String(p.userId ?? ''),
        userPresenceType: Number(p.userPresenceType),
        placeId: p.placeId == null ? '' : String(p.placeId),
        rootPlaceId: p.rootPlaceId == null ? '' : String(p.rootPlaceId),
        universeId: p.universeId == null ? '' : String(p.universeId),
        gameId: p.gameId == null ? '' : String(p.gameId),
        lastOnline: p.lastOnline || null,
    };
}

module.exports = { checkRobloxPresence };
