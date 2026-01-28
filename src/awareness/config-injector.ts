/**
 * Runtime Configuration Injector
 *
 * Reads dynamic configuration and formats it for system prompt.
 * Exposes browser profiles, enabled services, and active integrations.
 */

import fs from "fs/promises"
import path from "path"
import os from "os"
import { getZeeSplitwiseConfig, getZeeBrowserConfig, getZeeCodexbarConfig } from "../config/runtime"

export interface ServiceStatus {
  name: string
  status: "enabled" | "disabled" | "configured"
  details?: string
}

export interface RuntimeState {
  browserProfiles: BrowserProfileInfo[]
  enabledServices: ServiceStatus[]
  integrations: string[]
}

export interface BrowserProfileInfo {
  name: string
  color?: string
  cdpPort?: number
}

/**
 * Get current runtime state for a persona
 */
export async function getRuntimeState(persona: string): Promise<RuntimeState> {
  const state: RuntimeState = {
    browserProfiles: [],
    enabledServices: [],
    integrations: [],
  }

  // Browser profiles from zee.json
  try {
    const browserProfiles = await loadBrowserProfiles()
    state.browserProfiles = browserProfiles
  } catch {
    // Ignore if zee.json not available
  }

  // Zee-specific services
  if (persona === "zee") {
    // Splitwise
    try {
      const splitwise = getZeeSplitwiseConfig()
      state.enabledServices.push({
        name: "Splitwise",
        status: splitwise.enabled ? "enabled" : "disabled",
        details: splitwise.enabled
          ? "Actions: current-user, groups, group, friends, friend, expenses, expense, create-expense, update-expense, delete-expense, create-payment, notifications, currencies, categories, request"
          : undefined,
      })
    } catch {
      // Config not available
    }

    // CodexBar
    try {
      const codexbar = getZeeCodexbarConfig()
      state.enabledServices.push({
        name: "CodexBar",
        status: codexbar.enabled ? "enabled" : "disabled",
        details: codexbar.enabled ? "API usage tracking and cost monitoring" : undefined,
      })
    } catch {
      // Config not available
    }

    // Browser
    try {
      const browser = getZeeBrowserConfig()
      const profileNames = state.browserProfiles.map((p) => p.name)
      state.enabledServices.push({
        name: "Browser Automation",
        status: browser.enabled !== false ? "enabled" : "disabled",
        details:
          profileNames.length > 0
            ? `Profiles: ${profileNames.join(", ")}. Use { profile: "<name>" } to access authenticated sessions.`
            : undefined,
      })
    } catch {
      // Config not available
    }
  }

  return state
}

/**
 * Format runtime state for system prompt
 */
export function formatRuntimeStateForPrompt(state: RuntimeState): string {
  const lines: string[] = []

  // Browser profiles with details
  if (state.browserProfiles.length > 0) {
    lines.push("## Active Configuration")
    lines.push("")
    lines.push("### Browser Profiles")
    lines.push("Available profiles for authenticated browser sessions:")
    for (const profile of state.browserProfiles) {
      lines.push(`- **${profile.name}**: Use \`{ profile: "${profile.name}" }\` parameter in browser tools`)
    }
    lines.push("")
  }

  // Enabled services with full details
  const enabled = state.enabledServices.filter((s) => s.status === "enabled")
  if (enabled.length > 0) {
    if (lines.length === 0) {
      lines.push("## Active Configuration")
      lines.push("")
    }
    lines.push("### Enabled Services")
    for (const service of enabled) {
      if (service.details) {
        lines.push(`- **${service.name}**: ${service.details}`)
      } else {
        lines.push(`- **${service.name}**`)
      }
    }
    lines.push("")
  }

  return lines.join("\n")
}

async function loadBrowserProfiles(): Promise<BrowserProfileInfo[]> {
  const zeeConfigPath = path.join(os.homedir(), ".zee", "zee.json")

  try {
    const content = await fs.readFile(zeeConfigPath, "utf-8")
    const config = JSON.parse(content)
    const profiles = config.browser?.profiles ?? {}

    return Object.entries(profiles).map(([name, cfg]) => {
      const profileConfig = cfg as { color?: string; cdpPort?: number }
      return {
        name,
        color: profileConfig.color,
        cdpPort: profileConfig.cdpPort,
      }
    })
  } catch {
    return []
  }
}
