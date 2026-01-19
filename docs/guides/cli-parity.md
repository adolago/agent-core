# CLI Parity Guide (Ansible and Terraform)

Phase 0 baseline for CLI parity targets. This guide defines the planned mapping between
Ansible/Terraform commands and the target CLI surface.

## Ansible parity targets

| Ansible command or flag | Target CLI mapping | Status | Notes |
| --- | --- | --- | --- |
| `ansible-playbook` | TBD | Not started | Baseline playbook execution |
| `--check` | TBD | Not started | Dry run parity |
| `--diff` | TBD | Not started | Diff output parity |
| `-i` / `--inventory` | TBD | Not started | Inventory path parity |
| `--limit` | TBD | Not started | Host selection parity |
| `--tags` | TBD | Not started | Tag filtering |
| `--skip-tags` | TBD | Not started | Tag exclusion |
| `--start-at-task` | TBD | Not started | Resume task parity |
| `--list-tasks` | TBD | Not started | Task listing parity |

## Terraform parity targets

| Terraform command | Target CLI mapping | Status | Notes |
| --- | --- | --- | --- |
| `terraform init` | TBD | Not started | Backend and provider init |
| `terraform plan` | TBD | Not started | Plan rendering (human + JSON) |
| `terraform apply` | TBD | Not started | Apply parity |
| `terraform destroy` | TBD | Not started | Destroy parity |
| `terraform show` | TBD | Not started | Plan or state show |
| `terraform state list` | TBD | Not started | State listing |
| `terraform state show` | TBD | Not started | State detail |
| `terraform output` | TBD | Not started | Output parity |
| `terraform import` | TBD | Not started | Import parity |

## Test anchors

Anchors map to `packages/agent-core/test/compat/cli/`.

- CL-01 ansible-playbook baseline
- CL-02 ansible --check
- CL-03 ansible --diff
- CL-04 terraform plan
- CL-05 terraform apply
- CL-06 terraform state
