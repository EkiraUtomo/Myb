# ZumHub V9 — Real HTTP 403 Execution Chain

The script execution chain is:

`/api/loader` → `/api/run` → `/api/verify` → protected payload

Authorization failures on all three execution endpoints now return a real HTTP `403 Forbidden` response. The response body is JSON and includes `status: 403`, an error code, and a human-readable message.

`200 OK` is reserved for successful execution-chain responses. Rate limiting remains `429`, security-store availability failures remain `503`, unsupported methods remain `405`, and unexpected server failures remain `500`.

The loader endpoint no longer returns executable Lua with HTTP 200 for denied requests. This prevents an HTTP authorization failure from being disguised as a successful response.
