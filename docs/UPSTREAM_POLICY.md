# Upstream Sync Policy (Zee)

This repository is the single source of truth for Zee. Do not sync, mirror, or
track upstream repositories.

## Policy

- No upstream remotes or automated sync jobs.
- No cherry-picking external history into this repo.
- Do not introduce legacy naming in new code or documentation.

## Mobile apps

Mobile and desktop apps are intentionally removed from this repo. Do not reintroduce
app code from external sources. Zee supports the Gateway and CLI only.

## If you need upstream ideas

Reimplement the needed behavior inside this repo and keep naming consistent
with Zee.

Last updated: January 29, 2026
