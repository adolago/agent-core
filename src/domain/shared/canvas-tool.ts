import { z } from "zod";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import type { ToolDefinition, ToolRuntime, ToolExecutionContext, ToolExecutionResult } from "../../mcp/types";

function resolveCanvasCli(): { cliPath: string } {
  const vendorCanvas = join(process.env.AGENT_CORE_REPOS || join(homedir(), "Repositories"), "agent-core", "vendor", "canvas");
  const cliPath = join(vendorCanvas, "canvas", "src", "cli.ts");

  if (!existsSync(cliPath)) {
    return { cliPath: "npx tsx canvas/src/cli.ts" };
  }

  return { cliPath: `npx tsx ${cliPath}` };
}

const ShowCanvasParams = z.object({
  kind: z.enum(["text", "calendar", "document", "flight"])
    .describe("Canvas kind/type"),
  id: z.string().describe("Unique canvas identifier"),
  scenario: z.enum(["display", "edit", "meeting-picker"]).optional()
    .describe("Display scenario (default: display)"),
  socket: z.string().optional()
    .describe("IPC socket path (auto-generated if not provided)"),
});

export const showCanvasTool: ToolDefinition = {
  id: "shared:canvas-show",
  category: "domain",
  init: async () => ({
    description: `Display a canvas in a WezTerm pane.
    Canvas types:
    - text: Simple text display
    - calendar: Calendar views
    - document: Document rendering
    - flight: Flight information

    Scenarios:
    - display: Read-only (default)
    - edit: Editable interface
    - meeting-picker: Meeting selection

    Canvas automatically spawns in a 67% width pane (Claude:Canvas = 1:2 ratio).
    Existing canvas panes are reused to avoid clutter.

    Examples:
    - Show text canvas: { kind: "text", id: "notes", scenario: "edit" }
    - Show calendar: { kind: "calendar", id: "cal-1", scenario: "display" }`,
    parameters: ShowCanvasParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { kind, id, scenario, socket } = args;

      ctx.metadata({ title: `Showing ${kind} canvas` });

      const { cliPath } = resolveCanvasCli();
      const socketPath = socket || `/tmp/canvas-${id}.sock`;

      const command = `${cliPath} show ${kind} --id ${id} --socket ${socketPath}${scenario ? ` --scenario ${scenario}` : ""}`;

      return {
        title: `Canvas: ${kind}`,
        metadata: { kind, id, scenario, socket: socketPath },
        output: `[Canvas spawns in WezTerm pane]

Command: ${command}

Canvas will:
- Spawn in right pane (67% width)
- Connect to IPC socket: ${socketPath}
- Run scenario: ${scenario || "display"}
- Reuse existing canvas pane if available

The canvas will remain running until you close the pane or spawn a new canvas.`,
      };
    },
  }),
};

const SpawnCanvasParams = z.object({
  kind: z.enum(["text", "calendar", "document", "flight"])
    .describe("Canvas kind/type"),
  id: z.string().describe("Unique canvas identifier"),
  config: z.string()
    .describe("JSON configuration for the canvas"),
  scenario: z.enum(["display", "edit", "meeting-picker"]).optional()
    .describe("Display scenario (default: display)"),
  socket: z.string().optional()
    .describe("IPC socket path (auto-generated if not provided)"),
});

export const spawnCanvasTool: ToolDefinition = {
  id: "shared:canvas-spawn",
  category: "domain",
  init: async () => ({
    description: `Spawn a new canvas with initial configuration.
    Similar to show, but accepts a config JSON to initialize content.

    Examples:
    - Spawn text with content: { kind: "text", id: "notes", config: '{"title": "Notes", "content": "..."}' }
    - Spawn calendar with date: { kind: "calendar", id: "cal-1", config: '{"date": "2024-01-15"}' }`,
    parameters: SpawnCanvasParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { kind, id, config, scenario, socket } = args;

      ctx.metadata({ title: `Spawning ${kind} canvas` });

      const { cliPath } = resolveCanvasCli();
      const socketPath = socket || `/tmp/canvas-${id}.sock`;

      const command = `${cliPath} spawn ${kind} ${id} --config '${config}' --socket ${socketPath}${scenario ? ` --scenario ${scenario}` : ""}`;

      return {
        title: `Canvas: ${kind}`,
        metadata: { kind, id, scenario, socket: socketPath },
        output: `[Canvas spawns with config]

Command: ${command}

Config: ${config}

Canvas will initialize with the provided configuration and connect to IPC socket.`,
      };
    },
  }),
};

const UpdateCanvasParams = z.object({
  id: z.string().describe("Canvas identifier to update"),
  config: z.string().describe("New JSON configuration"),
});

export const updateCanvasTool: ToolDefinition = {
  id: "shared:canvas-update",
  category: "domain",
  init: async () => ({
    description: `Update an existing canvas's configuration.
    Send new config to the canvas via IPC socket.

    Examples:
    - Update text: { id: "notes", config: '{"content": "Updated notes"}' }
    - Update calendar: { id: "cal-1", config: '{"date": "2024-01-20"}' }`,
    parameters: UpdateCanvasParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { id, config } = args;

      ctx.metadata({ title: `Updating canvas ${id}` });

      const { cliPath } = resolveCanvasCli();
      const socketPath = `/tmp/canvas-${id}.sock`;
      const command = `${cliPath} update ${id} --config '${config}' --socket ${socketPath}`;

      return {
        title: `Update Canvas: ${id}`,
        metadata: { id, socket: socketPath },
        output: `[Canvas receives config update]

Command: ${command}

The canvas at ${socketPath} will receive the new configuration and update its display.`,
      };
    },
  }),
};

const SelectionCanvasParams = z.object({
  id: z.string().describe("Canvas identifier"),
});

export const selectionCanvasTool: ToolDefinition = {
  id: "shared:canvas-selection",
  category: "domain",
  init: async () => ({
    description: `Get user selection from an interactive canvas.
    Used with scenarios like meeting-picker to retrieve user choice.

    Examples:
    - Get meeting selection: { id: "cal-1" }`,
    parameters: SelectionCanvasParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { id } = args;

      ctx.metadata({ title: `Getting selection from ${id}` });

      const { cliPath } = resolveCanvasCli();
      const socketPath = `/tmp/canvas-${id}.sock`;
      const command = `${cliPath} selection ${id} --socket ${socketPath}`;

      return {
        title: `Canvas Selection: ${id}`,
        metadata: { id, socket: socketPath },
        output: `[Retrieving user selection from canvas]

Command: ${command}

The canvas will return the user's selection (e.g., selected meeting time, chosen option) via IPC.`,
      };
    },
  }),
};

export const CANVAS_TOOLS = [
  showCanvasTool,
  spawnCanvasTool,
  updateCanvasTool,
  selectionCanvasTool,
];
