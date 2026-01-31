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

- [x] graph construction from config
  - `GraphBuilder` class parses configuration files
  - Supports resources, data sources, providers, modules, outputs, variables
  - Automatic dependency wiring from references
- [x] topological sort with stable ordering
  - Kahn's algorithm with alphabetical tie-breaking
  - Caches sorted order for performance
  - Cycle detection with detailed error messages
- [x] state snapshot schema
  - Versioned state format (v1)
  - Resource state tracking with metadata
  - Output values with sensitivity markers
- [x] diff engine
  - Deep attribute comparison
  - Create/update/delete/replace classification
  - Human-readable plan formatting
- [x] drift report output
  - Drifted, missing, and orphaned resource detection
  - Attribute-level difference reporting
  - Human-readable and JSON formats
- [ ] import mapping
  - TODO: Support for importing existing resources into state
- [ ] failure recovery
  - TODO: Partial state recovery mechanisms

## Implementation

### Core Files

| File | Purpose |
|------|---------|
| `src/graph/types.ts` | Type definitions for nodes, edges, state, diff, drift |
| `src/graph/graph.ts` | ResourceGraph class with topological sort, walk, cycle detection |
| `src/graph/config.ts` | Configuration parser and GraphBuilder |
| `src/graph/state.ts` | StateManager with local and memory backends |
| `src/graph/diff.ts` | DiffEngine for comparing desired vs actual state |
| `src/graph/drift.ts` | DriftDetector for infrastructure drift |

## Test plan

Anchors map to `packages/agent-core/test/graph/`.

- [x] RG-01 graph build
- [x] RG-02 deterministic ordering
- [x] RG-03 diff classification
- [x] RG-04 drift report
- [ ] RG-05 import mapping
