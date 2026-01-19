# Terraform Integration Parity Checklist

Phase 0 baseline for Terraform parity.

## CLI parity checklist

- [ ] init
- [ ] validate
- [ ] plan (human + JSON)
- [ ] apply
- [ ] destroy
- [ ] show
- [ ] output
- [ ] import
- [ ] state list/show/pull/push
- [ ] workspace list/new/select/delete

## State backends and locking

- [ ] local backend
- [ ] s3 backend
- [ ] http backend
- [ ] gcs backend
- [ ] azurerm backend
- [ ] consul backend
- [ ] backend auth and credentials
- [ ] locking (s3 + dynamodb)
- [ ] locking (consul)
- [ ] locking (local file)

## Providers and modules

- [ ] provider discovery and version constraints
- [ ] plugin cache
- [ ] module registry resolution
- [ ] module source auth

## Resource graph and drift

- [ ] graph build (see `docs/architecture/resource-graph-model.md`)
- [ ] diff and plan rendering
- [ ] drift detection
- [ ] deterministic ordering
- [ ] import mapping

## Test plan

Anchors map to `packages/agent-core/test/compat/terraform/`.

- TF-01 plan rendering
- TF-02 apply and destroy
- TF-03 state backends
- TF-04 locking
- TF-05 provider resolution
- TF-06 drift detection
- TF-07 outputs and variables
- TF-08 import
