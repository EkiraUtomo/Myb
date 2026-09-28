# ZumHub Security v8 — Roblox-side verification feedback

## Added

- Roblox notification when verification starts.
- Roblox notification when verification is accepted.
- Roblox notification when verification is rejected, including the reason and detailed server explanation.
- Verification check summary is shown when available.
- Request ID is included for execution/payload errors.
- Empty payload, invalid JSON response, network/HTTP failure, payload compile failure, and protected-script runtime failure now produce a Roblox notification instead of only a generic error.

## Response flow

`/api/verify` now returns a JSON envelope to the Roblox bootstrap after a valid challenge is established. The protected source is only included in the response when every configured verification check passes. Rejected responses contain no protected payload.

Browser-like direct requests are still blocked before this client response path.
