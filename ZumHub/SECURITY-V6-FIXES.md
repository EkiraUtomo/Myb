# ZumHub v6 security/webhook fixes

- Removed the in-memory analytics feature and `/api/analytics` endpoint.
- Removed the analytics tab from the admin panel.
- Removed `execution-start` Discord spam; the webhook now focuses on actual outcomes.
- Fixed the verifier bootstrap to use an absolute `/api/verify` URL derived from the Vercel request host, with optional `PUBLIC_BASE_URL` override.
- Discord webhook now clearly reports `ACCEPTED`, `REJECTED`, `BLOCKED`, and `RATE LIMITED`.
- Full IP is shown by default when `DISCORD_SHOW_RAW_IP` is unset or `true`.
- Accepted/rejected messages include the verification result, reason, player/game metadata, executor, capabilities, location, ISP/ASN, IP, fingerprint, verification checks, avatar, and game icon when Roblox enrichment succeeds.
- Client-reported Roblox fields remain explicitly marked as such; network IP/geo data is server-observed.
