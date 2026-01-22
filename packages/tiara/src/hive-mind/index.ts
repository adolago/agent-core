/**
 * Hive Mind Module Export
 *
 * Main entry point for the Hive Mind collective intelligence system
 */

// Core classes
export { HiveMind } from './core/HiveMind.js';
export { Queen } from './core/Queen.js';
export { Agent } from './core/Agent.js';
export { Memory } from './core/Memory.js';
export { Communication } from './core/Communication.js';
export { QdrantStore, getQdrantStore, type TiaraNamespace, TiaraNamespaces } from './core/QdrantStore.js';
export { MemoryMonitor } from './core/MemoryMonitor.js';

// Integration layer
export { MCPToolWrapper } from './integration/MCPToolWrapper.js';
export { SwarmOrchestrator } from './integration/SwarmOrchestrator.js';
export { ConsensusEngine } from './integration/ConsensusEngine.js';
export {
  AgentCoreClient,
  getAgentCoreClient,
  resetAgentCoreClient,
  TiaraNamespaces as AgentCoreTiaraNamespaces,
  type AgentCoreClientConfig,
  type MemoryEntry,
  type MemoryStoreInput,
  type MemorySearchParams,
  type MemorySearchResult,
  type ProcessInfo,
} from './integration/AgentCoreClient.js';

// Types
export * from './types.js';

// Default export
export { HiveMind as default } from './core/HiveMind.js';
