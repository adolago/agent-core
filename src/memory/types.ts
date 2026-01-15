/**
 * Memory Layer Types
 *
 * Unified memory system with Qdrant vector storage,
 * supporting semantic search, pattern storage, and cross-session context
 */

// =============================================================================
// Memory Entry Types
// =============================================================================

/** Categories for organizing memories */
export type MemoryCategory =
  | "conversation"
  | "fact"
  | "preference"
  | "task"
  | "decision"
  | "relationship"
  | "note"
  | "pattern"
  | "custom";

/** Metadata attached to memory entries */
export interface MemoryMetadata {
  /** Source surface (cli, web, whatsapp, etc.) */
  surface?: string;
  /** Session ID where memory was created */
  sessionId?: string;
  /** Agent that created the memory */
  agent?: string;
  /** Importance score (0-1) */
  importance?: number;
  /** Related entity IDs */
  entities?: string[];
  /** Custom tags */
  tags?: string[];
  /** Additional structured data */
  extra?: Record<string, unknown>;
}

/** A single memory entry */
export interface MemoryEntry {
  /** Unique identifier */
  id: string;
  /** Memory category */
  category: MemoryCategory;
  /** Raw text content */
  content: string;
  /** Summary for quick retrieval */
  summary?: string;
  /** Embedding vector (generated) */
  embedding?: number[];
  /** Associated metadata */
  metadata: MemoryMetadata;
  /** Creation timestamp */
  createdAt: number;
  /** Last access timestamp */
  accessedAt: number;
  /** Update timestamp */
  updatedAt?: number;
  /** Time-to-live in milliseconds (0 = permanent) */
  ttl?: number;
  /** Namespace for isolation */
  namespace?: string;
}

/** Input for creating a memory */
export interface MemoryInput {
  category: MemoryCategory;
  content: string;
  summary?: string;
  metadata?: Partial<MemoryMetadata>;
  ttl?: number;
  namespace?: string;
}

// =============================================================================
// Search Types
// =============================================================================

/** Search parameters for memory retrieval */
export interface MemorySearchParams {
  /** Search query text */
  query: string;
  /** Maximum results to return */
  limit?: number;
  /** Minimum similarity threshold (0-1) */
  threshold?: number;
  /** Filter by category */
  category?: MemoryCategory | MemoryCategory[];
  /** Filter by namespace (null = search all namespaces) */
  namespace?: string | null;
  /** Filter by tags */
  tags?: string[];
  /** Filter by time range */
  timeRange?: {
    start?: number;
    end?: number;
  };
  /** Include metadata in results */
  includeMetadata?: boolean;
  /** Include embedding vectors in results */
  includeVectors?: boolean;
}

/** A search result with similarity score */
export interface MemorySearchResult {
  /** The memory entry */
  entry: MemoryEntry;
  /** Similarity score (0-1) */
  score: number;
  /** Highlighted matches */
  highlights?: string[];
}

// =============================================================================
// Pattern Types
// =============================================================================

/** Pattern for learning user preferences and behaviors */
export interface MemoryPattern {
  /** Unique pattern ID */
  id: string;
  /** Pattern type */
  type: PatternType;
  /** Pattern description */
  description: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Number of observations supporting this pattern */
  observations: number;
  /** Evidence entries */
  evidence: string[];
  /** Last observed timestamp */
  lastObserved: number;
  /** First observed timestamp */
  firstObserved: number;
  /** Pattern-specific data */
  data: Record<string, unknown>;
}

export type PatternType =
  | "preference"
  | "behavior"
  | "communication_style"
  | "schedule"
  | "topic_interest"
  | "relationship"
  | "workflow"
  | "custom";

// =============================================================================
// Relationship Types
// =============================================================================

/** Entity relationship in the knowledge graph */
export interface MemoryRelationship {
  /** Unique relationship ID */
  id: string;
  /** Source entity ID */
  sourceId: string;
  /** Target entity ID */
  targetId: string;
  /** Relationship type */
  type: RelationshipType;
  /** Relationship strength (0-1) */
  strength: number;
  /** Direction: unidirectional or bidirectional */
  direction: "uni" | "bi";
  /** Additional properties */
  properties: Record<string, unknown>;
  /** Creation timestamp */
  createdAt: number;
}

export type RelationshipType =
  | "mentions"
  | "related_to"
  | "part_of"
  | "causes"
  | "follows"
  | "similar_to"
  | "contradicts"
  | "custom";

// =============================================================================
// Service Interfaces
// =============================================================================

/** Memory service interface */
export interface MemoryService {
  /** Store a new memory */
  store(input: MemoryInput): Promise<MemoryEntry>;

  /** Store multiple memories in batch */
  storeBatch(inputs: MemoryInput[]): Promise<MemoryEntry[]>;

  /** Search memories by semantic similarity */
  search(params: MemorySearchParams): Promise<MemorySearchResult[]>;

  /** Get a specific memory by ID */
  get(id: string): Promise<MemoryEntry | null>;

  /** Update an existing memory */
  update(id: string, updates: Partial<MemoryInput>): Promise<MemoryEntry>;

  /** Delete a memory */
  delete(id: string): Promise<void>;

  /** Delete memories matching criteria */
  deleteWhere(params: Omit<MemorySearchParams, "query" | "limit">): Promise<number>;

  /** Get recent memories */
  recent(options?: {
    limit?: number;
    namespace?: string;
    category?: MemoryCategory;
  }): Promise<MemoryEntry[]>;

  /** Get related memories */
  related(id: string, limit?: number): Promise<MemorySearchResult[]>;

  /** Clear all memories (optionally by namespace) */
  clear(namespace?: string): Promise<void>;

  /** Get memory statistics */
  stats(): Promise<MemoryStats>;
}

/** Pattern service interface */
export interface PatternService {
  /** Extract and learn patterns from recent memories */
  learn(options?: { namespace?: string; minObservations?: number }): Promise<MemoryPattern[]>;

  /** Get all learned patterns */
  list(options?: { type?: PatternType; minConfidence?: number }): Promise<MemoryPattern[]>;

  /** Get a specific pattern */
  get(id: string): Promise<MemoryPattern | null>;

  /** Update pattern confidence based on new evidence */
  reinforce(id: string, evidence: string): Promise<MemoryPattern>;

  /** Weaken pattern confidence */
  weaken(id: string, reason?: string): Promise<MemoryPattern>;

  /** Delete a pattern */
  delete(id: string): Promise<void>;
}

/** Relationship service interface */
export interface RelationshipService {
  /** Create a relationship between entities */
  create(input: Omit<MemoryRelationship, "id" | "createdAt">): Promise<MemoryRelationship>;

  /** Get relationships for an entity */
  forEntity(entityId: string, options?: {
    type?: RelationshipType;
    direction?: "incoming" | "outgoing" | "both";
  }): Promise<MemoryRelationship[]>;

  /** Find path between two entities */
  path(sourceId: string, targetId: string, maxDepth?: number): Promise<MemoryRelationship[][]>;

  /** Delete a relationship */
  delete(id: string): Promise<void>;

  /** Get relationship graph for visualization */
  graph(options?: { entityIds?: string[]; depth?: number }): Promise<{
    nodes: Array<{ id: string; label: string; type: string }>;
    edges: MemoryRelationship[];
  }>;
}

// =============================================================================
// Embedding Types
// =============================================================================

/** Embedding provider interface */
export interface EmbeddingProvider {
  /** Provider identifier */
  id: string;

  /** Model used for embeddings */
  model: string;

  /** Dimension of output vectors */
  dimension: number;

  /** Generate embedding for a single text */
  embed(text: string): Promise<number[]>;

  /** Generate embeddings for multiple texts */
  embedBatch(texts: string[]): Promise<number[][]>;
}

/** Supported embedding providers */
export type EmbeddingProviderType =
  | "openai"
  | "google"
  | "anthropic"
  | "cohere"
  | "voyage"
  | "vllm"
  | "ollama"
  | "local"
  | "custom";

// =============================================================================
// Storage Types
// =============================================================================

/** Vector storage backend interface */
export interface VectorStorage {
  /** Initialize the storage */
  init(): Promise<void>;

  /** Insert vectors with metadata */
  insert(entries: Array<{
    id: string;
    vector: number[];
    payload: Record<string, unknown>;
  }>): Promise<void>;

  /** Search by vector similarity */
  search(vector: number[], options: {
    limit: number;
    threshold?: number;
    filter?: Record<string, unknown>;
  }): Promise<Array<{
    id: string;
    score: number;
    payload: Record<string, unknown>;
  }>>;

  /** Get entries by IDs */
  get(ids: string[]): Promise<Array<{
    id: string;
    vector?: number[];
    payload: Record<string, unknown>;
  } | null>>;

  /** Update entry payload */
  update(id: string, payload: Record<string, unknown>): Promise<void>;

  /** Delete entries */
  delete(ids: string[]): Promise<void>;

  /** Delete by filter */
  deleteWhere(filter: Record<string, unknown>): Promise<number>;

  /** Count entries */
  count(filter?: Record<string, unknown>): Promise<number>;

  /** Create collection/index */
  createCollection(name: string, dimension: number): Promise<void>;

  /** Delete collection */
  deleteCollection(name: string): Promise<void>;

  /** List collections */
  listCollections(): Promise<string[]>;
}

// =============================================================================
// Configuration
// =============================================================================

/** Memory system configuration */
export interface MemoryConfig {
  /** Qdrant connection settings */
  qdrant: {
    url: string;
    apiKey?: string;
    collection: string;
  };

  /** Embedding settings */
  embedding: {
    provider: EmbeddingProviderType;
    model?: string;
    apiKey?: string;
    dimension?: number;
  };

  /** Default namespace for isolation */
  defaultNamespace?: string;

  /** Maximum memories per namespace */
  maxEntriesPerNamespace?: number;

  /** Enable automatic pattern learning */
  autoLearn?: boolean;

  /** Minimum observations before a pattern is considered valid */
  patternMinObservations?: number;

  /** Default TTL for memories in milliseconds (0 = permanent) */
  defaultTTL?: number;
}

// =============================================================================
// Statistics
// =============================================================================

/** Memory statistics */
export interface MemoryStats {
  /** Total memory count */
  totalEntries: number;
  /** Entries by category */
  byCategory: Record<MemoryCategory, number>;
  /** Entries by namespace */
  byNamespace: Record<string, number>;
  /** Total patterns learned */
  totalPatterns: number;
  /** Total relationships */
  totalRelationships: number;
  /** Storage size in bytes */
  storageBytes: number;
  /** Last compaction timestamp */
  lastCompaction?: number;
}

// =============================================================================
// Tiara Namespaces
// =============================================================================

/**
 * Tiara-specific namespace constants.
 *
 * These namespaces enable Tiara's hive-mind system to use agent-core
 * as the single source of truth for memory and process registry.
 */
export const TiaraNamespaces = {
  // =============================================
  // Semantic/Learning Namespaces (vector search)
  // =============================================

  /** Learning patterns from agent execution */
  LEARNING: "tiara:learning",

  /** Queen decision records and rationale */
  DECISIONS: "tiara:decisions",

  /** Neural patterns for intelligent task routing */
  PATTERNS: "tiara:patterns",

  /** Agent context snapshots for continuity */
  AGENT_STATE: "tiara:agent-state",

  /** Swarm execution history */
  SWARM_HISTORY: "tiara:swarm-history",

  /** Task trajectories for learning */
  TRAJECTORIES: "tiara:trajectories",

  // =============================================
  // Operational Namespaces (structured data)
  // =============================================

  /** Swarm configurations and metadata */
  SWARMS: "tiara:swarms",

  /** Agent registry with capabilities */
  AGENTS: "tiara:agents",

  /** Task queue with priorities and assignments */
  TASKS: "tiara:tasks",

  /** Message queue between agents */
  COMMUNICATIONS: "tiara:communications",

  /** Consensus proposals and voting state */
  CONSENSUS: "tiara:consensus",

  /** Performance metrics for agents and swarms */
  METRICS: "tiara:metrics",

  /** Queen decisions for distributed coordination */
  QUEEN_DECISIONS: "tiara:queen-decisions",
} as const;

export type TiaraNamespace = (typeof TiaraNamespaces)[keyof typeof TiaraNamespaces];

/**
 * Tiara decision entry stored in memory.
 * Used by Queen to track decision history and learn from outcomes.
 */
export interface TiaraDecisionEntry {
  /** Index signature for Record<string, unknown> compatibility */
  [key: string]: unknown;
  /** Decision ID */
  decisionId: string;
  /** Type of decision (task_assignment, consensus, resource_allocation) */
  decisionType: "task_assignment" | "consensus" | "resource_allocation" | "swarm_topology";
  /** Input context for the decision */
  context: string;
  /** The decision made */
  decision: string;
  /** Rationale for the decision */
  rationale: string;
  /** Outcome (if known) */
  outcome?: "success" | "partial" | "failure" | "pending";
  /** Performance metrics */
  metrics?: {
    executionTime?: number;
    qualityScore?: number;
    resourcesUsed?: number;
  };
  /** Swarm ID */
  swarmId?: string;
  /** Agent IDs involved */
  agentIds?: string[];
  /** Timestamp */
  timestamp: number;
}

/**
 * Tiara learning pattern stored in memory.
 * Used to improve agent selection and task routing.
 */
export interface TiaraLearningPattern {
  /** Index signature for Record<string, unknown> compatibility */
  [key: string]: unknown;
  /** Pattern ID */
  patternId: string;
  /** Pattern type */
  type: "agent_performance" | "task_routing" | "capability_match" | "swarm_topology";
  /** Pattern description */
  description: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Number of observations */
  observations: number;
  /** Pattern data */
  data: Record<string, unknown>;
  /** Last updated */
  lastUpdated: number;
}

/**
 * Helper to create a Tiara-namespaced memory input.
 */
export function createTiaraMemoryInput(
  namespace: TiaraNamespace,
  content: string,
  category: MemoryCategory = "pattern",
  metadata?: Partial<MemoryMetadata>
): MemoryInput {
  return {
    category,
    content,
    metadata: {
      ...metadata,
      extra: {
        ...metadata?.extra,
        source: "tiara",
      },
    },
    namespace,
  };
}

/**
 * Helper to create a decision entry for storage.
 */
export function createDecisionInput(
  decision: TiaraDecisionEntry
): MemoryInput {
  const content = `
Decision: ${decision.decisionType}
Context: ${decision.context}
Decision: ${decision.decision}
Rationale: ${decision.rationale}
Outcome: ${decision.outcome ?? "pending"}
  `.trim();

  return createTiaraMemoryInput(
    TiaraNamespaces.DECISIONS,
    content,
    "decision",
    {
      extra: decision,
    }
  );
}

/**
 * Helper to create a learning pattern for storage.
 */
export function createLearningPatternInput(
  pattern: TiaraLearningPattern
): MemoryInput {
  const content = `
Pattern: ${pattern.type}
Description: ${pattern.description}
Confidence: ${pattern.confidence}
Observations: ${pattern.observations}
  `.trim();

  return createTiaraMemoryInput(
    TiaraNamespaces.LEARNING,
    content,
    "pattern",
    {
      importance: pattern.confidence,
      extra: pattern,
    }
  );
}

// =============================================================================
// Tiara Operational Data Types
// =============================================================================

/**
 * Swarm topology types
 */
export type SwarmTopology = "mesh" | "hierarchical" | "ring" | "star" | "hybrid";

/**
 * Agent status in a swarm
 */
export type AgentStatus = "idle" | "busy" | "error" | "offline" | "starting";

/**
 * Task priority levels
 */
export type TaskPriority = "critical" | "high" | "medium" | "low";

/**
 * Task execution status
 */
export type TaskStatus =
  | "pending"
  | "assigned"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Task execution strategies
 */
export type TaskStrategy =
  | "single"
  | "parallel"
  | "sequential"
  | "consensus"
  | "competitive";

/**
 * Message priority levels
 */
export type MessagePriority = "urgent" | "high" | "normal" | "low";

/**
 * Communication message types
 */
export type MessageType =
  | "task_assignment"
  | "status_update"
  | "data_sharing"
  | "coordination"
  | "error_report"
  | "consensus_vote"
  | "heartbeat"
  | "broadcast";

/**
 * Consensus proposal status
 */
export type ConsensusStatus =
  | "pending"
  | "achieved"
  | "rejected"
  | "expired"
  | "cancelled";

/**
 * Swarm entry stored in Qdrant
 */
export interface TiaraSwarmEntry {
  /** Index signature for Record<string, unknown> compatibility */
  [key: string]: unknown;
  /** Unique swarm ID */
  id: string;
  /** Display name */
  name: string;
  /** Network topology */
  topology: SwarmTopology;
  /** Whether a queen is coordinating */
  queenMode: boolean;
  /** Maximum number of agents */
  maxAgents: number;
  /** Consensus threshold (0-1) */
  consensusThreshold: number;
  /** Memory TTL in seconds */
  memoryTTL: number;
  /** Additional configuration */
  config: Record<string, unknown>;
  /** Whether this swarm is currently active */
  isActive: boolean;
  /** Creation timestamp */
  createdAt: number;
  /** Last updated timestamp */
  updatedAt?: number;
}

/**
 * Agent entry stored in Qdrant
 */
export interface TiaraAgentEntry {
  /** Index signature for Record<string, unknown> compatibility */
  [key: string]: unknown;
  /** Unique agent ID */
  id: string;
  /** Parent swarm ID */
  swarmId: string;
  /** Display name */
  name: string;
  /** Agent type (researcher, coder, tester, etc.) */
  type: string;
  /** Current status */
  status: AgentStatus;
  /** List of capabilities */
  capabilities: string[];
  /** Current task ID (if any) */
  currentTaskId?: string;
  /** Success count */
  successCount: number;
  /** Error count */
  errorCount: number;
  /** Message count */
  messageCount: number;
  /** Additional metadata */
  metadata: Record<string, unknown>;
  /** Creation timestamp */
  createdAt: number;
  /** Last heartbeat timestamp */
  lastHeartbeat: number;
}

/**
 * Task entry stored in Qdrant
 */
export interface TiaraTaskEntry {
  /** Index signature for Record<string, unknown> compatibility */
  [key: string]: unknown;
  /** Unique task ID */
  id: string;
  /** Parent swarm ID */
  swarmId: string;
  /** Task description */
  description: string;
  /** Priority level */
  priority: TaskPriority;
  /** Execution strategy */
  strategy: TaskStrategy;
  /** Current status */
  status: TaskStatus;
  /** Dependency task IDs */
  dependencies: string[];
  /** Assigned agent IDs */
  assignedAgents: string[];
  /** Whether consensus is required */
  requireConsensus: boolean;
  /** Maximum agents for parallel execution */
  maxAgents: number;
  /** Required capabilities for assignment */
  requiredCapabilities: string[];
  /** Task result (when completed) */
  result?: unknown;
  /** Error message (when failed) */
  error?: string;
  /** Additional metadata */
  metadata: Record<string, unknown>;
  /** Creation timestamp */
  createdAt: number;
  /** Completion timestamp */
  completedAt?: number;
}

/**
 * Communication message stored in Qdrant
 */
export interface TiaraCommunicationEntry {
  /** Index signature for Record<string, unknown> compatibility */
  [key: string]: unknown;
  /** Unique message ID (auto-generated) */
  id: string;
  /** Sender agent ID */
  fromAgentId: string;
  /** Recipient agent ID (null for broadcast) */
  toAgentId?: string;
  /** Parent swarm ID */
  swarmId: string;
  /** Message type */
  messageType: MessageType;
  /** Message content */
  content: string;
  /** Priority level */
  priority: MessagePriority;
  /** Whether response is required */
  requiresResponse: boolean;
  /** Delivery timestamp */
  deliveredAt?: number;
  /** Read timestamp */
  readAt?: number;
  /** Creation timestamp */
  timestamp: number;
}

/**
 * Consensus proposal stored in Qdrant
 */
export interface TiaraConsensusEntry {
  /** Index signature for Record<string, unknown> compatibility */
  [key: string]: unknown;
  /** Unique proposal ID */
  id: string;
  /** Parent swarm ID */
  swarmId: string;
  /** Related task ID (optional) */
  taskId?: string;
  /** Proposal content */
  proposal: Record<string, unknown>;
  /** Required threshold for approval (0-1) */
  requiredThreshold: number;
  /** Current status */
  status: ConsensusStatus;
  /** Votes by agent ID */
  votes: Record<string, { vote: boolean; reason?: string; timestamp: number }>;
  /** Current positive vote count */
  currentVotes: number;
  /** Total number of voters */
  totalVoters: number;
  /** Deadline timestamp */
  deadline: number;
  /** Creation timestamp */
  createdAt: number;
  /** Resolution timestamp */
  resolvedAt?: number;
}

/**
 * Performance metrics entry stored in Qdrant
 */
export interface TiaraMetricsEntry {
  /** Index signature for Record<string, unknown> compatibility */
  [key: string]: unknown;
  /** Unique metric ID (auto-generated) */
  id: string;
  /** Parent swarm ID */
  swarmId: string;
  /** Agent ID (optional) */
  agentId?: string;
  /** Metric type (task_completion, error_rate, response_time, etc.) */
  metricType: string;
  /** Metric value */
  metricValue: number;
  /** Additional metadata */
  metadata: Record<string, unknown>;
  /** Recording timestamp */
  timestamp: number;
}

// =============================================================================
// Tiara Operational Data Helpers
// =============================================================================

/**
 * Helper to create a swarm memory input.
 */
export function createSwarmInput(swarm: TiaraSwarmEntry): MemoryInput {
  const content = `
Swarm: ${swarm.name}
Topology: ${swarm.topology}
Queen Mode: ${swarm.queenMode}
Max Agents: ${swarm.maxAgents}
  `.trim();

  return createTiaraMemoryInput(TiaraNamespaces.SWARMS, content, "custom", {
    extra: swarm,
  });
}

/**
 * Helper to create an agent memory input.
 */
export function createAgentInput(agent: TiaraAgentEntry): MemoryInput {
  const content = `
Agent: ${agent.name}
Type: ${agent.type}
Swarm: ${agent.swarmId}
Capabilities: ${agent.capabilities.join(", ")}
Status: ${agent.status}
  `.trim();

  return createTiaraMemoryInput(TiaraNamespaces.AGENTS, content, "custom", {
    extra: agent,
  });
}

/**
 * Helper to create a task memory input.
 */
export function createTaskInput(task: TiaraTaskEntry): MemoryInput {
  const content = `
Task: ${task.description}
Priority: ${task.priority}
Strategy: ${task.strategy}
Status: ${task.status}
Swarm: ${task.swarmId}
  `.trim();

  return createTiaraMemoryInput(TiaraNamespaces.TASKS, content, "task", {
    extra: task,
    importance: task.priority === "critical" ? 1.0 : task.priority === "high" ? 0.8 : 0.5,
  });
}

/**
 * Helper to create a communication memory input.
 */
export function createCommunicationInput(
  comm: TiaraCommunicationEntry
): MemoryInput {
  const content = `
From: ${comm.fromAgentId}
To: ${comm.toAgentId ?? "broadcast"}
Type: ${comm.messageType}
Content: ${comm.content.substring(0, 200)}
  `.trim();

  return createTiaraMemoryInput(
    TiaraNamespaces.COMMUNICATIONS,
    content,
    "custom",
    {
      extra: comm,
    }
  );
}

/**
 * Helper to create a consensus memory input.
 */
export function createConsensusInput(consensus: TiaraConsensusEntry): MemoryInput {
  const content = `
Proposal: ${JSON.stringify(consensus.proposal).substring(0, 200)}
Threshold: ${consensus.requiredThreshold}
Status: ${consensus.status}
Votes: ${consensus.currentVotes}/${consensus.totalVoters}
  `.trim();

  return createTiaraMemoryInput(TiaraNamespaces.CONSENSUS, content, "decision", {
    extra: consensus,
  });
}

/**
 * Helper to create a metrics memory input.
 */
export function createMetricsInput(metrics: TiaraMetricsEntry): MemoryInput {
  const content = `
Metric: ${metrics.metricType}
Value: ${metrics.metricValue}
Agent: ${metrics.agentId ?? "swarm-level"}
Swarm: ${metrics.swarmId}
  `.trim();

  return createTiaraMemoryInput(TiaraNamespaces.METRICS, content, "custom", {
    extra: metrics,
  });
}
