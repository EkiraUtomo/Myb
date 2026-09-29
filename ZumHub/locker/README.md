# ZumHub Locker storage

The primary locker format is one encrypted JSON file per slug under `locker/scripts/<slug>.json`.

For backward compatibility, the API also reads the older `locker/scripts.json` manifest when the per-script file is not present. Existing one-file scripts continue to use their stored payload, access-key hash, security settings, and expiry.

The API does not require an empty `locker/scripts/` directory to exist locally; GitHub is queried directly. New admin writes continue to use the per-script file format.

Payloads are encrypted before storage. The repository should be treated as storage, not as a place to expose plaintext source.
