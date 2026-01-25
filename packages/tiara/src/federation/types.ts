/**
 * Federation Types
 *
 * Types for federated agent synchronization and ephemeral agents.
 *
 * Ported from claude-flow v3 @agentic-flow/federation
 *
 * @module tiara/federation/types
 */

// =============================================================================
// Vector Clock Types
// =============================================================================

/**
 * Vector clock for distributed conflict resolution
 */
export type VectorClock = Record<string, number>;

/**
 * Comparison result for vector clocks
 */
export type VectorClockComparison =
  | "before" // This clock happened before the other
  | "after" // This clock happened after the other
  | "concurrent" // Clocks are concurrent (conflict)
  | "equal"; // Clocks are identical

// =============================================================================
// Hub Configuration
// =============================================================================

/**
 * Federation hub configuration
 */
export interface FederationHubConfig {
  /** Hub endpoint (e.g., quic://hub.example.com:4433) */
  endpoint: string;
  /** Agent identifier */
  agentId: string;
  /** Tenant identifier for isolation */
  tenantId: string;
  /** JWT authentication token */
  token: string;
  /** Enable mutual TLS authentication */
  enableMTLS?: boolean;
  /** TLS certificate path */
  certPath?: string;
  /** TLS private key path */
  keyPath?: string;
  /** TLS CA certificate path */
  caPath?: string;
}

/**
 * Hub server configuration
 */
export interface HubServerConfig {
  /** Port to listen on */
  port?: number;
  /** Database path for persistence */
  dbPath?: string;
  /** Maximum concurrent agent connections */
  maxAgents?: number;
  /** Sync interval in milliseconds */
  syncInterval?: number;
  /** JWT secret for token verification (for testing) */
  jwtSecret?: string;
}

// =============================================================================
// Sync Message Types
// =============================================================================

/**
 * Sync message types
 */
export type SyncMessageType =
  | "auth"
  | "pull"
  | "push"
  | "ack"
  | "error"
  | "broadcast";

/**
 * Sync message for hub communication
 */
export interface SyncMessage {
  /** Message type */
  type: SyncMessageType;
  /** Agent ID (for auth/push/pull) */
  agentId?: string;
  /** Tenant ID */
  tenantId?: string;
  /** JWT token (for auth) */
  token?: string;
  /** Vector clock for causality tracking */
  vectorClock?: VectorClock;
  /** Data payload */
  data?: SyncUpdate[];
  /** Error message (for error type) */
  error?: string;
  /** Message timestamp */
  timestamp: number;
}

/**
 * Sync update operation
 */
export type SyncOperation = "insert" | "update" | "delete";

/**
 * Sync update record
 */
export interface SyncUpdate {
  /** Unique update ID */
  id: string;
  /** Operation type */
  operation: SyncOperation;
  /** Table/collection name */
  table: string;
  /** Record data */
  data: Record<string, unknown>;
  /** Vector clock at time of update */
  vectorClock: VectorClock;
  /** Tenant isolation */
  tenantId: string;
  /** Update timestamp */
  timestamp: number;
}

// =============================================================================
// Agent Connection
// =============================================================================

/**
 * Connected agent information
 */
export interface AgentConnection {
  /** Agent identifier */
  agentId: string;
  /** Tenant identifier */
  tenantId: string;
  /** Connection timestamp */
  connectedAt: number;
  /** Last sync timestamp */
  lastSyncAt: number;
  /** Agent's vector clock */
  vectorClock: VectorClock;
}

// =============================================================================
// Ephemeral Agent Types
// =============================================================================

/**
 * Ephemeral agent configuration
 */
export interface EphemeralAgentConfig {
  /** Tenant ID for isolation */
  tenantId: string;
  /** Agent lifetime in seconds (default: 300) */
  lifetime?: number;
  /** Federation hub endpoint */
  hubEndpoint?: string;
  /** Local memory path (default: :memory:) */
  memoryPath?: string;
  /** Enable data encryption at rest */
  enableEncryption?: boolean;
  /** Sync interval in milliseconds (default: 5000) */
  syncInterval?: number;
}

/**
 * Ephemeral agent context
 */
export interface AgentContext {
  /** Unique agent identifier */
  agentId: string;
  /** Tenant identifier */
  tenantId: string;
  /** Database reference */
  db: AgentDatabase;
  /** Spawn timestamp */
  spawnTime: number;
  /** Expiration timestamp */
  expiresAt: number;
}

/**
 * Learning episode for memory storage
 */
export interface LearningEpisode {
  /** Task description */
  task: string;
  /** Input/prompt */
  input: string;
  /** Output/response */
  output: string;
  /** Reward score (0-1) */
  reward: number;
  /** Optional critique/feedback */
  critique?: string;
}

// =============================================================================
// Database Interface
// =============================================================================

/**
 * Abstract database interface for federation
 */
export interface AgentDatabase {
  /** Close the database */
  close?(): void | Promise<void>;
  /** Store a pattern/memory */
  patternStore?(data: PatternStoreData): Promise<void>;
  /** Search patterns/memories */
  patternSearch?(params: PatternSearchParams): Promise<PatternResult[]>;
}

/**
 * Pattern store data
 */
export interface PatternStoreData {
  sessionId: string;
  task: string;
  input: string;
  output: string;
  reward: number;
  critique: string;
  success: boolean;
  tokensUsed: number;
  latencyMs: number;
  tenantId: string;
}

/**
 * Pattern search parameters
 */
export interface PatternSearchParams {
  task: string;
  k: number;
  tenantId: string;
}

/**
 * Pattern search result
 */
export interface PatternResult {
  id: string;
  task: string;
  input: string;
  output: string;
  reward: number;
  similarity?: number;
}

// =============================================================================
// Security Types
// =============================================================================

/**
 * JWT token payload for agent authentication
 */
export interface AgentTokenPayload {
  /** Agent identifier */
  agentId: string;
  /** Tenant identifier */
  tenantId: string;
  /** Token expiration timestamp */
  expiresAt: number;
}

/**
 * Encryption keys for tenant data
 */
export interface EncryptionKeys {
  /** AES encryption key */
  encryptionKey: Uint8Array;
  /** Initialization vector */
  iv: Uint8Array;
}

/**
 * mTLS certificate bundle
 */
export interface MTLSCertificates {
  /** Client/server certificate (PEM) */
  cert: string;
  /** Private key (PEM) */
  key: string;
  /** CA certificate (PEM) */
  ca: string;
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Hub sync statistics
 */
export interface SyncStats {
  /** Last sync timestamp */
  lastSyncTime: number;
  /** Current vector clock */
  vectorClock: VectorClock;
}

/**
 * Hub server statistics
 */
export interface HubStats {
  /** Number of connected agents */
  connectedAgents: number;
  /** Total stored episodes */
  totalEpisodes: number;
  /** Number of active tenants */
  tenants: number;
  /** Server uptime in milliseconds */
  uptime: number;
}

// =============================================================================
// Events
// =============================================================================

/**
 * Federation event types
 */
export enum FederationEventTypes {
  CONNECTED = "federation:connected",
  DISCONNECTED = "federation:disconnected",
  SYNC_STARTED = "federation:sync_started",
  SYNC_COMPLETED = "federation:sync_completed",
  SYNC_FAILED = "federation:sync_failed",
  CONFLICT_DETECTED = "federation:conflict_detected",
  AGENT_SPAWNED = "federation:agent_spawned",
  AGENT_EXPIRED = "federation:agent_expired",
  AGENT_DESTROYED = "federation:agent_destroyed",
}

/**
 * Federation event payload
 */
export interface FederationEventPayload {
  /** Agent ID */
  agentId?: string;
  /** Tenant ID */
  tenantId?: string;
  /** Event timestamp */
  timestamp: number;
  /** Additional details */
  details?: Record<string, unknown>;
}
