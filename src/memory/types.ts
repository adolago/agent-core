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
  /** Filter by namespace */
  namespace?: string;
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
