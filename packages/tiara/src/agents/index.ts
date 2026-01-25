/**
 * Agents Module
 *
 * Agent loading, management, and persona-agent reconciliation.
 *
 * @module tiara/agents
 */

// Agent Loader - Dynamic agent definitions from .claude/agents/
export {
  agentLoader,
  getAvailableAgentTypes,
  getAgent,
  getAllAgents,
  getAgentCategories,
  searchAgents,
  isValidAgentType,
  getAgentsByCategory,
  refreshAgents,
  resolveLegacyAgentType,
  LEGACY_AGENT_MAPPING,
  type AgentDefinition,
  type AgentCategory,
} from './agent-loader.js';

// Agent Manager
export { AgentManager } from './agent-manager.js';

// Agent Registry
export { AgentRegistry } from './agent-registry.js';

// Persona-Agent Reconciliation
export {
  // Types
  type PersonaId,
  type WorkerRole,
  type PersonaSpecialization,
  type PersonaCapabilities,
  type PersonaWorker,
  type PersonaSelectionOptions,
  // Constants
  PERSONA_CAPABILITIES,
  AGENT_TYPE_TO_PERSONA,
  SPECIALIZATION_TO_AGENT_TYPE,
  // Functions
  selectPersonaForTask,
  personaCanHandle,
  personaHasSpecialization,
  selectSpecialization,
  isValidPersona,
  getPersonaCapabilities,
  listPersonas,
  generateWorkerId,
  createPersonaWorker,
  getAgentTypeForWorker,
} from './persona-agents.js';
