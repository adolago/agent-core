/**
 * Resource Graph Module
 *
 * Infrastructure as Code resource graph management.
 * Provides graph construction, state management, diffing, and drift detection.
 */

// Types
export type {
  // Node types
  Node,
  NodeType,
  ResourceNode,
  DataNode,
  ProviderNode,
  ModuleNode,
  OutputNode,
  VariableNode,
  SourceLocation,

  // Edge types
  GraphEdge,
  EdgeType,
  ResourceLifecycle,

  // State types
  ResourceState,
  StateSnapshot,
  StateOutput,

  // Diff types
  ChangeType,
  ResourceChange,
  AttributeChange,
  Plan,

  // Drift types
  DriftReport,
  DriftedResource,

  // Backend types
  BackendConfig,
  LocalBackendConfig,
  S3BackendConfig,
  HTTPBackendConfig,
} from './types.js';

// Graph
export {
  ResourceGraph,
  GraphError,
} from './graph.js';

// Configuration
export {
  GraphBuilder,
  buildGraph,
  validateConfig,
} from './config.js';

// State
export {
  StateManager,
  LocalStateBackend,
  MemoryStateBackend,
  createStateBackend,
  createResourceState,
} from './state.js';

// Diff
export {
  DiffEngine,
  diffResources,
  hasChanges,
} from './diff.js';

// Drift
export {
  DriftDetector,
  detectDrift,
} from './drift.js';

// Re-export types that are used together
export type {
  ConfigFile,
  VariableConfig,
  ProviderConfig,
  ResourceConfig,
  DataConfig,
  ModuleConfig,
  OutputConfig,
  TerraformConfig,
} from './config.js';

export type {
  StateBackend,
  DriftProvider,
  DriftOptions,
} from './state.js';

export type {
  DiffOptions,
} from './diff.js';

export type {
  GraphVisitor,
  WalkOptions,
} from './types.js';
