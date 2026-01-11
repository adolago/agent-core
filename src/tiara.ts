/**
 * Tiara - Agent Orchestration Interface
 *
 * This module bridges the Council deliberation system with the Personas orchestrator.
 * It exports the AgentOrchestrator interface expected by the council stages.
 */

import type { PersonaId } from "./personas/types";

/**
 * Result from spawning an agent
 */
export interface AgentSpawnResult {
  result?: unknown;
  error?: string;
  durationMs?: number;
}

/**
 * Options for spawning an agent
 */
export interface AgentSpawnOptions {
  agentType: string;
  action: string;
  params: Record<string, unknown>;
  context?: string;
}

/**
 * AgentOrchestrator interface expected by the Council deliberation system.
 * Provides agent spawning capabilities for multi-agent coordination.
 */
export interface AgentOrchestrator {
  /**
   * Spawn an agent to perform a specific action
   */
  spawnAgent(options: AgentSpawnOptions): Promise<AgentSpawnResult>;
}

/**
 * Map council agent types to personas
 */
function mapAgentTypeToPersona(agentType: string): PersonaId {
  switch (agentType.toLowerCase()) {
    case "inbox_manager":
    case "scheduler":
    case "task_coordinator":
      return "zee";
    case "research_assistant":
      return "johny";
    case "market_analyst":
    case "portfolio_manager":
      return "stanley";
    default:
      return "zee"; // Default to Zee for unknown types
  }
}

/**
 * Create an AgentOrchestrator adapter from the Personas Orchestrator
 */
export function createAgentOrchestrator(
  orchestrator: import("./personas/tiara").Orchestrator
): AgentOrchestrator {
  return {
    async spawnAgent(options: AgentSpawnOptions): Promise<AgentSpawnResult> {
      const startTime = Date.now();
      const persona = mapAgentTypeToPersona(options.agentType);

      try {
        // Build prompt from action and params
        const prompt = buildAgentPrompt(options);

        // Use spawnDroneWithWait to get the result
        const result = await orchestrator.spawnDroneWithWait({
          persona,
          task: `${options.agentType}: ${options.action}`,
          prompt,
        });

        return {
          result: result.result,
          error: result.error,
          durationMs: result.durationMs,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startTime,
        };
      }
    },
  };
}

/**
 * Build a prompt for the agent from spawn options
 */
function buildAgentPrompt(options: AgentSpawnOptions): string {
  const parts: string[] = [];

  parts.push(`## Agent Role: ${options.agentType}`);
  parts.push(`## Action: ${options.action}`);

  if (options.context) {
    parts.push(`\n## Context\n${options.context}`);
  }

  if (options.params.query) {
    parts.push(`\n## Query\n${options.params.query}`);
  }

  // Add any other params
  const otherParams = Object.entries(options.params).filter(
    ([key]) => key !== "query"
  );
  if (otherParams.length > 0) {
    parts.push(`\n## Parameters`);
    for (const [key, value] of otherParams) {
      parts.push(`- ${key}: ${JSON.stringify(value)}`);
    }
  }

  return parts.join("\n");
}

// Re-export Orchestrator for convenience
export { Orchestrator } from "./personas/tiara";
export type { PersonaId } from "./personas/types";
