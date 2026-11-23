# ZumHub v2

## Old slugs and URLs (unchanged)
- Loader: `/api/run?slug=<slug>&key=<key>` with optional `.tsNNN` key suffix, same 30 day expiry.
- Slug rules (`2-64 chars, letters, numbers, _ -`), AES-256-GCM payloads (with and without AAD), slug-bound and legacy key hashes, script file format v4, bans.json v1, settings.json (v2 files load fine).
- Routes: `/`, `/home`, `/home/index.html`, `/admin`, `/admin/`, `/l`, `/l/*`, `/l/index.html` and the 404 -> home bounce. `/l/*` still answers 403.
- Fixed: scripts stored under a mixed-case slug failed in run/verify/admin. They resolve now.

## Security
- Admin secret compare no longer accepts NUL-padded input.
- Admin session is now an HttpOnly, SameSite=Strict cookie with a CSRF header and Origin check. Bearer tokens still work.
- Settings are sanitised on write and on read: URL scheme allowlist, length caps, enums, hex colours. The old page rendered settings through innerHTML.
- Home and admin run under a strict CSP (no inline scripts). The old `/admin/(.*)` CSP never matched `/admin` itself.
- `/api/verify` has its own rate limit; request ids are validated.
- HSTS, COOP, noindex on admin/api/locker, `security.txt`, `robots.txt`.
- `/api/settings` caches (30s memory + CDN) instead of hitting GitHub on every page view.

## Site
- New design, accessible (skip link, focus rings, contrast, reduced motion, pinch zoom).
- Projects section (admin > site settings > projects).
- Settings that were saved but ignored now work: typewriter lines, particle settings, custom banner colour, theme background and font, avatar toggle, footer text, social links.
- Ctrl+K palette gains copy link and effects toggle; `g h`, `g l`, `g p` shortcuts now exist.
- `/l` shows a styled locked page to browsers (still 403).
- Admin: config check (`/api/health`), escaped listings.

## Removed
Fake activity sparkline, floating shapes, 3D card tilt, click ripple, magnetic buttons, cursor dot.

## Tests
`npm test` (22 tests, Node 18+).

## v2.2 identification and verification

New per-script identity controls (admin > script > execution security). Old scripts keep working: every new field defaults to off.
- Key identity lock: `off | user | client | both`, with max identities per key. The first successful runs claim slots, extra identities are rejected. Stored in `locker/bindings/<slug>.json`; client ids are stored as HMACs only. Rotating the key clears the slots. The admin panel lists and removes them.
- Allowed Roblox user IDs, minimum account age, optional required client id.
- Bootstrap now also reports client id (`RbxAnalyticsService:GetClientId()`), account age, job id and executor version.
- Server cross-checks: user id must exist and the place must belong to the claimed universe (Roblox APIs, fails open if Roblox is unreachable). `VERIFY_ROBLOX_CROSSCHECK=off` disables.
- `verify` must come from the same IP and HTTP client as `run`. Defaults on; `LOCKER_BIND_SESSION_IP=false` / `LOCKER_BIND_SESSION_UA=false` opt out.
- Optional shared state (Upstash Redis / Vercel KV): single-use challenges and rate limits hold across serverless instances. Without it they are per instance.
- Webhook: discord.com URLs only, mentions and markdown neutralised, 429 backoff. No flood cap by default (set `DISCORD_WEBHOOK_MAX_PER_MIN` to opt in). New fields: client ref, reported account age.
- Identity store outage fails closed.

Limit: all client-reported signals can be forged by someone who controls the client. The lock makes a leaked key useless beyond its allowed identities. It does not make a spoofed client impossible.

Profile: holographic ID card with pointer tilt.

## v2.3 admin debug
- `/api/debug` is invisible (404) unless `LOCKER_DEBUG=on` is set on the server, and also 404 without a valid admin session.
- Report (GET): masked request info, runtime, env var states (set/missing only, never values), feature flags, limits, session expiry.
- Self-test (POST) needs the admin secret again on every run and shares the login rate limit (5 per 15 min). It covers crypto, sessions, challenges, policy, sanitizer, vault, settings, bans, KV, Roblox, webhook config and live header and anonymous-access checks. `deep` adds a temp vault write/delete and the identity lock on the real store. `webhookPing` sends one DEBUG message.
- Admin > debug tab shows the report, runs the test, and lists this browser's recent API calls.

## v2.4 customisation and mobile fixes
- Every link is now data: Admin > links & layout. Edit title, subtitle, url, icon, colour, size; show or hide; reorder with the arrows; flag as hero button or top-bar link. The same list feeds the cards, hero buttons, top bar and Ctrl+K.
- Expired Discord invite? Change the url and save. "check links" tests every url (Discord invites through Discord's invite API) and flags dead ones. Admin only, public hosts only.
- Layout: section order, section titles, link card style (bento, grid, list), Rscripts embed and its username, marquee words, code window.
- Profile card: labels, handle, rows, mark, barcode. Stats: items and visibility.
- Colour presets in site settings (purple, teal, pink, ember, mono).
- Saving always sends the whole settings object, and refuses to save before settings have loaded, so one tab can't wipe another's values.
- Home fixes from a real phone screenshot: clipped descenders in the name, tall card pushing content down, music player covering content (now a small pill, tap the bars to expand), nav label wrapping.
- Old settings.json files load fine; links default to the previous five.

## v2.5 motion and profile
- Profile card on phones is now a real profile: animated banner, overlapping avatar with live dot, verified-style handle, pill chips for the card rows. The name sits above it, so nothing repeats.
- Intro (draw-on logo, once per session), blur-in hero, shining name, line-by-line code window, floating card with idle sheen, glowing primary button, button shine.
- Cursor spotlight and orb parallax (desktop), hero parallax on scroll, a second marquee row that skews with scroll speed, headings that draw their line, card and project border glow, icon wiggle.
- Top bar hides on scroll down and returns on scroll up. Back-to-top button with a progress ring. Large outlined wordmark in the footer.
- Everything stands down for reduced-motion, the effects toggle (Ctrl+K), and automatically below 20% battery on phones that report it (unless you chose a setting yourself).
- `assets/boot.js` (tiny) decides the intro before paint. Without JS the page is still fully visible.

## v2.6 den and more motion
- Secret "den" (SFW): open it by typing `awoo`, `uwu` or `furry` on the page, triple-tapping the big name in the footer, searching "awoo" in Ctrl+K, or going to `/home#den`.
- Inside: moonlit sky with fireflies and twinkling stars, paw prints walking along the ground, a mascot dog with twitching ears, blinking and a wagging tail. Boop the nose (squeak, paw burst, boop counter), hold to pet (fast wag, hearts), optional paw-print cursor trail that stays on after closing.
- All den text is editable in Admin > links & layout > secret den, or switch it off. Defaults are playful placeholders, replace them with your own.
- More motion: drifting code glyphs, section titles that decode as they scroll in, an orbiting sigil behind the profile card on wide screens.
- Everything stands down for reduced-motion and the effects toggle.

## v2.7 link previews
- Sharing the site on Discord, WhatsApp, Telegram, X, Messenger etc now shows a card: title, description and a 1200x630 image (`assets/og.jpg`, 73 KB, under WhatsApp's 300 KB limit).
- Why it was missing: no `og:image`, no `og:url`, a "summary" Twitter card, and `/` only did a JavaScript redirect, which chat apps do not run.
- `/`, `/home` and `/home/` are now served by `api/page.js`, which fills every absolute URL from the domain actually used (works on a custom domain too) and takes title, description and image from Admin > site settings > SEO. `/home/index.html` is still served statically as a fallback and carries the same tags.
- `theme-color` is the brand purple, which Discord uses for the stripe on the card.
- New: `assets/apple-touch-icon.png`, admin field "link preview image".
- Chat apps cache previews. Test with a fresh link such as `/home?v=2`.
