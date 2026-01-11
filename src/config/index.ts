/**
 * Configuration Module
 *
 * Exports shared configuration types and constants for agent-core.
 *
 * The main config system lives in packages/agent-core/src/config/config.ts
 * This module provides:
 * - Shared constants (ports, URLs, timeouts)
 * - Shared types (DmPolicy, GroupPolicy, etc.)
 * - Agent-core specific types (AgentPersonaConfig, SurfaceConfigs)
 */

// Shared constants (Qdrant URLs, timeouts, ports, etc.)
export * from "./constants";

// Shared types (DmPolicy, GroupPolicy, LogLevel, RetryConfig)
export * from "./shared";

// Agent-core specific types (AgentCoreConfig, AgentPersonaConfig, etc.)
export * from "./types";
