# ZumHub V9 — Access Notifications

## Added

- `/api/run` authorization failures remain real HTTP `403` responses.
- `/api/run` 403 responses are JSON and include `status: 403`, `error`, `message`, and `slug` where appropriate.
- Invalid slug/script returns `invalid-slug`.
- Missing key returns `missing-key`.
- Invalid key returns `invalid-key`.
- Expired loader key returns `loader-expired`.
- Expired script returns `script-expired`.
- The generated Roblox bootstrap displays the script name and source flow after `/api/run` successfully finds the script.
- Verification failures that indicate a changed script/session now use a `Script Updated` or `Loader Expired` notification.
- `/api/verify` uses the same structured 403 format for its authorization failures.

## Important HTTP behavior

A direct Roblox call such as:

```lua
loadstring(game:HttpGet("https://zumhub.vercel.app/api/run?slug=...&key=..."))()
```

cannot be guaranteed to display a Roblox notification for the initial `/api/run` 403. `game:HttpGet` may throw immediately when the HTTP status is non-2xx, before Lua receives the JSON response body.

The server therefore does not weaken `/api/run` to HTTP 200 merely to make a notification possible. A client-side wrapper using an executor request API that exposes the HTTP status can read the JSON error and display the matching notification.

Successful loaders still receive the normal Roblox-side notifications, including the script/source information and later verification/update messages.
