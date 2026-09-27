# ZumHub manual IP bans

This file is read by the locker API from the GitHub vault repository configured by `LOCKER_GITHUB_OWNER`, `LOCKER_GITHUB_REPO`, and `LOCKER_GITHUB_BRANCH`. Copy this file into that vault repository at `locker/security/bans.json` if it does not already exist.

Add an exact IP:

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

IPv4 CIDR is also supported, for example `203.0.113.0/24`.

`expiresAt` is optional. Use `null` for a permanent ban or an ISO-8601 timestamp for a temporary ban.

The execution endpoints check this file before releasing the protected payload.
