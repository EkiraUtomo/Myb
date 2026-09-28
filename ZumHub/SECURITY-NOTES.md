# ZumHub Locker security notes

V11 is a layered authorization system, not a promise of impossible client-side secrecy.

The executor receives the bootstrap because it must execute it. A dumper can therefore inspect the bootstrap. The design instead minimizes what a dumped bootstrap reveals and makes the server-side payload gate independent of client-side checks.

Production recommendations:

- Use a unique random `LOCKER_MASTER_SECRET` of at least 32 characters.
- Use a separate unique random `LOCKER_SESSION_SECRET` of at least 32 characters.
- Keep `LOCKER_DEBUG_SECURITY=false`.
- Enable `LOCKER_BIND_SESSION_IP=true` when mobile/network churn is acceptable.
- Enable `LOCKER_L_REQUIRE_PRESENCE=true` for the strictest public slug route, understanding that Roblox Presence visibility can be restricted.
- Prefer the bootstrap's POST verification path when the executor exposes `request`, `http_request`, or `syn.request`.
- Treat executor identifiers, capabilities, and Roblox client state as signals, not cryptographic proof.
- Once an authorized executor receives plaintext source, client-side dumping cannot be completely prevented.

V11 uses a process-local replay cache. True global atomic one-time ticket consumption requires a shared datastore.
