# V9 HTTP Access Protection

This V9 revision hardens the HTTP surface around protected scripts.

- `/api/loader` and `/api/run` return an actual HTTP `403 Forbidden` for missing/invalid loader credentials, disabled/missing scripts, expired loader keys, and expired scripts.
- `/api/verify` returns an actual HTTP `403 Forbidden` for missing/invalid execution capabilities, replayed/expired challenges, failed runtime/game/executor policy checks, and other authorization failures.
- `/api/admin` returns `403 Forbidden` when an admin session is not valid because it can return decrypted script source.
- `/locker` and `/locker/*` are rewritten to the 403 handler so repository-side locker files are not exposed as static files.
- `/api/_*` is rewritten to the 403 handler so internal helper modules are not intended to be directly callable as HTTP endpoints.
- Successful execution remains `200 OK`; infrastructure failures such as an unavailable security store remain `503` rather than being misreported as authorization failures. The execution chain is `/api/loader` → `/api/run` → `/api/verify` → protected payload.

A `403` is an HTTP authorization denial: the server understood the request but refuses access. It is not a claim that the client cannot observe an authorized runtime payload.
