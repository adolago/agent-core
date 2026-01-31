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

- [x] local backend
  - `LocalStateBackend` in `src/graph/state.ts`
  - Atomic writes with temp file rename
  - File-based locking with stale lock detection
- [ ] s3 backend
- [ ] http backend
- [ ] gcs backend
- [ ] azurerm backend
- [ ] consul backend
- [ ] backend auth and credentials
- [ ] locking (s3 + dynamodb)
- [ ] locking (consul)
- [x] locking (local file)
  - JSON lock files with metadata
  - 10-minute stale lock timeout

## Providers and modules

- [ ] provider discovery and version constraints
- [ ] plugin cache
- [ ] module registry resolution
- [ ] module source auth

## Resource graph and drift

- [x] graph build (see `docs/architecture/resource-graph-model.md`)
- [x] diff and plan rendering
  - Human-readable output similar to Terraform
  - Attribute-level change tracking
- [x] drift detection
  - `DriftDetector` class with provider interface
  - Drifted, missing, and orphaned resources
- [x] deterministic ordering
  - Alphabetical tie-breaking in topological sort
- [ ] import mapping

## Implementation Status

### Phase 1: Core Graph (COMPLETED)
- Resource graph with topological sort
- Configuration parsing
- State management (local backend)
- Diff engine with plan generation
- Drift detection framework

### Phase 2: CLI Commands (PENDING)
- Command-line interface for graph operations
- Integration with agent-core CLI

### Phase 3: Additional Backends (PENDING)
- S3, HTTP, GCS, AzureRM, Consul backends
- Remote state locking

### Phase 4: Provider Ecosystem (PENDING)
- Provider plugin system
- Module registry integration

## Test plan

Anchors map to `packages/agent-core/test/graph/`.

- [x] TF-01 plan rendering
- [ ] TF-02 apply and destroy
- [x] TF-03 state backends (local)
- [x] TF-04 locking (local)
- [ ] TF-05 provider resolution
- [x] TF-06 drift detection
- [x] TF-07 outputs and variables
- [ ] TF-08 import
