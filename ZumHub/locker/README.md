# ZumHub Locker storage

Locker scripts are stored one-per-file under `locker/scripts/<slug>.json` in the separate vault repository.

Each file contains metadata and an AES-256-GCM encrypted payload. The admin searcher lists files from the directory, so adding a very large script does not append it to one shared `scripts.json` database.

The legacy `locker/scripts.json` file is no longer used by the current API.
