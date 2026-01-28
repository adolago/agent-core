/**
 * Tool Catalog Generator
 *
 * Generates a concise, structured catalog of available tools
 * from the tool registry at runtime. This ensures personas
 * know their full capabilities including action variants.
 */

import { ToolRegistry } from "../../packages/agent-core/src/tool/registry"
import type { Agent } from "../../packages/agent-core/src/agent/agent"
import { getZeeSplitwiseConfig, getZeeBrowserConfig, getZeeCodexbarConfig } from "../config/runtime"

export interface ToolCatalogEntry {
  id: string
  description: string
  actions?: string[]
  category?: string
}

export interface ToolCatalog {
  persona: string
  tools: ToolCatalogEntry[]
  enabledServices: string[]
  generatedAt: number
}

/**
 * Generate tool catalog for a specific agent/persona
 */
export async function generateToolCatalog(agent: Agent.Info): Promise<ToolCatalog> {
  const registry = await ToolRegistry.tools({ providerID: "", modelID: "" }, agent)

  const tools: ToolCatalogEntry[] = []

  for (const tool of registry) {
    if (tool.id === "invalid") continue

    const entry: ToolCatalogEntry = {
      id: tool.id,
      description: extractDescription(tool.description ?? ""),
    }

    // Extract actions for multi-action tools
    const actions = extractActions(tool.description ?? "")
    if (actions.length > 0) {
      entry.actions = actions
    }

    // Categorize by prefix
    if (tool.id.includes(":")) {
      entry.category = tool.id.split(":")[0]
    }

    tools.push(entry)
  }

  return {
    persona: agent.name,
    tools,
    enabledServices: getEnabledServices(agent.name),
    generatedAt: Date.now(),
  }
}

/**
 * Format catalog for system prompt injection
 */
export function formatCatalogForPrompt(catalog: ToolCatalog): string {
  if (catalog.tools.length === 0) return ""

  const lines: string[] = ["## Available Tools & Capabilities", ""]

  // Group tools by category
  const grouped = groupToolsByCategory(catalog.tools)

  // First show uncategorized (core) tools
  const core = grouped[""] ?? []
  if (core.length > 0) {
    lines.push("### Core Tools")
    for (const tool of core.slice(0, 15)) {
      lines.push(formatToolEntry(tool))
    }
    if (core.length > 15) {
      lines.push(`  _(and ${core.length - 15} more core tools)_`)
    }
    lines.push("")
  }

  // Then show persona-specific tools with full detail
  const personaPrefix = catalog.persona.toLowerCase()
  const personaTools = grouped[personaPrefix] ?? []
  if (personaTools.length > 0) {
    lines.push(`### ${capitalize(personaPrefix)} Tools`)
    for (const tool of personaTools) {
      lines.push(formatToolEntry(tool))
    }
    lines.push("")
  }

  // Show other prefixed tools briefly
  for (const [prefix, tools] of Object.entries(grouped)) {
    if (prefix === "" || prefix === personaPrefix) continue
    if (tools.length > 0) {
      lines.push(`### ${capitalize(prefix)} Tools`)
      for (const tool of tools.slice(0, 5)) {
        lines.push(formatToolEntry(tool))
      }
      if (tools.length > 5) {
        lines.push(`  _(and ${tools.length - 5} more ${prefix} tools)_`)
      }
      lines.push("")
    }
  }

  // Add enabled services section
  if (catalog.enabledServices.length > 0) {
    lines.push("### Enabled Integrations")
    for (const service of catalog.enabledServices) {
      lines.push(`- ${service}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

function formatToolEntry(tool: ToolCatalogEntry): string {
  const actionList = tool.actions?.length ? ` [${tool.actions.join(", ")}]` : ""
  return `- **${tool.id}**: ${tool.description}${actionList}`
}

function extractDescription(rawDescription: string): string {
  if (!rawDescription) return "(no description)"

  // Take first sentence or first 120 chars
  const firstLine = rawDescription.split("\n")[0]?.trim() ?? ""
  const parts = firstLine.split(/\.\s/)
  const firstSentence = parts[0] ?? ""

  const desc = firstSentence.length < firstLine.length ? firstSentence + "." : firstLine

  return desc.length > 120 ? desc.slice(0, 117) + "..." : desc
}

function extractActions(description: string): string[] {
  if (!description) return []

  // Look for action enums in description
  // Pattern: "action": { "enum": ["create-expense", "update-expense", ...] }
  const enumMatch = description.match(/["']?action["']?\s*:\s*\{[^}]*["']?enum["']?\s*:\s*\[([^\]]+)\]/i)
  if (enumMatch && enumMatch[1]) {
    return enumMatch[1]
      .split(",")
      .map((s) => s.replace(/["'\s]/g, ""))
      .filter(Boolean)
  }

  // Pattern: Actions: create-expense, update-expense
  const actionListMatch = description.match(/Actions?:?\s*([a-z-]+(?:,\s*[a-z-]+)*)/i)
  if (actionListMatch && actionListMatch[1]) {
    return actionListMatch[1].split(",").map((s) => s.trim()).filter(Boolean)
  }

  return []
}

function groupToolsByCategory(tools: ToolCatalogEntry[]): Record<string, ToolCatalogEntry[]> {
  const grouped: Record<string, ToolCatalogEntry[]> = {}

  for (const tool of tools) {
    const category = tool.category ?? ""
    if (!grouped[category]) {
      grouped[category] = []
    }
    grouped[category].push(tool)
  }

  return grouped
}

function getEnabledServices(persona: string): string[] {
  const services: string[] = []

  if (persona === "zee") {
    try {
      const splitwise = getZeeSplitwiseConfig()
      if (splitwise.enabled) {
        services.push("Splitwise (expense tracking: create-expense, update-expense, delete-expense, create-payment, groups, friends, expenses)")
      }
    } catch {
      // Config not available
    }

    try {
      const browser = getZeeBrowserConfig()
      if (browser.enabled !== false) {
        services.push("Browser automation (with configured profiles)")
      }
    } catch {
      // Config not available
    }

    try {
      const codexbar = getZeeCodexbarConfig()
      if (codexbar.enabled) {
        services.push("CodexBar (API usage tracking)")
      }
    } catch {
      // Config not available
    }
  }

  return services
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
