# ZumHub V11 — layered zero-trust execution

V11 keeps the V9 authorization model but removes readable ticket claims from the bootstrap, adds a POST verification path, reduces client-side diagnostic leakage, adds independent verification abuse controls, and supports optional server-side Roblox Presence attestation.

## Execution flow

1. `/api/run` or `/l/{slug}` authenticates the loader request shape and checks the GitHub-backed ban list.
2. A short-lived execution ticket is created. The ticket claims are encrypted with AES-256-GCM under `LOCKER_SESSION_SECRET`, so a dumped loader no longer exposes readable challenge claims.
3. The ticket is bound to the issued request ID and, when enabled, the request IP hash.
4. The bootstrap gathers Roblox/runtime signals and generates a per-execution client nonce.
5. Executors with `request`, `http_request`, or `syn.request` use `POST /api/verify` so the ticket and state are not placed in the URL. A `game:HttpGet` fallback remains for compatibility.
6. The verifier validates ticket authenticity, expiry, request binding, IP binding when enabled, and single-use state.
7. The protected script metadata is re-read from the private GitHub vault and must still match the ticket's slug/version/access-key binding.
8. `/l/{slug}` forces the runtime/executor gate even when the per-script optional flags are disabled.
9. Optional `requireRobloxPresence` performs a server-side POST to Roblox's Presence endpoint. In strict mode it requires an InGame presence and matching UserId, UniverseId, PlaceId and JobId.
10. Only after all checks pass is the AES-256-GCM protected script decrypted and returned.

## Client-side limitations

The bootstrap still exists on the executor and can therefore be dumped or modified. Client-reported executor names, capabilities, UserId, GameId, PlaceId and JobId are signals, not cryptographic identity proof. An attacker controlling the executor can attempt to forge them.

The meaningful security boundary is the server authorization decision. Modifying or dumping the bootstrap should not be sufficient to obtain the protected payload.

## V11 protections

- Encrypted opaque execution tickets.
- 15-second ticket expiry.
- Request-ID binding inside the encrypted ticket.
- Optional IP binding with `LOCKER_BIND_SESSION_IP=true`.
- Process-local replay consumption for warm Vercel instances.
- Separate `/api/run` and `/api/verify` rate limits.
- Verification failure cooldown after repeated failures.
- Request-size limits for verification state.
- Browser/client-shape blocking remains a filter, not the primary authorization control.
- Production client responses expose generic failure messages by default.
- Full diagnostics remain available to Discord telemetry.
- Optional server-side Roblox Presence attestation.
- `X-Robots-Tag: noindex, nofollow, noarchive` and no-cache headers on protected routes.

## Presence attestation

Roblox currently documents `POST /v1/presence/users` on `presence.roblox.com`. The endpoint can return fields including presence type, place ID, root place ID, game/server ID and universe ID. Presence visibility can vary by privacy settings, so strict mode may reject users whose presence details are unavailable.

Enable strict Presence for a script in the admin panel with `Roblox presence attestation = required`, or for every `/l/{slug}` ticket with:

```text
LOCKER_L_REQUIRE_PRESENCE=true
```

The public `/l` strict-presence switch is intentionally separate from the per-script option so existing scripts do not unexpectedly stop working because a user's presence is hidden.

## Global single-use limitation

The replay cache is intentionally process-local because this project does not require a paid/shared datastore. A Vercel cold start or different serverless instance can clear the cache. The cryptographic ticket expiry, request binding and optional IP binding still apply, but strict cross-instance atomic one-time consumption requires a shared datastore.
