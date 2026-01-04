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
export * from "./agent.js";

// Persona system
export * from "./persona.js";

// Permission evaluation
export * from "./permission.js";

// Re-export built-in persona definitions
export * as Personas from "./personas.js";
