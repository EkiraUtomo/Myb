# ZumHub Web Locker

A server-authorized Lua delivery locker added to ZumHub. It deliberately avoids pretending that client-side code can be made impossible to extract. The protection comes from server-side secrets, authenticated storage, encrypted-at-rest payloads, and short-lived signed delivery tokens.

## Routes

- `/l/<slug>` — public delivery page; it only produces a short-lived Roblox loader URL.
- `/admin` — admin console; the secret is sent over HTTPS in an `X-Locker-Admin` header and is never stored in the page.
- `/api/admin` — creates, updates, disables, or deletes entries.
- `/api/issue` — issues a 90-second signed run token.
- `/api/run` — validates the token and decrypts the payload server-side just before delivery.

## Vercel environment variables

Required:

- `GITHUB_TOKEN` — GitHub token with Contents read/write access to the vault repository.
- `LOCKER_GITHUB_OWNER` — repository owner, e.g. `EkiraUtomo`.
- `LOCKER_GITHUB_REPO` — repository containing the encrypted locker database.
- `LOCKER_ADMIN_SECRET` — long random admin secret, at least 20 characters.
- `LOCKER_MASTER_SECRET` — long random encryption/HMAC secret, at least 32 characters.

Recommended:

- `LOCKER_GITHUB_BRANCH` — defaults to `main`.
- `LOCKER_GITHUB_FILE` — defaults to `locker/scripts.json`.
- `LOCKER_PUBLIC_BASE_URL` — canonical HTTPS origin used in generated Roblox loaders.

Do not put any of these values in the repository.

## Storage model

The GitHub JSON file contains only encrypted payloads and non-sensitive metadata. Every payload uses a fresh random IV and AES-256-GCM authentication. The master secret never leaves the Vercel environment.

## Delivery model

`/l/foo` requests a fresh 90-second HMAC-signed token. The generated Roblox loader calls `/api/run?slug=foo&token=...`. The server verifies the signature and expiry, then decrypts the source and returns it as plain text.

This limits exposure, but it cannot make the source mathematically inaccessible to someone who is allowed to execute it: the Roblox client ultimately receives the bytes needed to run the code.
