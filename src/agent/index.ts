/**
 * Agent Module - Public API
 *
 * This module exports the agent persona system for agent-core.
 * It supports three use cases:
 * - Stanley: Professional financial analysis
 * - Zee: Personal AI assistant
 * - OpenCode: Development agent (inherited patterns)
 */

// Core agent types and utilities
export {
  Permission,
  AgentMode,
  UseCase,
  ModelConfig,
  PermissionConfig,
  ToolConfig,
  AgentInfo,
  AgentConfig,
  Agent,
  parseModelString,
} from "./agent";

// Persona system
export {
  Soul,
  Identity,
  PersonaDefinition,
  PersonaConfig,
  IdentityContext,
  Persona,
} from "./persona";

// Permission evaluation
export {
  PermissionContext,
  PermissionResult,
  PermissionResponse,
  PendingPermission,
  PermissionRejectedError,
  PermissionEvaluator,
  PermissionManager,
} from "./permission";

// Re-export built-in persona definitions
export * as Personas from "./personas";
