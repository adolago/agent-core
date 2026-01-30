# Upstream Sync Policy (Zee)

This repository is the single source of truth for Zee. Do not sync, mirror, or
track upstream repositories.

## Policy

- No upstream remotes or automated sync jobs.
- No cherry-picking external history into this repo.
- Do not introduce legacy naming in new code or documentation.


Web UI and mobile apps are intentionally removed from this repo. Do not reintroduce
non-Rust desktop apps (Tauri/Electron) or web clients from external sources.
Supported surfaces are:
- agent-core CLI/TUI
- Zee Gateway (WhatsApp/Telegram)
- Rust GPUI desktop (Stanley + agent-core)

## If you need upstream ideas

Reimplement the needed behavior inside this repo and keep naming consistent
with Zee.

Last updated: January 29, 2026
