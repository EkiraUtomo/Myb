# ZumHub Locker V13 — Script Compatibility & Recovery

V13 keeps the existing `locker/scripts/{slug}.json` storage format and adds backwards-compatible recovery.

- Existing scripts are never intentionally replaced during deployment.
- If a slug is missing from the current `locker/scripts` tree, the server checks legacy locations (`scripts/{slug}.json`, `locker/{slug}.json`, and `locker/scripts/{slug}.json` history).
- If the current file was deleted but still exists in Git history, V13 restores the latest recoverable version automatically.
- Legacy files are migrated into `locker/scripts/{slug}.json` on first access when the GitHub token has write permission.
- If the GitHub token is read-only, the recovered legacy copy can still be used for that request without migration.
- Git history recovery cannot recover a script after the repository history itself has been permanently removed or force-pushed away.

The migration preserves the existing encrypted payload, access-key hash, enabled state, expiry, description, security policy, and version metadata unless the stored object itself is invalid.
