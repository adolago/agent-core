/**
 * Resource Graph Types
 *
 * Core type definitions for the resource graph model.
 * Inspired by Terraform's graph architecture.
 */

// =============================================================================
// Node Types
// =============================================================================

/** Types of nodes in the resource graph */
export type NodeType = 'resource' | 'data' | 'provider' | 'module' | 'output' | 'variable';

/** Base interface for all graph nodes */
export interface GraphNode {
  /** Unique node identifier */
  id: string;
  /** Node type */
  type: NodeType;
  /** Human-readable name */
  name: string;
  /** Module path (empty for root) */
  module: string;
  /** Source location for debugging */
  source?: SourceLocation;
}

/** Source location in configuration */
export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

/** Resource node */
export interface ResourceNode extends GraphNode {
  type: 'resource';
  /** Resource type (e.g., "aws_instance") */
  resourceType: string;
  /** Resource configuration */
  config: Record<string, unknown>;
  /** Explicit dependencies */
  dependsOn: string[];
  /** Provider reference */
  provider: string;
  /** Lifecycle configuration */
  lifecycle?: ResourceLifecycle;
}

/** Data source node (read-only) */
export interface DataNode extends GraphNode {
  type: 'data';
  /** Data source type */
  dataType: string;
  /** Data source configuration */
  config: Record<string, unknown>;
  /** Explicit dependencies */
  dependsOn: string[];
  /** Provider reference */
  provider: string;
}

/** Provider node */
export interface ProviderNode extends GraphNode {
  type: 'provider';
  /** Provider name (e.g., "aws") */
  providerName: string;
  /** Provider alias (for multiple instances) */
  alias?: string;
  /** Provider configuration */
  config: Record<string, unknown>;
  /** Version constraint */
  version?: string;
}

/** Module node */
export interface ModuleNode extends GraphNode {
  type: 'module';
  /** Module source (path, registry, git URL) */
  source: string;
  /** Module inputs */
  inputs: Record<string, unknown>;
  /** Version constraint (for registry modules) */
  version?: string;
}

/** Output node */
export interface OutputNode extends GraphNode {
  type: 'output';
  /** Output value expression */
  value: unknown;
  /** Whether output is sensitive */
  sensitive: boolean;
  /** Description */
  description?: string;
}

/** Variable node */
export interface VariableNode extends GraphNode {
  type: 'variable';
  /** Default value */
  default?: unknown;
  /** Type constraint */
  varType?: string;
  /** Description */
  description?: string;
  /** Whether variable is sensitive */
  sensitive: boolean;
}

/** Union type for all nodes */
export type Node = ResourceNode | DataNode | ProviderNode | ModuleNode | OutputNode | VariableNode;

// =============================================================================
// Edge Types
// =============================================================================

/** Types of edges in the graph */
export type EdgeType = 'dependency' | 'reference' | 'provider' | 'module';

/** Edge connecting two nodes */
export interface GraphEdge {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Edge type */
  type: EdgeType;
  /** Whether this is a hard dependency (must exist) */
  required: boolean;
}

/** Resource lifecycle configuration */
export interface ResourceLifecycle {
  /** Prevent accidental destruction */
  preventDestroy?: boolean;
  /** Ignore changes to these attributes */
  ignoreChanges?: string[];
  /** Replace on changes to these attributes */
  replaceTriggeredBy?: string[];
  /** Create before destroy */
  createBeforeDestroy?: boolean;
}

// =============================================================================
// State Types
// =============================================================================

/** Resource instance state */
export interface ResourceState {
  /** Resource address */
  address: string;
  /** Resource type */
  type: string;
  /** Resource name */
  name: string;
  /** Module path */
  module?: string;
  /** Current attributes */
  attributes: Record<string, unknown>;
  /** Sensitive attributes (masked in output) */
  sensitiveAttributes?: string[];
  /** Dependencies */
  dependencies: string[];
  /** Provider configuration */
  provider: string;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Resource-specific metadata */
  meta?: Record<string, unknown>;
}

/** Full state snapshot */
export interface StateSnapshot {
  /** Format version */
  version: number;
  /** State serial number (increments on change) */
  serial: number;
  /** Terraform version that created this state */
  terraformVersion: string;
  /** Resources in state */
  resources: ResourceState[];
  /** Outputs */
  outputs: Record<string, StateOutput>;
}

/** Output value in state */
export interface StateOutput {
  value: unknown;
  type: string;
  sensitive: boolean;
}

// =============================================================================
// Diff Types
// =============================================================================

/** Types of resource changes */
export type ChangeType = 'create' | 'update' | 'delete' | 'replace' | 'noop';

/** Resource change description */
export interface ResourceChange {
  /** Resource address */
  address: string;
  /** Change type */
  action: ChangeType;
  /** Previous state (null for create) */
  before: ResourceState | null;
  /** New state (null for delete) */
  after: ResourceState | null;
  /** Attribute-level changes */
  changes: AttributeChange[];
  /** Whether change requires replacement */
  requiresReplace: boolean;
  /** Reason for replacement */
  replaceReason?: string;
}

/** Attribute-level change */
export interface AttributeChange {
  /** Attribute path (supports nested paths) */
  path: string;
  /** Old value */
  old: unknown;
  /** New value */
  new: unknown;
  /** Whether this is a computed value */
  computed: boolean;
}

/** Execution plan */
export interface Plan {
  /** Plan format version */
  version: number;
  /** Resource changes */
  changes: ResourceChange[];
  /** Outputs that will be set */
  outputs: Record<string, unknown>;
  /** Variables used */
  variables: Record<string, unknown>;
  /** Timestamp */
  timestamp: string;
}

// =============================================================================
// Drift Types
// =============================================================================

/** Drift detection result */
export interface DriftReport {
  /** Timestamp of check */
  timestamp: string;
  /** Resources with drift */
  drifted: DriftedResource[];
  /** Resources missing from real world */
  missing: string[];
  /** Resources not in configuration */
  orphaned: string[];
}

/** Drifted resource details */
export interface DriftedResource {
  /** Resource address */
  address: string;
  /** Expected state from configuration */
  expected: Record<string, unknown>;
  /** Actual state from provider */
  actual: Record<string, unknown>;
  /** Differences */
  differences: AttributeChange[];
}

// =============================================================================
// Backend Types
// =============================================================================

/** State backend configuration */
export type BackendConfig = LocalBackendConfig | S3BackendConfig | HTTPBackendConfig;

/** Local file backend */
export interface LocalBackendConfig {
  type: 'local';
  /** Path to state file */
  path: string;
}

/** S3 backend */
export interface S3BackendConfig {
  type: 's3';
  bucket: string;
  key: string;
  region: string;
  /** DynamoDB table for locking */
  dynamodbTable?: string;
  /** Encryption enabled */
  encrypt?: boolean;
}

/** HTTP backend */
export interface HTTPBackendConfig {
  type: 'http';
  url: string;
  /** Lock URL (if different from state URL) */
  lockUrl?: string;
  /** Unlock URL */
  unlockUrl?: string;
  /** Authentication */
  username?: string;
  password?: string;
}

// =============================================================================
// Graph Operations
// =============================================================================

/** Graph walk visitor function */
export type GraphVisitor = (node: Node) => Promise<void>;

/** Walk options */
export interface WalkOptions {
  /** Visit order: 'forward' (dependencies first) or 'reverse' */
  direction: 'forward' | 'reverse';
  /** Parallel execution */
  parallel?: boolean;
  /** Max parallel operations */
  maxParallel?: number;
  /** Error handler */
  onError?: (node: Node, error: Error) => void;
}
