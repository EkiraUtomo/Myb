# ZumHub free security setup

## 1. Discord execution/security log

Create an Incoming Webhook in the Discord channel where you want the log messages.

Add this Vercel environment variable:

```text
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/WEBHOOK_ID/WEBHOOK_TOKEN
```

Optional:

```text
DISCORD_WEBHOOK_USERNAME=ZumHub Security
DISCORD_WEBHOOK_DEDUPE_MS=5000
```

The server sends the IP, script, request ID, result/reason, game ID, place ID, executor identifiers, capability summary and fingerprint when those values are available. The webhook URL itself never goes to the client.

## 2. Manual persistent bans

In the same GitHub vault repository used by the encrypted scripts, create:

```text
locker/security/bans.json
```

Start with:

```json
{
  "v": 1,
  "bans": []
}
```

Add an exact address:

```json
{
  "v": 1,
  "bans": [
    {
      "ip": "203.0.113.10",
      "reason": "executor spoofing",
      "expiresAt": null,
      "createdAt": "2026-09-27T00:00:00.000Z"
    }
  ]
}
```

IPv4 CIDR is supported too:

```json
"ip": "203.0.113.0/24"
```

`expiresAt: null` means permanent. Otherwise use an ISO-8601 timestamp.

The admin page also has a Security tab where you can add/remove bans without manually editing JSON.

## 3. What happens after a ban

The ban is checked before `/api/run` releases the verifier and again before `/api/verify` releases the decrypted script.

A banned address receives:

```text
403 Forbidden: IP banned — <your reason>
```

The event is also sent to Discord.

## 4. Free-service limitation

This build does not require Redis, Vercel KV, a paid database, or a separate logging service. GitHub is used as the persistent ban/config store and Discord is used as the log destination.

GitHub API requests still have rate limits. The project therefore caches the ban file for a short period and does not create a GitHub commit for every execution.

## v5 analytics + rich Discord telemetry

Optional environment variables:

- `DISCORD_WEBHOOK_URL` — Discord webhook URL; keep server-side.
- `DISCORD_WEBHOOK_USERNAME` — default `ZumHub Security`.
- `DISCORD_WEBHOOK_DEDUPE_MS` — default `5000`.
- `DISCORD_SHOW_RAW_IP` — default `false`; set `true` only if you explicitly want raw IPs in Discord.
- `DISCORD_SHOW_USER_AGENT` — default `false`.

The verifier now reports the Roblox `UserId`, username/display name, GameId/PlaceId, executor identifiers, runtime checks and capabilities. Server-side enrichment resolves Roblox profile/game thumbnails and basic IP geolocation when available. Client-reported Roblox fields remain untrusted signals and are labeled as such in the webhook footer.

The admin panel has an `analytics` tab with live-instance totals, top games/scripts/executors/rejection reasons, and recent events. These counters are intentionally in-memory because Vercel serverless instances are ephemeral; Discord remains the event stream. No paid analytics database is required.
