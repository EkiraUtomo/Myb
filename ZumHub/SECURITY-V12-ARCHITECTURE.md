# ZumHub Security V12

V12 hardens the V11 execution gate without changing the protected-payload model.

- Roblox Presence can be enforced globally with `LOCKER_REQUIRE_ROBLOX_PRESENCE=true`.
- `LOCKER_L_REQUIRE_PRESENCE=true` remains accepted as a compatibility fallback and now also enables the global gate.
- Execution tickets move from ticket version 3 to version 4, invalidating older V11 tickets.
- Presence verification checks UserId, PlaceId, UniverseId, and JobId before protected payload release.
- Transient GitHub 429/502/503/504 reads are retried before the security store is considered unavailable.
- Node.js is pinned to 24.x for current Vercel Functions compatibility.
- The server still fails closed when the GitHub-backed ban store cannot be read.

This is a hardening release, not a claim of absolute security.
