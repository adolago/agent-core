/**
 * Personas Module
 *
 * Unified orchestration system for personas: Zee, Stanley, Johny.
 * Provides shared capabilities for all personas:
 * - Drone spawning for background tasks
 * - Qdrant-backed memory and state persistence
 * - WezTerm pane management for visualization
 * - Conversation continuity across compacting
 */

// Types
export * from "./types";

// Persona utilities
export {
  PERSONA_AGENT_MAPPINGS,
  selectDroneType,
  generateDronePrompt,
  getPersonaConfig,
  generateWorkerName,
} from "./persona";

// Memory bridge
export {
  QdrantMemoryBridge,
  createMemoryBridge,
} from "./memory-bridge";

// WezTerm integration
export {
  WeztermPaneBridge,
  createWeztermBridge,
} from "./wezterm";

// Continuity
export {
  ContinuityManager,
  createContinuityManager,
  extractKeyFacts,
  generateSummary,
  mergeFacts,
  createConversationState,
  updateConversationState,
  formatContextForPrompt,
} from "./continuity";

// Orchestrator
export {
  Orchestrator,
  createOrchestrator,
  getOrchestrator,
  shutdownOrchestrator,
} from "./tiara";

// Drone wait & announce
export {
  DroneWaiter,
  getDroneWaiter,
  shutdownDroneWaiter,
  formatAnnouncement,
  shouldAnnounce,
  buildSpawnConfig,
} from "./drone-wait";
