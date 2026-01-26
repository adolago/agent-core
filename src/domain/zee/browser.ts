/**
 * Zee Browser Automation Tools
 *
 * Provides browser control via the Zee gateway browser server.
 * The gateway must be running at the configured control URL (default: http://127.0.0.1:18791).
 *
 * These tools enable:
 * - Page navigation and snapshot
 * - Element interactions (click, type, fill)
 * - Screenshot capture
 * - Wait conditions
 */

import { z } from "zod";
import type { ToolDefinition, ToolExecutionResult } from "../../mcp/types";
import { Log } from "../../../packages/agent-core/src/util/log";
import { getZeeBrowserConfig, type ZeeBrowserConfig } from "../../config/runtime";

const log = Log.create({ service: "zee-browser-tools" });

// Default browser control URL - matches Zee gateway default
const DEFAULT_BROWSER_CONTROL_URL = "http://127.0.0.1:18791";

// =============================================================================
// Config Resolution
// =============================================================================

export type BrowserConfigResolved = {
  enabled: boolean;
  controlUrl: string;
  profile?: string;
  error?: string;
};

export function resolveBrowserConfig(): BrowserConfigResolved {
  const config: ZeeBrowserConfig = getZeeBrowserConfig();
  const enabled = config.enabled !== false; // Default to enabled

  const controlUrl = (
    config.controlUrl ||
    process.env.ZEE_BROWSER_CONTROL_URL ||
    DEFAULT_BROWSER_CONTROL_URL
  ).replace(/\/+$/, "");

  const profile = config.profile || process.env.ZEE_BROWSER_PROFILE;

  return {
    enabled,
    controlUrl,
    profile,
  };
}

// =============================================================================
// HTTP Client Helpers
// =============================================================================

interface BrowserFetchOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
}

async function fetchBrowser<T>(
  baseUrl: string,
  path: string,
  options: BrowserFetchOptions = {}
): Promise<T> {
  const { method = "GET", body, timeoutMs = 20000 } = options;

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

function buildProfileQuery(profile?: string): string {
  return profile ? `?profile=${encodeURIComponent(profile)}` : "";
}

// =============================================================================
// Browser Status Tool
// =============================================================================

const BrowserStatusParams = z.object({
  profile: z.string().optional().describe("Browser profile name (default: 'zee' or 'chrome')"),
});

export const browserStatusTool: ToolDefinition = {
  id: "zee:browser-status",
  category: "domain",
  init: async () => ({
    description: `Check browser status and connection.

Returns:
- Whether browser is running
- CDP connection status
- Profile information
- Control URL

Use this to verify browser is ready before other operations.`,
    parameters: BrowserStatusParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { profile } = args;
      ctx.metadata({ title: "Browser Status" });

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
        const q = buildProfileQuery(profile || config.profile);
        const status = await fetchBrowser<{
          enabled: boolean;
          running: boolean;
          cdpReady?: boolean;
          pid: number | null;
          cdpPort: number;
          cdpUrl?: string;
          profile?: string;
          chosenBrowser: string | null;
          headless: boolean;
          attachOnly: boolean;
        }>(config.controlUrl, `/${q}`, { timeoutMs: 3000 });

        return {
          title: "Browser Status",
          metadata: {
            running: status.running,
            cdpReady: status.cdpReady,
            profile: status.profile,
          },
          output: `Browser Status:
- Running: ${status.running ? "Yes" : "No"}
- CDP Ready: ${status.cdpReady ? "Yes" : "No"}
- Profile: ${status.profile || "default"}
- Headless: ${status.headless ? "Yes" : "No"}
- Browser: ${status.chosenBrowser || "Not detected"}
- PID: ${status.pid || "N/A"}
- CDP Port: ${status.cdpPort}
- Control URL: ${config.controlUrl}`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("fetch failed")) {
          return {
            title: "Browser Server Not Running",
            metadata: { error: "connection_failed" },
            output: `Cannot connect to browser server at ${config.controlUrl}.

To enable browser automation:
1. Start the agent-core daemon with browser support:
   agent-core daemon

2. Or configure browser.controlUrl in agent-core.jsonc

Error: ${errorMsg}`,
          };
        }

        return {
          title: "Browser Status Error",
          metadata: { error: errorMsg },
          output: `Failed to get browser status: ${errorMsg}`,
        };
      }
    },
  }),
};

// =============================================================================
// Browser Snapshot Tool
// =============================================================================

const BrowserSnapshotParams = z.object({
  format: z.enum(["ai", "aria"]).default("ai")
    .describe("Snapshot format: 'ai' for AI-friendly text with refs, 'aria' for raw accessibility tree"),
  selector: z.string().optional()
    .describe("CSS selector to scope the snapshot"),
  maxChars: z.number().optional()
    .describe("Maximum characters in snapshot (default: 80000)"),
  interactive: z.boolean().optional()
    .describe("Only include interactive elements"),
  labels: z.boolean().optional()
    .describe("Include screenshot with element labels overlay"),
  profile: z.string().optional()
    .describe("Browser profile name"),
});

export const browserSnapshotTool: ToolDefinition = {
  id: "zee:browser-snapshot",
  category: "domain",
  init: async () => ({
    description: `Get page snapshot with element references for interaction.

Returns an accessibility tree with refs (e.g., "button[3]", "textbox[0]") that can be used
with click, type, and other interaction tools.

Example:
- { format: "ai" } - Get AI-friendly snapshot with element refs
- { format: "ai", interactive: true } - Only interactive elements
- { format: "ai", labels: true } - Include labeled screenshot

The refs in the response are ephemeral - take a new snapshot after navigation.`,
    parameters: BrowserSnapshotParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { format, selector, maxChars, interactive, labels, profile } = args;
      ctx.metadata({ title: "Page Snapshot" });

      const config = resolveBrowserConfig();
      if (!config.enabled) {
        return {
          title: "Browser Disabled",
          metadata: { enabled: false },
          output: "Browser automation is disabled. Enable it in agent-core.jsonc.",
        };
      }

      try {
        const params = new URLSearchParams();
        params.set("format", format);
        if (selector) params.set("selector", selector);
        if (maxChars !== undefined) params.set("maxChars", String(maxChars));
        if (interactive !== undefined) params.set("interactive", String(interactive));
        if (labels) params.set("labels", "1");
        if (profile || config.profile) {
          params.set("profile", profile || config.profile || "");
        }

        const result = await fetchBrowser<{
          ok: boolean;
          format: "ai" | "aria";
          targetId: string;
          url: string;
          snapshot?: string;
          nodes?: Array<{ ref: string; role: string; name: string; depth: number }>;
          refs?: Record<string, { role: string; name?: string; nth?: number }>;
          stats?: { lines: number; chars: number; refs: number; interactive: number };
          truncated?: boolean;
          imagePath?: string;
        }>(config.controlUrl, `/snapshot?${params.toString()}`, { timeoutMs: 30000 });

        if (format === "aria" && result.nodes) {
          const nodeList = result.nodes.map(n =>
            `${"  ".repeat(n.depth)}[${n.ref}] ${n.role}: ${n.name}`
          ).join("\n");

          return {
            title: "ARIA Snapshot",
            metadata: {
              url: result.url,
              nodeCount: result.nodes.length,
            },
            output: `Page: ${result.url}

ARIA Tree (${result.nodes.length} nodes):
${nodeList}`,
          };
        }

        // AI format
        const stats = result.stats;
        const statsInfo = stats
          ? `\nStats: ${stats.refs} refs, ${stats.interactive} interactive, ${stats.chars} chars`
          : "";

        return {
          title: "Page Snapshot",
          metadata: {
            url: result.url,
            truncated: result.truncated,
            stats,
            imagePath: result.imagePath,
          },
          output: `Page: ${result.url}${statsInfo}${result.truncated ? "\n(Truncated - use maxChars to increase)" : ""}

${result.snapshot || "No snapshot available"}${result.imagePath ? `\n\nLabeled screenshot: ${result.imagePath}` : ""}`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          title: "Snapshot Error",
          metadata: { error: errorMsg },
          output: `Failed to get page snapshot: ${errorMsg}`,
        };
      }
    },
  }),
};

// =============================================================================
// Browser Navigate Tool
// =============================================================================

const BrowserNavigateParams = z.object({
  url: z.string().describe("URL to navigate to"),
  profile: z.string().optional().describe("Browser profile name"),
});

export const browserNavigateTool: ToolDefinition = {
  id: "zee:browser-navigate",
  category: "domain",
  init: async () => ({
    description: `Navigate to a URL in the browser.

Examples:
- { url: "https://google.com" }
- { url: "https://example.com/login", profile: "chrome" }

After navigation, use zee:browser-snapshot to get element refs for interaction.`,
    parameters: BrowserNavigateParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { url, profile } = args;
      ctx.metadata({ title: `Navigate: ${url}` });

      const config = resolveBrowserConfig();
      if (!config.enabled) {
        return {
          title: "Browser Disabled",
          metadata: { enabled: false },
          output: "Browser automation is disabled.",
        };
      }

      try {
        const q = buildProfileQuery(profile || config.profile);
        const result = await fetchBrowser<{
          ok: boolean;
          targetId: string;
          url: string;
        }>(config.controlUrl, `/navigate${q}`, {
          method: "POST",
          body: { url },
          timeoutMs: 30000,
        });

        return {
          title: "Navigation Complete",
          metadata: {
            url: result.url,
            targetId: result.targetId,
          },
          output: `Navigated to: ${result.url}

Use zee:browser-snapshot to get page content and element refs.`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          title: "Navigation Error",
          metadata: { error: errorMsg },
          output: `Failed to navigate to ${url}: ${errorMsg}`,
        };
      }
    },
  }),
};

// =============================================================================
// Browser Click Tool
// =============================================================================

const BrowserClickParams = z.object({
  ref: z.string().describe("Element reference from snapshot (e.g., 'button[3]', 'link[0]')"),
  doubleClick: z.boolean().optional().describe("Double-click instead of single click"),
  button: z.enum(["left", "right", "middle"]).optional().describe("Mouse button"),
  modifiers: z.array(z.enum(["Alt", "Control", "Meta", "Shift"])).optional()
    .describe("Modifier keys to hold"),
  profile: z.string().optional().describe("Browser profile name"),
});

export const browserClickTool: ToolDefinition = {
  id: "zee:browser-click",
  category: "domain",
  init: async () => ({
    description: `Click an element by reference.

The ref comes from a zee:browser-snapshot response (e.g., "button[3]", "link[0]").

Examples:
- { ref: "button[0]" } - Click first button
- { ref: "link[2]", doubleClick: true } - Double-click third link
- { ref: "textbox[0]", modifiers: ["Control"] } - Ctrl+click`,
    parameters: BrowserClickParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { ref, doubleClick, button, modifiers, profile } = args;
      ctx.metadata({ title: `Click: ${ref}` });

      const config = resolveBrowserConfig();
      if (!config.enabled) {
        return {
          title: "Browser Disabled",
          metadata: { enabled: false },
          output: "Browser automation is disabled.",
        };
      }

      try {
        const q = buildProfileQuery(profile || config.profile);
        const result = await fetchBrowser<{
          ok: boolean;
          targetId: string;
          url?: string;
        }>(config.controlUrl, `/act${q}`, {
          method: "POST",
          body: {
            kind: "click",
            ref,
            doubleClick,
            button,
            modifiers,
          },
          timeoutMs: 15000,
        });

        return {
          title: "Click Complete",
          metadata: {
            ref,
            doubleClick,
            url: result.url,
          },
          output: `Clicked element: ${ref}${doubleClick ? " (double-click)" : ""}${result.url ? `\nCurrent URL: ${result.url}` : ""}

Take a new snapshot to see the updated page state.`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          title: "Click Error",
          metadata: { error: errorMsg },
          output: `Failed to click ${ref}: ${errorMsg}

Possible causes:
- Element ref is stale (take a new snapshot)
- Element is not clickable
- Element is covered by another element`,
        };
      }
    },
  }),
};

// =============================================================================
// Browser Type Tool
// =============================================================================

const BrowserTypeParams = z.object({
  ref: z.string().describe("Element reference from snapshot (e.g., 'textbox[0]')"),
  text: z.string().describe("Text to type"),
  submit: z.boolean().optional().describe("Press Enter after typing"),
  slowly: z.boolean().optional().describe("Type with delays (for sites that detect fast typing)"),
  profile: z.string().optional().describe("Browser profile name"),
});

export const browserTypeTool: ToolDefinition = {
  id: "zee:browser-type",
  category: "domain",
  init: async () => ({
    description: `Type text into an input element.

The ref comes from a zee:browser-snapshot response.

Examples:
- { ref: "textbox[0]", text: "hello world" }
- { ref: "textbox[0]", text: "search query", submit: true } - Type and press Enter
- { ref: "textbox[0]", text: "password", slowly: true } - Type slowly for detection evasion`,
    parameters: BrowserTypeParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { ref, text, submit, slowly, profile } = args;
      ctx.metadata({ title: `Type: ${ref}` });

      const config = resolveBrowserConfig();
      if (!config.enabled) {
        return {
          title: "Browser Disabled",
          metadata: { enabled: false },
          output: "Browser automation is disabled.",
        };
      }

      try {
        const q = buildProfileQuery(profile || config.profile);
        const result = await fetchBrowser<{
          ok: boolean;
          targetId: string;
          url?: string;
        }>(config.controlUrl, `/act${q}`, {
          method: "POST",
          body: {
            kind: "type",
            ref,
            text,
            submit,
            slowly,
          },
          timeoutMs: 30000,
        });

        return {
          title: "Type Complete",
          metadata: {
            ref,
            textLength: text.length,
            submit,
          },
          output: `Typed ${text.length} characters into ${ref}${submit ? " and pressed Enter" : ""}${result.url ? `\nCurrent URL: ${result.url}` : ""}`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          title: "Type Error",
          metadata: { error: errorMsg },
          output: `Failed to type into ${ref}: ${errorMsg}`,
        };
      }
    },
  }),
};

// =============================================================================
// Browser Fill Form Tool
// =============================================================================

const BrowserFillFormParams = z.object({
  fields: z.array(z.object({
    ref: z.string().describe("Element reference"),
    type: z.enum(["text", "checkbox", "radio", "select"]).describe("Field type"),
    value: z.union([z.string(), z.number(), z.boolean()]).describe("Value to set"),
  })).describe("Fields to fill"),
  profile: z.string().optional().describe("Browser profile name"),
});

export const browserFillFormTool: ToolDefinition = {
  id: "zee:browser-fill-form",
  category: "domain",
  init: async () => ({
    description: `Fill multiple form fields at once.

Examples:
- { fields: [
    { ref: "textbox[0]", type: "text", value: "john@example.com" },
    { ref: "textbox[1]", type: "text", value: "password123" },
    { ref: "checkbox[0]", type: "checkbox", value: true }
  ] }`,
    parameters: BrowserFillFormParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { fields, profile } = args;
      ctx.metadata({ title: `Fill Form: ${fields.length} fields` });

      const config = resolveBrowserConfig();
      if (!config.enabled) {
        return {
          title: "Browser Disabled",
          metadata: { enabled: false },
          output: "Browser automation is disabled.",
        };
      }

      try {
        const q = buildProfileQuery(profile || config.profile);
        const result = await fetchBrowser<{
          ok: boolean;
          targetId: string;
        }>(config.controlUrl, `/act${q}`, {
          method: "POST",
          body: {
            kind: "fill",
            fields,
          },
          timeoutMs: 30000,
        });

        const fieldSummary = fields.map(f => `  - ${f.ref}: ${f.type}`).join("\n");

        return {
          title: "Form Filled",
          metadata: {
            fieldCount: fields.length,
          },
          output: `Filled ${fields.length} form field(s):
${fieldSummary}`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          title: "Fill Form Error",
          metadata: { error: errorMsg },
          output: `Failed to fill form: ${errorMsg}`,
        };
      }
    },
  }),
};

// =============================================================================
// Browser Screenshot Tool
// =============================================================================

const BrowserScreenshotParams = z.object({
  fullPage: z.boolean().optional().describe("Capture full page (scrollable area)"),
  ref: z.string().optional().describe("Element reference to screenshot (instead of full page)"),
  type: z.enum(["png", "jpeg"]).optional().describe("Image format (default: png)"),
  profile: z.string().optional().describe("Browser profile name"),
});

export const browserScreenshotTool: ToolDefinition = {
  id: "zee:browser-screenshot",
  category: "domain",
  init: async () => ({
    description: `Take a screenshot of the browser page.

Examples:
- {} - Screenshot visible viewport
- { fullPage: true } - Screenshot entire scrollable page
- { ref: "img[0]" } - Screenshot specific element`,
    parameters: BrowserScreenshotParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { fullPage, ref, type, profile } = args;
      ctx.metadata({ title: "Screenshot" });

      const config = resolveBrowserConfig();
      if (!config.enabled) {
        return {
          title: "Browser Disabled",
          metadata: { enabled: false },
          output: "Browser automation is disabled.",
        };
      }

      try {
        const q = buildProfileQuery(profile || config.profile);
        const result = await fetchBrowser<{
          ok: boolean;
          targetId: string;
          path: string;
          contentType: string;
        }>(config.controlUrl, `/screenshot${q}`, {
          method: "POST",
          body: {
            fullPage,
            ref,
            type: type || "png",
          },
          timeoutMs: 30000,
        });

        return {
          title: "Screenshot Captured",
          metadata: {
            path: result.path,
            fullPage,
            contentType: result.contentType,
          },
          output: `Screenshot saved to: ${result.path}${fullPage ? "\n(Full page capture)" : ""}`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          title: "Screenshot Error",
          metadata: { error: errorMsg },
          output: `Failed to take screenshot: ${errorMsg}`,
        };
      }
    },
  }),
};

// =============================================================================
// Browser Wait Tool
// =============================================================================

const BrowserWaitParams = z.object({
  timeMs: z.number().optional().describe("Wait for milliseconds"),
  text: z.string().optional().describe("Wait for text to appear on page"),
  textGone: z.string().optional().describe("Wait for text to disappear"),
  selector: z.string().optional().describe("Wait for CSS selector to be visible"),
  url: z.string().optional().describe("Wait for URL to match pattern"),
  loadState: z.enum(["load", "domcontentloaded", "networkidle"]).optional()
    .describe("Wait for page load state"),
  timeoutMs: z.number().optional().describe("Timeout in milliseconds (default: 20000)"),
  profile: z.string().optional().describe("Browser profile name"),
});

export const browserWaitTool: ToolDefinition = {
  id: "zee:browser-wait",
  category: "domain",
  init: async () => ({
    description: `Wait for conditions before proceeding.

Examples:
- { timeMs: 2000 } - Wait 2 seconds
- { text: "Login successful" } - Wait for text to appear
- { textGone: "Loading..." } - Wait for loading text to disappear
- { selector: ".results" } - Wait for element to be visible
- { url: "**/dashboard" } - Wait for URL to match
- { loadState: "networkidle" } - Wait for network to be idle`,
    parameters: BrowserWaitParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { timeMs, text, textGone, selector, url, loadState, timeoutMs, profile } = args;

      const conditions: string[] = [];
      if (timeMs) conditions.push(`${timeMs}ms delay`);
      if (text) conditions.push(`text: "${text}"`);
      if (textGone) conditions.push(`text gone: "${textGone}"`);
      if (selector) conditions.push(`selector: ${selector}`);
      if (url) conditions.push(`url: ${url}`);
      if (loadState) conditions.push(`loadState: ${loadState}`);

      ctx.metadata({ title: `Wait: ${conditions.join(", ")}` });

      const config = resolveBrowserConfig();
      if (!config.enabled) {
        return {
          title: "Browser Disabled",
          metadata: { enabled: false },
          output: "Browser automation is disabled.",
        };
      }

      try {
        const q = buildProfileQuery(profile || config.profile);
        await fetchBrowser<{
          ok: boolean;
          targetId: string;
        }>(config.controlUrl, `/act${q}`, {
          method: "POST",
          body: {
            kind: "wait",
            timeMs,
            text,
            textGone,
            selector,
            url,
            loadState,
            timeoutMs,
          },
          timeoutMs: (timeoutMs || 20000) + 5000, // Add buffer for network
        });

        return {
          title: "Wait Complete",
          metadata: { conditions },
          output: `Wait condition(s) satisfied:\n${conditions.map(c => `  - ${c}`).join("\n")}`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          title: "Wait Error",
          metadata: { error: errorMsg, conditions },
          output: `Wait condition(s) failed: ${errorMsg}

Conditions:
${conditions.map(c => `  - ${c}`).join("\n")}`,
        };
      }
    },
  }),
};

// =============================================================================
// Browser Tabs Tool
// =============================================================================

const BrowserTabsParams = z.object({
  action: z.enum(["list", "open", "close", "focus"])
    .describe("Tab action"),
  url: z.string().optional().describe("URL to open (for 'open' action)"),
  targetId: z.string().optional().describe("Tab target ID (for 'close' and 'focus' actions)"),
  profile: z.string().optional().describe("Browser profile name"),
});

export const browserTabsTool: ToolDefinition = {
  id: "zee:browser-tabs",
  category: "domain",
  init: async () => ({
    description: `Manage browser tabs.

Actions:
- list: Get all open tabs
- open: Open new tab with URL
- close: Close tab by targetId
- focus: Focus/activate tab by targetId

Examples:
- { action: "list" }
- { action: "open", url: "https://google.com" }
- { action: "close", targetId: "..." }`,
    parameters: BrowserTabsParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { action, url, targetId, profile } = args;
      ctx.metadata({ title: `Tabs: ${action}` });

      const config = resolveBrowserConfig();
      if (!config.enabled) {
        return {
          title: "Browser Disabled",
          metadata: { enabled: false },
          output: "Browser automation is disabled.",
        };
      }

      const q = buildProfileQuery(profile || config.profile);

      try {
        switch (action) {
          case "list": {
            const result = await fetchBrowser<{
              running: boolean;
              tabs: Array<{ targetId: string; title: string; url: string }>;
            }>(config.controlUrl, `/tabs${q}`, { timeoutMs: 5000 });

            if (!result.tabs?.length) {
              return {
                title: "No Tabs Open",
                metadata: { running: result.running },
                output: "No browser tabs are currently open.",
              };
            }

            const tabList = result.tabs.map((t, i) =>
              `${i + 1}. ${t.title || "(untitled)"}\n   URL: ${t.url}\n   ID: ${t.targetId}`
            ).join("\n\n");

            return {
              title: `${result.tabs.length} Tab(s) Open`,
              metadata: { tabCount: result.tabs.length },
              output: tabList,
            };
          }

          case "open": {
            if (!url) {
              return {
                title: "URL Required",
                metadata: { error: "missing_url" },
                output: "The 'open' action requires a URL parameter.",
              };
            }

            const result = await fetchBrowser<{
              targetId: string;
              title: string;
              url: string;
            }>(config.controlUrl, `/tabs/open${q}`, {
              method: "POST",
              body: { url },
              timeoutMs: 15000,
            });

            return {
              title: "Tab Opened",
              metadata: { targetId: result.targetId, url: result.url },
              output: `Opened new tab: ${result.url}\nTarget ID: ${result.targetId}`,
            };
          }

          case "close": {
            if (!targetId) {
              return {
                title: "Target ID Required",
                metadata: { error: "missing_targetId" },
                output: "The 'close' action requires a targetId parameter. Use 'list' to get tab IDs.",
              };
            }

            await fetchBrowser<void>(
              config.controlUrl,
              `/tabs/${encodeURIComponent(targetId)}${q}`,
              { method: "DELETE", timeoutMs: 5000 }
            );

            return {
              title: "Tab Closed",
              metadata: { targetId },
              output: `Closed tab: ${targetId}`,
            };
          }

          case "focus": {
            if (!targetId) {
              return {
                title: "Target ID Required",
                metadata: { error: "missing_targetId" },
                output: "The 'focus' action requires a targetId parameter. Use 'list' to get tab IDs.",
              };
            }

            await fetchBrowser<void>(config.controlUrl, `/tabs/focus${q}`, {
              method: "POST",
              body: { targetId },
              timeoutMs: 5000,
            });

            return {
              title: "Tab Focused",
              metadata: { targetId },
              output: `Focused tab: ${targetId}`,
            };
          }

          default:
            return {
              title: "Unknown Action",
              metadata: { error: "unknown_action" },
              output: `Unknown action: ${action}. Use: list, open, close, or focus.`,
            };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          title: "Tabs Error",
          metadata: { error: errorMsg, action },
          output: `Tab operation failed: ${errorMsg}`,
        };
      }
    },
  }),
};

// =============================================================================
// Exports
// =============================================================================

export const BROWSER_TOOLS = [
  browserStatusTool,
  browserSnapshotTool,
  browserNavigateTool,
  browserClickTool,
  browserTypeTool,
  browserFillFormTool,
  browserScreenshotTool,
  browserWaitTool,
  browserTabsTool,
];

export function registerBrowserTools(registry: { register: (tool: ToolDefinition, options: { source: string }) => void }): void {
  for (const tool of BROWSER_TOOLS) {
    registry.register(tool, { source: "domain" });
  }
}
