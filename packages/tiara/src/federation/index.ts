/**
 * Federation Module
 *
 * Federated agent synchronization and ephemeral agents.
 *
 * Features:
 * - Vector clock-based conflict resolution
 * - Hub-and-spoke topology for agent sync
 * - Ephemeral agents with automatic lifecycle
 * - Multi-tenant isolation
 * - JWT authentication and AES-256 encryption
 *
 * Ported from claude-flow v3 @agentic-flow/federation
 *
 * @module tiara/federation
 */

// Types
export type {
  VectorClock,
  VectorClockComparison,
  FederationHubConfig,
  HubServerConfig,
  SyncMessageType,
  SyncMessage,
  SyncOperation,
  SyncUpdate,
  AgentConnection,
  EphemeralAgentConfig,
  AgentContext,
  LearningEpisode,
  AgentDatabase,
  PatternStoreData,
  PatternSearchParams,
  PatternResult,
  AgentTokenPayload,
  EncryptionKeys,
  MTLSCertificates,
  SyncStats,
  HubStats,
  FederationEventPayload,
} from "./types.js";

export { FederationEventTypes } from "./types.js";

// Vector Clock
export {
  createVectorClock,
  incrementClock,
  mergeClocks,
  compareClocks,
  happenedBefore,
  areConcurrent,
  areEqual,
  getTimestamp,
  cloneClock,
  getNodes,
  getTotalSum,
  VectorClockManager,
  createVectorClockManager,
} from "./vector-clock.js";

// Security
export { SecurityManager, createSecurityManager } from "./security.js";

// Federation Hub
export { FederationHub, createFederationHub } from "./hub.js";

// Federation Hub Server
export {
  FederationHubServer,
  createFederationHubServer,
} from "./hub-server.js";

// Ephemeral Agent
export { EphemeralAgent, spawnEphemeralAgent } from "./ephemeral-agent.js";
