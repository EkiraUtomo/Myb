# ZumHub V9 — Real HTTP 403 Execution Chain

The script execution chain is:

`/api/loader` → `/api/run` → `/api/verify` → protected payload

Authorization failures on all three execution endpoints now return a real HTTP `403 Forbidden` response. The response body is JSON and includes `status: 403`, an error code, and a human-readable message.

`200 OK` is reserved for successful execution-chain responses. Rate limiting remains `429`, security-store availability failures remain `503`, unsupported methods remain `405`, and unexpected server failures remain `500`.

The loader endpoint no longer returns executable Lua with HTTP 200 for denied requests. This prevents an HTTP authorization failure from being disguised as a successful response.


## Execution compatibility fix

The admin panel generates `/api/run` loaders so the normal Roblox entrypoint remains the established execution endpoint. `/api/loader` remains protected and returns real HTTP 403 responses for authorization failures. When `/api/loader` is used directly, its internal handoff forwards the normalized (timestamp-stripped) access key to `/api/run`.
