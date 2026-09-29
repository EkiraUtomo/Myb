# ZumHub V14 legacy compatibility

V14 keeps the V12 security flow while restoring compatibility with the legacy locker storage layout.

- Primary storage: `locker/scripts/<slug>.json`
- Fallback storage: `locker/scripts.json` with `scripts[slug]`
- `/api/run` still issues a short-lived execution challenge instead of directly returning the protected source.
- `/api/verify` re-reads the script and performs the configured runtime, executor, and Roblox Presence checks before releasing the encrypted/decrypted execution payload.
- Global Roblox Presence enforcement uses `LOCKER_REQUIRE_ROBLOX_PRESENCE=true` (with `LOCKER_L_REQUIRE_PRESENCE` retained as a compatibility fallback).
- Fixed the V12 challenge logging path where `effectivePresence` could be referenced before declaration, causing the request to fall into the generic 404 handler.

This does not make client-side payload extraction impossible: anything ultimately executed by a client must reach that client in some form. The storage changes are for persistence and compatibility, not an absolute anti-dumping guarantee.
