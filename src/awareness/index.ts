/**
 * Awareness Module
 *
 * Generates runtime awareness information for personas including:
 * - Tool catalog with descriptions and actions
 * - Knowledge files from persona configuration
 * - Runtime configuration state (browser profiles, enabled services)
 *
 * This module bridges the gap between static skill documentation
 * and dynamic tool/config state, ensuring personas know their
 * full capabilities.
 */

import type { Agent } from "../../packages/agent-core/src/agent/agent"
import { generateToolCatalog, formatCatalogForPrompt } from "./tool-catalog"
import { loadKnowledgeFiles, formatKnowledgeForPrompt } from "./knowledge-loader"
import { getRuntimeState, formatRuntimeStateForPrompt } from "./config-injector"

export { generateToolCatalog, formatCatalogForPrompt } from "./tool-catalog"
export { loadKnowledgeFiles, formatKnowledgeForPrompt } from "./knowledge-loader"
export { getRuntimeState, formatRuntimeStateForPrompt } from "./config-injector"

export type { ToolCatalog, ToolCatalogEntry } from "./tool-catalog"
export type { LoadedKnowledge } from "./knowledge-loader"
export type { RuntimeState, ServiceStatus, BrowserProfileInfo } from "./config-injector"

/**
 * Generate complete awareness section for system prompt
 *
 * Combines:
 * 1. Tool catalog with descriptions and available actions
 * 2. Knowledge files from persona config
 * 3. Runtime configuration state
 */
export async function generateAwarenessSection(agent: Agent.Info): Promise<string> {
  const sections: string[] = []

  // 1. Runtime Configuration (browser profiles, enabled services)
  // Put this first so the model knows what's available
  try {
    const state = await getRuntimeState(agent.name)
    const configSection = formatRuntimeStateForPrompt(state)
    if (configSection) {
      sections.push(configSection)
    }
  } catch {
    // Log but don't fail
  }

  // 2. Tool Catalog
  // This provides detailed tool information beyond what's in the skill file
  try {
    const catalog = await generateToolCatalog(agent)
    const toolSection = formatCatalogForPrompt(catalog)
    if (toolSection) {
      sections.push(toolSection)
    }
  } catch {
    // Log but don't fail
  }

  // 3. Knowledge Files
  // Load persona-specific knowledge (IDENTITY.md, SOUL.md, etc.)
  try {
    const knowledge = await loadKnowledgeFiles(agent.knowledge)
    const knowledgeSection = formatKnowledgeForPrompt(knowledge)
    if (knowledgeSection) {
      sections.push(knowledgeSection)
    }
  } catch {
    // Log but don't fail
  }

  return sections.join("\n\n")
}
