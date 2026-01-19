# Ansible Compatibility Gap

Phase 0 baseline for Ansible parity. This document is the single source of truth for the top 20
module compatibility matrix and the test anchors that will gate parity.

## Status legend

- Not started
- In progress
- Partial
- Parity

## Top 20 module compatibility matrix

| Module | Status | Known gaps | Test anchor |
| --- | --- | --- | --- |
| `copy` | Not started | TBD | AN-01 |
| `template` | Not started | TBD | AN-02 |
| `file` | Not started | TBD | AN-03 |
| `lineinfile` | Not started | TBD | AN-04 |
| `blockinfile` | Not started | TBD | AN-05 |
| `service` | Not started | TBD | AN-06 |
| `systemd` | Not started | TBD | AN-07 |
| `package` | Not started | TBD | AN-08 |
| `apt` | Not started | TBD | AN-09 |
| `yum` | Not started | TBD | AN-10 |
| `user` | Not started | TBD | AN-11 |
| `group` | Not started | TBD | AN-12 |
| `command` | Not started | TBD | AN-13 |
| `shell` | Not started | TBD | AN-14 |
| `stat` | Not started | TBD | AN-15 |
| `setup` | Not started | TBD | AN-16 |
| `git` | Not started | TBD | AN-17 |
| `get_url` | Not started | TBD | AN-18 |
| `unarchive` | Not started | TBD | AN-19 |
| `cron` | Not started | TBD | AN-20 |

## Test plan (golden fixtures)

Test anchors map to fixture definitions under `packages/agent-core/test/compat/ansible/`.

- AN-01 copy
- AN-02 template
- AN-03 file
- AN-04 lineinfile
- AN-05 blockinfile
- AN-06 service
- AN-07 systemd
- AN-08 package
- AN-09 apt
- AN-10 yum
- AN-11 user
- AN-12 group
- AN-13 command
- AN-14 shell
- AN-15 stat
- AN-16 setup
- AN-17 git
- AN-18 get_url
- AN-19 unarchive
- AN-20 cron

## Acceptance criteria

- Each module has golden fixtures and regression tests.
- Parity status is updated when tests pass against Ansible outputs.

## Related docs

- `docs/ALPHA_READINESS_ISSUES.md`
- `docs/guides/cli-parity.md`
