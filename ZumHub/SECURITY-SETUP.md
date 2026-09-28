# ZumHub V11 security setup

## Required secrets

```text
LOCKER_MASTER_SECRET=<32+ random characters>
LOCKER_SESSION_SECRET=<32+ random characters>
```

Do not reuse the same secret for both values.

## Discord security log

```text
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/WEBHOOK_ID/WEBHOOK_TOKEN
DISCORD_WEBHOOK_USERNAME=ZumHub Security
DISCORD_WEBHOOK_DEDUPE_MS=5000
```

The webhook receives server-observed network information plus client-reported Roblox signals. The webhook URL itself is never sent to the client.

## Optional strict controls

```text
LOCKER_BIND_SESSION_IP=true
LOCKER_L_REQUIRE_PRESENCE=true
LOCKER_DEBUG_SECURITY=false
DISCORD_SHOW_RAW_IP=true
DISCORD_SHOW_USER_AGENT=false
```

`LOCKER_L_REQUIRE_PRESENCE=true` makes public `/l/{slug}` tickets require a server-observed Roblox InGame presence matching UserId, UniverseId, PlaceId and JobId. Because Roblox presence visibility can be restricted, this can reject legitimate users whose presence data is hidden.

`LOCKER_DEBUG_SECURITY=false` is recommended for production. When false, rejected clients receive only a generic reason/request ID. Detailed diagnostics are still sent to the Discord security log.

## Public slug loader

```text
loadstring(game:HttpGet("https://zumhub.vercel.app/l/<slug>"))()
```

Browser navigation to `/l/<slug>` is rejected with HTTP 403. The slug route returns only the verifier bootstrap to non-browser requests; protected source release still requires `/api/verify` authorization.

## Rate limiting

- `/api/run` and `/l/{slug}` share the execution-attempt bucket.
- `/api/verify` has a separate request bucket.
- Repeated verification failures trigger a short per-IP cooldown.

These limits are in-memory and therefore reset when a Vercel process is recycled.

## Ban store

Persistent bans remain in the GitHub-backed `locker/security/bans.json` file. Bans are checked before bootstrap issuance and again before payload release.

## Migration flags

New deployments use slug-bound access-key hashes and AAD-bound payloads. For an older vault that has not been re-saved yet, temporarily set:

```text
LOCKER_ALLOW_LEGACY_ACCESS_KEYS=true
LOCKER_ALLOW_LEGACY_PAYLOAD=true
```

Re-save each script/key, then turn both flags back off. The hardened default is `false`.
