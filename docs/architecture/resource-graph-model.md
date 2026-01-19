# Resource Graph Model

Phase 0 baseline for the provisioning graph model.

## Model overview

- Nodes: resource, data source, provider, module
- Edges: explicit depends_on, implicit references, provider wiring
- Phases: parse -> graph build -> plan -> apply -> state -> drift check

## Drift and diff model

- Normalize desired vs current state
- Classify create, update, delete, noop
- Track replace vs in-place changes
- Emit deterministic diff order

## Parity checklist

- [ ] graph construction from config
- [ ] topological sort with stable ordering
- [ ] state snapshot schema
- [ ] diff engine
- [ ] drift report output
- [ ] import mapping
- [ ] failure recovery

## Test plan

Anchors map to `packages/agent-core/test/compat/terraform/`.

- RG-01 graph build
- RG-02 deterministic ordering
- RG-03 diff classification
- RG-04 drift report
- RG-05 import mapping
