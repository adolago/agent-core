/**
 * Zee Browser Profile Management Tools
 *
 * Provides multi-profile browser management via the Zee gateway:
 * - Create isolated browser profiles with separate cookies/storage
 * - Switch between profiles for different contexts (work, personal, etc.)
 * - Start/stop browsers per profile
 * - Reset profiles to clear all data
 *
 * Each profile has its own:
 * - CDP port for debugging
 * - Cookies and localStorage
 * - Browser history and cache
 * - Color for visual distinction
 */

import { z } from "zod";
import type { ToolDefinition, ToolExecutionResult } from "../../mcp/types.js";
import { Log } from "../../../packages/agent-core/src/util/log.js";
import { resolveBrowserConfig, type BrowserConfigResolved } from "./browser.js";

const log = Log.create({ service: "zee-browser-profiles" });

// =============================================================================
// HTTP Client Helper (reusing pattern from browser.ts)
// =============================================================================

interface ProfileFetchOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
}

async function fetchProfiles<T>(
  baseUrl: string,
  path: string,
  options: ProfileFetchOptions = {}
): Promise<T> {
  const { method = "GET", body, timeoutMs = 10000 } = options;

  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {};

  // Add auth token if configured
  const token = process.env.ZEE_BROWSER_CONTROL_TOKEN?.trim();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Browser API error (${response.status}): ${errorText}`);
    }

    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

function formatConnectionError(controlUrl: string, errorMsg: string): string {
  return `Cannot connect to browser server at ${controlUrl}.

To enable browser profiles:
1. Start the agent-core daemon:
   agent-core daemon

2. Ensure browser is enabled in agent-core.jsonc:
   { "zee": { "browser": { "enabled": true } } }

Error: ${errorMsg}`;
}

// =============================================================================
// Profile Types
// =============================================================================

interface ProfileStatus {
  name: string;
  cdpPort: number;
  cdpUrl: string;
  color: string;
  running: boolean;
  tabCount: number;
  isDefault: boolean;
  isRemote: boolean;
}

// =============================================================================
// Browser Profiles List Tool
// =============================================================================

const ProfilesListParams = z.object({
  timeoutMs: z.number().optional().describe("Request timeout in ms"),
});

export const browserProfilesListTool: ToolDefinition = {
  id: "zee:browser-profiles-list",
  category: "domain",
  init: async () => ({
    description: `List all browser profiles with their status.

Returns for each profile:
- name: Profile identifier
- running: Whether browser is active
- tabCount: Open tabs
- color: Visual identifier color
- cdpUrl: Chrome DevTools Protocol URL
- isDefault: Whether this is the default profile
- isRemote: Whether this connects to a remote browser

Examples:
- List all: { }`,
    parameters: ProfilesListParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      ctx.metadata({ title: "Browser Profiles" });

      const config = resolveBrowserConfig();
      if (!config.enabled) {
        return {
          title: "Browser Disabled",
          metadata: { enabled: false },
          output: `Browser automation is disabled.

Enable in agent-core.jsonc:
{
  "zee": {
    "browser": {
      "enabled": true
    }
  }
}`,
        };
      }

      try {
        const result = await fetchProfiles<{ profiles: ProfileStatus[] }>(
          config.controlUrl,
          "/profiles",
          { timeoutMs: args.timeoutMs }
        );

        if (result.profiles.length === 0) {
          return {
            title: "No Profiles",
            metadata: { count: 0 },
            output: `No browser profiles configured.

Create one with zee:browser-profiles-create:
{ name: "work", color: "#0066CC" }`,
          };
        }

        const profilesList = result.profiles.map((p, i) => {
          const status = p.running ? `running (${p.tabCount} tabs)` : "stopped";
          const defaultMark = p.isDefault ? " [default]" : "";
          const remoteMark = p.isRemote ? " [remote]" : "";
          return `${i + 1}. ${p.name}${defaultMark}${remoteMark}
   Status: ${status}
   Color: ${p.color}
   CDP: ${p.cdpUrl}`;
        }).join("\n\n");

        const runningCount = result.profiles.filter(p => p.running).length;

        return {
          title: `${result.profiles.length} Profile(s)`,
          metadata: {
            count: result.profiles.length,
            running: runningCount,
            profiles: result.profiles.map(p => p.name),
          },
          output: `Browser Profiles (${runningCount} running):

${profilesList}

Use zee:browser-status with profile parameter to check specific profile.
Use zee:browser-profiles-start to start a profile's browser.`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("fetch failed")) {
          return {
            title: "Browser Server Not Running",
            metadata: { error: "connection_failed" },
            output: formatConnectionError(config.controlUrl, errorMsg),
          };
        }

        return {
          title: "Profiles List Error",
          metadata: { error: errorMsg },
          output: `Failed to list profiles: ${errorMsg}`,
        };
      }
    },
  }),
};

// =============================================================================
// Browser Profile Create Tool
// =============================================================================

const ProfilesCreateParams = z.object({
  name: z.string()
    .regex(/^[a-z0-9][a-z0-9-]*$/, "Must be lowercase letters, numbers, hyphens (can't start with hyphen)")
    .max(64)
    .describe("Profile name (lowercase, numbers, hyphens only)"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional()
    .describe("Profile color in hex format (#RRGGBB). Auto-assigned if omitted."),
  cdpUrl: z.string().url().optional()
    .describe("For remote profiles: CDP URL of external Chrome instance"),
  timeoutMs: z.number().optional(),
});

export const browserProfilesCreateTool: ToolDefinition = {
  id: "zee:browser-profiles-create",
  category: "domain",
  init: async () => ({
    description: `Create a new browser profile.

Profiles provide isolated browser contexts with separate:
- Cookies and sessions
- localStorage and sessionStorage
- Browser history and cache
- Extensions and settings

Local profiles run Chrome on this machine.
Remote profiles connect to an external Chrome instance via CDP.

Examples:
- Local profile: { name: "work", color: "#0066CC" }
- Remote profile: { name: "cloud", cdpUrl: "http://browserless.io:3000" }`,
    parameters: ProfilesCreateParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      ctx.metadata({ title: `Create: ${args.name}` });

      const config = resolveBrowserConfig();
      if (!config.enabled) {
        return {
          title: "Browser Disabled",
          metadata: { enabled: false },
          output: `Browser automation is disabled. Enable in agent-core.jsonc.`,
        };
      }

      try {
        const result = await fetchProfiles<{
          ok: boolean;
          profile: string;
          cdpPort?: number;
          cdpUrl: string;
          color: string;
          isRemote: boolean;
        }>(config.controlUrl, "/profiles/create", {
          method: "POST",
          body: {
            name: args.name,
            color: args.color,
            cdpUrl: args.cdpUrl,
          },
          timeoutMs: args.timeoutMs,
        });

        return {
          title: "Profile Created",
          metadata: {
            name: result.profile,
            cdpUrl: result.cdpUrl,
            color: result.color,
            isRemote: result.isRemote,
          },
          output: `Created browser profile: ${result.profile}

- Color: ${result.color}
- CDP URL: ${result.cdpUrl}
${result.isRemote ? "- Type: Remote (external Chrome)" : `- Type: Local (CDP port ${result.cdpPort})`}

Start the browser with:
zee:browser-profiles-start { profile: "${result.profile}" }`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        // Handle specific error cases
        if (errorMsg.includes("409") || errorMsg.includes("already exists")) {
          return {
            title: "Profile Exists",
            metadata: { error: "already_exists", name: args.name },
            output: `Profile "${args.name}" already exists.

Use zee:browser-profiles-list to see all profiles.`,
          };
        }

        if (errorMsg.includes("507") || errorMsg.includes("no available CDP ports")) {
          return {
            title: "No Available Ports",
            metadata: { error: "no_ports" },
            output: `No available CDP ports for new profile.

Maximum profiles reached (default: 100).
Delete unused profiles with zee:browser-profiles-delete.`,
          };
        }

        if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("fetch failed")) {
          return {
            title: "Browser Server Not Running",
            metadata: { error: "connection_failed" },
            output: formatConnectionError(config.controlUrl, errorMsg),
          };
        }

        return {
          title: "Create Profile Error",
          metadata: { error: errorMsg },
          output: `Failed to create profile: ${errorMsg}`,
        };
      }
    },
  }),
};

// =============================================================================
// Browser Profile Delete Tool
// =============================================================================

const ProfilesDeleteParams = z.object({
  name: z.string().describe("Profile name to delete"),
  timeoutMs: z.number().optional(),
});

export const browserProfilesDeleteTool: ToolDefinition = {
  id: "zee:browser-profiles-delete",
  category: "domain",
  init: async () => ({
    description: `Delete a browser profile.

This will:
- Stop the browser if running
- Delete all profile data (cookies, localStorage, cache, history)
- Remove the profile from configuration

Cannot delete the default profile.

Example:
- { name: "work" }`,
    parameters: ProfilesDeleteParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      ctx.metadata({ title: `Delete: ${args.name}` });

      const config = resolveBrowserConfig();
      if (!config.enabled) {
        return {
          title: "Browser Disabled",
          metadata: { enabled: false },
          output: `Browser automation is disabled.`,
        };
      }

      try {
        await fetchProfiles<{ ok: boolean }>(
          config.controlUrl,
          `/profiles/${encodeURIComponent(args.name)}`,
          { method: "DELETE", timeoutMs: args.timeoutMs }
        );

        return {
          title: "Profile Deleted",
          metadata: { name: args.name },
          output: `Deleted browser profile: ${args.name}

All profile data has been removed.`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes("404") || errorMsg.includes("not found")) {
          return {
            title: "Profile Not Found",
            metadata: { error: "not_found", name: args.name },
            output: `Profile "${args.name}" not found.

Use zee:browser-profiles-list to see available profiles.`,
          };
        }

        if (errorMsg.includes("400") || errorMsg.includes("default profile")) {
          return {
            title: "Cannot Delete Default",
            metadata: { error: "is_default", name: args.name },
            output: `Cannot delete the default profile "${args.name}".

Change the default profile first in agent-core.jsonc:
{
  "zee": {
    "browser": {
      "defaultProfile": "other-profile"
    }
  }
}`,
          };
        }

        if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("fetch failed")) {
          return {
            title: "Browser Server Not Running",
            metadata: { error: "connection_failed" },
            output: formatConnectionError(config.controlUrl, errorMsg),
          };
        }

        return {
          title: "Delete Profile Error",
          metadata: { error: errorMsg },
          output: `Failed to delete profile: ${errorMsg}`,
        };
      }
    },
  }),
};

// =============================================================================
// Browser Profile Start Tool
// =============================================================================

const ProfilesStartParams = z.object({
  profile: z.string().describe("Profile name to start"),
  timeoutMs: z.number().optional(),
});

export const browserProfilesStartTool: ToolDefinition = {
  id: "zee:browser-profiles-start",
  category: "domain",
  init: async () => ({
    description: `Start a browser for a specific profile.

Launches Chrome with the profile's isolated data directory.
For remote profiles, connects to the external Chrome instance.

Example:
- { profile: "work" }`,
    parameters: ProfilesStartParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      ctx.metadata({ title: `Start: ${args.profile}` });

      const config = resolveBrowserConfig();
      if (!config.enabled) {
        return {
          title: "Browser Disabled",
          metadata: { enabled: false },
          output: `Browser automation is disabled.`,
        };
      }

      try {
        const result = await fetchProfiles<{
          ok: boolean;
          running: boolean;
          cdpPort?: number;
          cdpUrl?: string;
          pid?: number;
        }>(config.controlUrl, `/start?profile=${encodeURIComponent(args.profile)}`, {
          method: "POST",
          timeoutMs: args.timeoutMs || 30000, // Browser startup can take time
        });

        return {
          title: "Browser Started",
          metadata: {
            profile: args.profile,
            running: result.running,
            pid: result.pid,
          },
          output: `Started browser for profile: ${args.profile}

- Running: ${result.running ? "Yes" : "No"}
- CDP URL: ${result.cdpUrl || "N/A"}
${result.pid ? `- PID: ${result.pid}` : ""}

Use zee:browser-snapshot to see the page.`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes("404") || errorMsg.includes("not found")) {
          return {
            title: "Profile Not Found",
            metadata: { error: "not_found", profile: args.profile },
            output: `Profile "${args.profile}" not found.

Use zee:browser-profiles-list to see available profiles.`,
          };
        }

        if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("fetch failed")) {
          return {
            title: "Browser Server Not Running",
            metadata: { error: "connection_failed" },
            output: formatConnectionError(config.controlUrl, errorMsg),
          };
        }

        return {
          title: "Start Profile Error",
          metadata: { error: errorMsg },
          output: `Failed to start browser: ${errorMsg}`,
        };
      }
    },
  }),
};

// =============================================================================
// Browser Profile Stop Tool
// =============================================================================

const ProfilesStopParams = z.object({
  profile: z.string().describe("Profile name to stop"),
  timeoutMs: z.number().optional(),
});

export const browserProfilesStopTool: ToolDefinition = {
  id: "zee:browser-profiles-stop",
  category: "domain",
  init: async () => ({
    description: `Stop the browser for a specific profile.

Closes Chrome and all its tabs for this profile.
Profile data (cookies, localStorage) is preserved.

Example:
- { profile: "work" }`,
    parameters: ProfilesStopParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      ctx.metadata({ title: `Stop: ${args.profile}` });

      const config = resolveBrowserConfig();
      if (!config.enabled) {
        return {
          title: "Browser Disabled",
          metadata: { enabled: false },
          output: `Browser automation is disabled.`,
        };
      }

      try {
        await fetchProfiles<{ ok: boolean }>(
          config.controlUrl,
          `/stop?profile=${encodeURIComponent(args.profile)}`,
          { method: "POST", timeoutMs: args.timeoutMs }
        );

        return {
          title: "Browser Stopped",
          metadata: { profile: args.profile },
          output: `Stopped browser for profile: ${args.profile}

Profile data has been preserved.
Restart with zee:browser-profiles-start.`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("fetch failed")) {
          return {
            title: "Browser Server Not Running",
            metadata: { error: "connection_failed" },
            output: formatConnectionError(config.controlUrl, errorMsg),
          };
        }

        return {
          title: "Stop Profile Error",
          metadata: { error: errorMsg },
          output: `Failed to stop browser: ${errorMsg}`,
        };
      }
    },
  }),
};

// =============================================================================
// Browser Profile Reset Tool
// =============================================================================

const ProfilesResetParams = z.object({
  profile: z.string().describe("Profile name to reset"),
  timeoutMs: z.number().optional(),
});

export const browserProfilesResetTool: ToolDefinition = {
  id: "zee:browser-profiles-reset",
  category: "domain",
  init: async () => ({
    description: `Reset a browser profile to clear all data.

This will:
- Stop the browser if running
- Delete all cookies, localStorage, sessionStorage
- Clear browser cache and history
- Reset to a clean state

The profile configuration is preserved; only data is cleared.

Example:
- { profile: "work" }`,
    parameters: ProfilesResetParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      ctx.metadata({ title: `Reset: ${args.profile}` });

      const config = resolveBrowserConfig();
      if (!config.enabled) {
        return {
          title: "Browser Disabled",
          metadata: { enabled: false },
          output: `Browser automation is disabled.`,
        };
      }

      try {
        await fetchProfiles<{ ok: boolean }>(
          config.controlUrl,
          `/reset-profile?profile=${encodeURIComponent(args.profile)}`,
          { method: "POST", timeoutMs: args.timeoutMs || 15000 }
        );

        return {
          title: "Profile Reset",
          metadata: { profile: args.profile },
          output: `Reset browser profile: ${args.profile}

All data has been cleared:
- Cookies
- localStorage / sessionStorage
- Cache
- History

The browser is now stopped. Start fresh with:
zee:browser-profiles-start { profile: "${args.profile}" }`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("fetch failed")) {
          return {
            title: "Browser Server Not Running",
            metadata: { error: "connection_failed" },
            output: formatConnectionError(config.controlUrl, errorMsg),
          };
        }

        return {
          title: "Reset Profile Error",
          metadata: { error: errorMsg },
          output: `Failed to reset profile: ${errorMsg}`,
        };
      }
    },
  }),
};

// =============================================================================
// Exports
// =============================================================================

export const BROWSER_PROFILE_TOOLS = [
  browserProfilesListTool,
  browserProfilesCreateTool,
  browserProfilesDeleteTool,
  browserProfilesStartTool,
  browserProfilesStopTool,
  browserProfilesResetTool,
];

export function registerBrowserProfileTools(registry: { register: (tool: ToolDefinition, options: { source: string }) => void }): void {
  for (const tool of BROWSER_PROFILE_TOOLS) {
    registry.register(tool, { source: "domain" });
  }
}
