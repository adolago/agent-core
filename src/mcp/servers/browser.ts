#!/usr/bin/env node
/**
 * Browser MCP Server
 *
 * Exposes browser control capabilities via MCP protocol by proxying to Zee's
 * browser control server. All personas (Stanley, Zee, Johny) can use this for
 * web automation with persistent login sessions.
 *
 * Tools:
 * - browser_status: Check browser status
 * - browser_start: Start browser
 * - browser_stop: Stop browser
 * - browser_tabs: List open tabs
 * - browser_open: Open URL in new tab
 * - browser_snapshot: Get page accessibility snapshot
 * - browser_screenshot: Take screenshot
 * - browser_navigate: Navigate current tab
 * - browser_act: Perform browser actions (click, type, etc.)
 * - browser_profiles: List browser profiles
 * - browser_create_profile: Create new browser profile
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Default Zee gateway browser control URL
const DEFAULT_BROWSER_CONTROL_URL =
  process.env.ZEE_BROWSER_CONTROL_URL || "http://127.0.0.1:18791";

async function browserFetch(
  endpoint: string,
  options: { method?: string; body?: unknown; profile?: string } = {}
) {
  const url = new URL(endpoint, DEFAULT_BROWSER_CONTROL_URL);
  if (options.profile) {
    url.searchParams.set("profile", options.profile);
  }

  const res = await fetch(url.toString(), {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Browser control error (${res.status}): ${text}`);
  }

  return res.json();
}

function jsonResult(data: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(data, null, 2) },
    ],
  };
}

function errorResult(error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      },
    ],
    isError: true,
  };
}

// Create server
const server = new McpServer({
  name: "personas-browser",
  version: "1.0.0",
});

// =============================================================================
// browser_status - Check browser status
// =============================================================================

server.tool(
  "browser_status",
  `Check if the browser is running and get connection details.`,
  {
    profile: z.string().optional().describe("Browser profile name"),
  },
  async (args) => {
    try {
      const result = await browserFetch("/status", { profile: args.profile });
      return jsonResult({ success: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  }
);

// =============================================================================
// browser_start - Start the browser
// =============================================================================

server.tool(
  "browser_start",
  `Start the browser. Opens a dedicated Chrome/Chromium window for automation.
The browser uses a persistent profile to maintain login sessions.`,
  {
    profile: z.string().optional().describe("Browser profile name"),
  },
  async (args) => {
    try {
      await browserFetch("/start", { method: "POST", profile: args.profile });
      const status = await browserFetch("/status", { profile: args.profile });
      return jsonResult({ success: true, ...status });
    } catch (error) {
      return errorResult(error);
    }
  }
);

// =============================================================================
// browser_stop - Stop the browser
// =============================================================================

server.tool(
  "browser_stop",
  `Stop the browser gracefully.`,
  {
    profile: z.string().optional().describe("Browser profile name"),
  },
  async (args) => {
    try {
      await browserFetch("/stop", { method: "POST", profile: args.profile });
      const status = await browserFetch("/status", { profile: args.profile });
      return jsonResult({ success: true, ...status });
    } catch (error) {
      return errorResult(error);
    }
  }
);

// =============================================================================
// browser_tabs - List open tabs
// =============================================================================

server.tool(
  "browser_tabs",
  `List all open browser tabs with their URLs and titles.`,
  {
    profile: z.string().optional().describe("Browser profile name"),
  },
  async (args) => {
    try {
      const result = await browserFetch("/tabs", { profile: args.profile });
      return jsonResult({ success: true, tabs: result.tabs || [] });
    } catch (error) {
      return errorResult(error);
    }
  }
);

// =============================================================================
// browser_open - Open URL in new tab
// =============================================================================

server.tool(
  "browser_open",
  `Open a URL in a new browser tab.`,
  {
    url: z.string().describe("URL to open"),
    profile: z.string().optional().describe("Browser profile name"),
  },
  async (args) => {
    try {
      const result = await browserFetch("/open", {
        method: "POST",
        body: { url: args.url },
        profile: args.profile,
      });
      return jsonResult({ success: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  }
);

// =============================================================================
// browser_snapshot - Get page accessibility snapshot
// =============================================================================

server.tool(
  "browser_snapshot",
  `Get an accessibility snapshot of the current page.
Use this to understand page structure and find element references for actions.
The "ai" format returns a compact, LLM-friendly representation with element refs.`,
  {
    format: z
      .enum(["ai", "aria"])
      .default("ai")
      .describe("Snapshot format: 'ai' (compact) or 'aria' (full)"),
    targetId: z.string().optional().describe("Target tab ID (optional)"),
    limit: z.number().optional().describe("Max elements to include"),
    profile: z.string().optional().describe("Browser profile name"),
  },
  async (args) => {
    try {
      const result = await browserFetch("/snapshot", {
        method: "POST",
        body: {
          format: args.format || "ai",
          targetId: args.targetId,
          limit: args.limit,
        },
        profile: args.profile,
      });
      // For "ai" format, return snapshot text directly for readability
      if (args.format === "ai" && result.snapshot) {
        return {
          content: [{ type: "text" as const, text: result.snapshot }],
        };
      }
      return jsonResult({ success: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  }
);

// =============================================================================
// browser_screenshot - Take screenshot
// =============================================================================

server.tool(
  "browser_screenshot",
  `Take a screenshot of the current page or a specific element.`,
  {
    fullPage: z.boolean().default(false).describe("Capture full scrollable page"),
    ref: z.string().optional().describe("Element reference from snapshot"),
    element: z.string().optional().describe("CSS selector for element"),
    type: z.enum(["png", "jpeg"]).default("png").describe("Image format"),
    targetId: z.string().optional().describe("Target tab ID"),
    profile: z.string().optional().describe("Browser profile name"),
  },
  async (args) => {
    try {
      const result = await browserFetch("/screenshot", {
        method: "POST",
        body: {
          fullPage: args.fullPage,
          ref: args.ref,
          element: args.element,
          type: args.type,
          targetId: args.targetId,
        },
        profile: args.profile,
      });
      return jsonResult({
        success: true,
        path: result.path,
        message: `Screenshot saved to ${result.path}`,
      });
    } catch (error) {
      return errorResult(error);
    }
  }
);

// =============================================================================
// browser_navigate - Navigate current tab
// =============================================================================

server.tool(
  "browser_navigate",
  `Navigate the current tab to a new URL.`,
  {
    url: z.string().describe("URL to navigate to"),
    targetId: z.string().optional().describe("Target tab ID"),
    profile: z.string().optional().describe("Browser profile name"),
  },
  async (args) => {
    try {
      const result = await browserFetch("/navigate", {
        method: "POST",
        body: { url: args.url, targetId: args.targetId },
        profile: args.profile,
      });
      return jsonResult({ success: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  }
);

// =============================================================================
// browser_act - Perform browser actions
// =============================================================================

const BROWSER_ACT_KINDS = [
  "click",
  "type",
  "press",
  "hover",
  "drag",
  "select",
  "fill",
  "wait",
  "close",
] as const;

server.tool(
  "browser_act",
  `Perform a browser action (click, type, press keys, etc.).

Actions:
- click: Click an element (ref required)
- type: Type text into focused element
- press: Press a key (Enter, Tab, etc.)
- hover: Hover over element
- select: Select option in dropdown
- fill: Fill multiple form fields
- wait: Wait for condition (use sparingly)
- close: Close current tab

Use browser_snapshot first to get element refs.`,
  {
    kind: z.enum(BROWSER_ACT_KINDS).describe("Action type"),
    ref: z.string().optional().describe("Element reference from snapshot"),
    text: z.string().optional().describe("Text to type (for 'type' action)"),
    key: z.string().optional().describe("Key to press (for 'press' action)"),
    submit: z.boolean().optional().describe("Submit after typing"),
    doubleClick: z.boolean().optional().describe("Double-click instead of single"),
    values: z.array(z.string()).optional().describe("Values for 'select' action"),
    fields: z
      .array(z.object({ ref: z.string(), value: z.string() }))
      .optional()
      .describe("Fields for 'fill' action"),
    timeMs: z.number().optional().describe("Wait time in ms (for 'wait')"),
    textGone: z.string().optional().describe("Wait until text disappears"),
    targetId: z.string().optional().describe("Target tab ID"),
    profile: z.string().optional().describe("Browser profile name"),
  },
  async (args) => {
    try {
      const { profile, targetId, ...request } = args;
      const result = await browserFetch("/act", {
        method: "POST",
        body: { ...request, targetId },
        profile,
      });
      return jsonResult({ success: true, ...result });
    } catch (error) {
      return errorResult(error);
    }
  }
);

// =============================================================================
// browser_profiles - List browser profiles
// =============================================================================

server.tool(
  "browser_profiles",
  `List all browser profiles.
Profiles allow separate login sessions (e.g., "linkedin", "github").`,
  {},
  async () => {
    try {
      const result = await browserFetch("/profiles");
      return jsonResult({ success: true, profiles: result.profiles || [] });
    } catch (error) {
      return errorResult(error);
    }
  }
);

// =============================================================================
// browser_create_profile - Create new browser profile
// =============================================================================

server.tool(
  "browser_create_profile",
  `Create a new browser profile for isolated login sessions.
After creating, start the browser with this profile and log in manually.`,
  {
    name: z
      .string()
      .describe("Profile name (lowercase, numbers, hyphens)"),
    color: z.string().optional().describe("Profile color (hex, e.g. #0066CC)"),
  },
  async (args) => {
    try {
      const result = await browserFetch("/profiles/create", {
        method: "POST",
        body: { name: args.name, color: args.color },
      });
      return jsonResult({
        success: true,
        ...result,
        message: `Profile "${args.name}" created. Start browser with this profile and log in manually.`,
      });
    } catch (error) {
      return errorResult(error);
    }
  }
);

// =============================================================================
// Start server
// =============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `Browser MCP server running on stdio (control: ${DEFAULT_BROWSER_CONTROL_URL})`
  );
}

main().catch((error) => {
  console.error("Failed to start Browser MCP server:", error);
  process.exit(1);
});
