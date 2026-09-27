# ZumHub execution security

The locker uses a two-stage execution flow:

1. `/api/run?slug=...&key=...` validates the bearer key and returns a short-lived signed verifier bootstrap.
2. The bootstrap runs inside the Roblox/Luau environment and reports runtime, game/place, executor identifier and capability signals.
3. `/api/verify` validates the signed challenge and the per-script security policy. The decrypted source is only returned after the checks pass.

## Free security telemetry

Set `DISCORD_WEBHOOK_URL` in Vercel. The server sends security/execution events to that Discord webhook. Discord documents incoming webhooks as a way to post messages to a channel without a bot user, and the webhook endpoint supports embedded messages.

Events include:

- `execution-start`
- `verify-success`
- `verify-failed`
- `blocked-banned-ip`
- `blocked-browser`
- `blocked-user-agent`
- `bad-access-key`
- `rate-limited`
- loader/script expiry
- server/security-store errors

The webhook is server-side only. Never expose the webhook URL to Roblox/Luau or public frontend code. `DISCORD_WEBHOOK_USERNAME` is optional; `DISCORD_WEBHOOK_DEDUPE_MS` defaults to 5000 ms for same-event/same-IP/same-script suppression on a warm function instance.

## Free persistent IP bans

The ban list is a normal JSON file in the same GitHub vault repository used for the encrypted scripts:

`locker/security/bans.json`

Example:

```json
{
  "v": 1,
  "bans": [
    {
      "ip": "203.0.113.10",
      "reason": "executor spoofing",
      "expiresAt": null,
      "createdAt": "2026-09-27T00:00:00.000Z"
    },
    {
      "ip": "203.0.113.0/24",
      "reason": "abuse from this network",
      "expiresAt": null,
      "createdAt": "2026-09-27T00:00:00.000Z"
    }
  ]
}
```

Exact IPv4/IPv6 and IPv4 CIDR bans are supported. The admin panel can add/remove bans too; direct GitHub editing is the fallback. The execution gate checks the ban list before releasing the protected payload. A short cache window (5 seconds by default) reduces GitHub API traffic; set `SECURITY_BAN_CACHE_MS` to adjust it.

## Available per-script checks

- `game.GameId` allowlist
- `game.PlaceId` allowlist
- `typeof(game) == "Instance"` and `game.ClassName == "DataModel"`
- `typeof(workspace) == "Instance"` and `workspace.ClassName == "Workspace"`
- `game:IsLoaded()`
- `RunService:IsRunning()`
- `Players.LocalPlayer` exists
- `game.HttpGet` exists
- `identifyexecutor()` identifier
- `getexecutorname()` identifier
- mismatch detection when both executor identifiers are present
- optional executor-name allowlist
- optional capability allowlist
- server-side rate limiting
- short-lived signed challenge
- browser-like request rejection with HTTP 403
- `/l`, `/l/*`, and `/l/index.html` are routed to an HTTP 403 endpoint
- persistent IP/CIDR ban gate
- reasoned verification errors
- Discord telemetry for executions and security failures

## Recommended Vercel environment variables

```text
LOCKER_GITHUB_OWNER=...
LOCKER_GITHUB_REPO=...
LOCKER_GITHUB_BRANCH=main
GITHUB_TOKEN=...
LOCKER_SESSION_SECRET=32+ character secret
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/.../...
DISCORD_WEBHOOK_USERNAME=ZumHub Security
SECURITY_BAN_CACHE_MS=5000
```

The GitHub contents API is still subject to rate limits, so this design intentionally avoids writing a GitHub commit for every execution. GitHub documents authenticated REST API requests at a primary limit of 5,000 requests/hour for personal access tokens, with additional secondary limits.

## Important limitation

The executor/game/runtime values originate from the client environment. A hostile executor can hook, spoof, or replay client-visible values. The checks are anti-abuse signals and gates, not proof of authenticity. IP bans identify network addresses, not permanent people/devices, and can be bypassed by changing networks. The project intentionally does not claim 100% anti-bypass protection.

For stronger enforcement, the strongest control remains moving sensitive game logic into Roblox server-side code rather than trusting a client-delivered script.
