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
