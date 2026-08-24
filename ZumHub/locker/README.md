# ZumHub Locker

## Environment variables

- `GITHUB_TOKEN`
- `LOCKER_GITHUB_OWNER=EkiraUtomo`
- `LOCKER_GITHUB_REPO=ZumHub-Locker`
- `LOCKER_GITHUB_BRANCH=main`
- `LOCKER_GITHUB_FILE=locker/scripts.json`
- `LOCKER_ADMIN_SECRET` — at least 20 characters
- `LOCKER_MASTER_SECRET` — at least 32 characters
- `LOCKER_SESSION_SECRET` — at least 32 characters, different from the other secrets
- `LOCKER_PUBLIC_BASE_URL` — deployed site origin, e.g. `https://example.vercel.app`

## Model

The admin secret authenticates the admin login. A signed, HttpOnly, Secure, SameSite=Strict session cookie is then used for admin API calls. The browser never receives the master or GitHub secret.

Each locker source is encrypted with AES-256-GCM before being written to the GitHub vault. Each script also gets a random 256-bit bearer capability. Only its SHA-256 hash is stored. The resulting loader contains the capability URL and is permanent by default.

A permanent capability URL can be revoked by disabling/deleting the locker or regenerating its access key. Anyone who obtains the complete capability URL can use it; this is an inherent property of bearer URLs and Roblox client-side execution.
