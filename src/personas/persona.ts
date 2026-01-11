/**
 * Persona Mapping
 *
 * Maps Personas personas (Zee, Stanley, Johny) to tiara agent configurations.
 * Each persona can spawn drones that inherit their identity and capabilities.
 */

import type { PersonaId, OrchestrationPersona } from "./types";
import { ORCHESTRATION_PERSONAS } from "./types";

// Import tiara types
// Note: These are from the vendor submodule
type ClaudeFlowAgentType =
  | "coordinator"
  | "researcher"
  | "coder"
  | "analyst"
  | "architect"
  | "tester"
  | "reviewer"
  | "optimizer"
  | "documenter"
  | "monitor"
  | "specialist";

type ClaudeFlowCapability =
  | "task_management"
  | "resource_allocation"
  | "consensus_building"
  | "information_gathering"
  | "pattern_recognition"
  | "knowledge_synthesis"
  | "code_generation"
  | "refactoring"
  | "debugging"
  | "data_analysis"
  | "performance_metrics"
  | "bottleneck_detection"
  | "system_design"
  | "architecture"
  | "architecture_patterns"
  | "integration_planning"
  | "technical_writing"
  | "test_generation"
  | "quality_assurance"
  | "edge_case_detection"
  | "code_review"
  | "standards_enforcement"
  | "best_practices"
  | "performance_optimization"
  | "resource_optimization"
  | "algorithm_improvement"
  | "documentation_generation"
  | "api_docs"
  | "user_guides"
  | "system_monitoring"
  | "health_checks"
  | "alerting"
  | "domain_expertise"
  | "custom_capabilities"
  | "problem_solving";

/**
 * Mapping from Personas personas to tiara agent types.
 * Each persona maps to a primary type and secondary types for drones.
 */
export interface PersonaAgentMapping {
  /** Primary tiara agent type when acting as queen */
  primaryType: ClaudeFlowAgentType;
  /** Agent types drones can take */
  droneTypes: ClaudeFlowAgentType[];
  /** Default capabilities */
  capabilities: ClaudeFlowCapability[];
}

/**
 * Persona to tiara agent mappings
 */
export const PERSONA_AGENT_MAPPINGS: Record<PersonaId, PersonaAgentMapping> = {
  zee: {
    primaryType: "coordinator",
    droneTypes: ["researcher", "coder", "documenter", "specialist"],
    capabilities: [
      "task_management",
      "information_gathering",
      "knowledge_synthesis",
      "documentation_generation",
      "resource_allocation",
      "problem_solving",
    ],
  },
  stanley: {
    primaryType: "analyst",
    droneTypes: ["researcher", "analyst", "optimizer", "monitor"],
    capabilities: [
      "data_analysis",
      "performance_metrics",
      "pattern_recognition",
      "bottleneck_detection",
      "resource_optimization",
      "algorithm_improvement",
    ],
  },
  johny: {
    primaryType: "architect",
    droneTypes: ["researcher", "coder", "tester", "reviewer"],
    capabilities: [
      "knowledge_synthesis",
      "pattern_recognition",
      "technical_writing",
      "problem_solving",
      "system_design",
      "architecture",
    ],
  },
};

/**
 * Get the appropriate drone type for a task based on persona and task description.
 */
export function selectDroneType(
  persona: PersonaId,
  taskDescription: string
): ClaudeFlowAgentType {
  const mapping = PERSONA_AGENT_MAPPINGS[persona];
  const desc = taskDescription.toLowerCase();

  // Keyword-based selection
  if (desc.includes("research") || desc.includes("find") || desc.includes("search")) {
    return "researcher";
  }
  if (desc.includes("code") || desc.includes("implement") || desc.includes("build")) {
    return "coder";
  }
  if (desc.includes("test") || desc.includes("verify") || desc.includes("check")) {
    return "tester";
  }
  if (desc.includes("review") || desc.includes("analyze")) {
    return persona === "stanley" ? "analyst" : "reviewer";
  }
  if (desc.includes("document") || desc.includes("write")) {
    return "documenter";
  }
  if (desc.includes("optimize") || desc.includes("improve") || desc.includes("performance")) {
    return "optimizer";
  }
  if (desc.includes("monitor") || desc.includes("watch") || desc.includes("track")) {
    return "monitor";
  }

  // Default to first drone type
  return mapping.droneTypes[0];
}

/**
 * Generate a system prompt for a persona drone.
 */
export function generateDronePrompt(
  persona: PersonaId,
  task: string,
  context?: {
    plan?: string;
    objectives?: string[];
    keyFacts?: string[];
  }
): string {
  const config = getPersonaConfig(persona);
  const parts: string[] = [];

  // Identity
  parts.push(`# Identity\n`);
  parts.push(`You are a ${config.displayName} drone - a background worker maintaining the ${config.displayName} persona identity.`);
  parts.push(`Domain: ${config.domain}`);
  parts.push(``);

  // Persona traits
  parts.push(`# Persona Traits`);
  config.systemPromptAdditions.forEach((trait) => {
    parts.push(`- ${trait}`);
  });
  parts.push(``);

  // Context from queen
  if (context?.plan) {
    parts.push(`# Current Plan`);
    parts.push(context.plan);
    parts.push(``);
  }

  if (context?.objectives?.length) {
    parts.push(`# Active Objectives`);
    context.objectives.forEach((obj, i) => {
      parts.push(`${i + 1}. ${obj}`);
    });
    parts.push(``);
  }

  if (context?.keyFacts?.length) {
    parts.push(`# Key Context`);
    context.keyFacts.forEach((fact) => {
      parts.push(`- ${fact}`);
    });
    parts.push(``);
  }

  // Task
  parts.push(`# Your Task`);
  parts.push(task);
  parts.push(``);

  // Instructions
  parts.push(`# Instructions`);
  parts.push(`1. Complete the task above while maintaining ${config.displayName}'s perspective and expertise.`);
  parts.push(`2. When finished, summarize your results clearly.`);
  parts.push(`3. Note any important findings that should be shared with the queen.`);
  parts.push(`4. If you encounter blockers, document them clearly.`);

  return parts.join("\n");
}

/**
 * Get persona config by ID
 */
export function getPersonaConfig(id: PersonaId): OrchestrationPersona {
  return ORCHESTRATION_PERSONAS[id];
}

/**
 * Generate a worker name
 */
export function generateWorkerName(persona: PersonaId, role: "queen" | "drone", index?: number): string {
  const config = getPersonaConfig(persona);
  if (role === "queen") {
    return `${config.displayName} (Queen)`;
  }
  return `${config.displayName}-drone-${index ?? Math.floor(Math.random() * 1000)}`;
}
