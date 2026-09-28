# ZumHub V9 — Zero-Trust Execution Architecture

V9 reorganizes the loader around a short-lived, signed execution capability rather than a reusable payload URL.

## Flow

1. `/api/run` authenticates the loader key and issues a signed 15-second capability.
2. `/l/{slug}` is the keyless public slug loader: browser-like requests receive HTTP 403, while a non-browser client receives only the verifier bootstrap. Its signed capability is marked executor-only.
3. The capability contains a random nonce, script revision, slug, access-key binding, and optional IP binding.
4. The Roblox bootstrap collects runtime signals and calls `/api/verify`.
5. `/api/verify` validates the signed capability and consumes it before asynchronous work, preventing replay on the same warm Vercel instance.
6. Security policy is evaluated against the reported runtime/game/executor context.
7. Only a successful verification receives the decrypted payload.
8. Discord telemetry is separate from authorization; webhook failures do not decide whether execution is authorized.

## Important limitation

Roblox runtime fields such as executor name, UserId, and capabilities are client-reported signals. They are useful policy inputs but are not cryptographic proof of identity. A hostile executor that controls the client can potentially forge them.

Likewise, once an authorized executor receives executable source, that executor may be able to inspect or capture it. V9 therefore focuses on authorization, replay resistance, revocation, abuse controls, and observability rather than claiming impossible client-side secrecy.

## Optional IP binding

Set `LOCKER_BIND_SESSION_IP=true` if you want the short-lived capability tied to the IP that requested `/api/run`.

Default is `false` because mobile/ISP NAT and changing public IPs can cause legitimate executions to fail.

## Required secret

`LOCKER_SESSION_SECRET` must be at least 32 characters and must be present in Vercel.

## Rate limiting

The execution limiter applies to `/api/run`. `/api/verify` does not consume a second execution slot. A valid signed capability is its own authorization mechanism, and consumed capabilities are rejected on replay.

The replay cache is process-local because this deployment intentionally avoids a paid/shared datastore. Vercel instance recycling can clear that cache; the short signed expiry and cryptographic binding remain enforced.
