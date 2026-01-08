import { z } from "zod";
import type { ToolDefinition, ToolExecutionResult } from "../../mcp/types";
import { requestDaemon } from "../../daemon/ipc-client";

const ShowCanvasParams = z.object({
  kind: z.enum(["text", "calendar", "document", "table"])
    .describe("Canvas kind/type"),
  id: z.string().describe("Unique canvas identifier"),
  scenario: z.enum(["display", "edit", "meeting-picker"]).optional()
    .describe("Display scenario (default: display)"),
});

export const showCanvasTool: ToolDefinition = {
  id: "shared:canvas-show",
  category: "domain",
  init: async () => ({
    description: `Display a canvas in a WezTerm pane.
    Canvas types:
    - text: Simple text display with title and content
    - calendar: Monthly calendar view with events
    - document: Markdown-like document rendering
    - table: Tabular data display

    Scenarios:
    - display: Read-only (default)
    - edit: Editable interface
    - meeting-picker: Meeting selection

    Canvas automatically spawns in a 67% width pane (Claude:Canvas = 1:2 ratio).
    Existing canvas panes are reused to avoid clutter.

    Examples:
    - Show text canvas: { kind: "text", id: "notes" }
    - Show calendar: { kind: "calendar", id: "cal-1" }`,
    parameters: ShowCanvasParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { kind, id } = args;

      ctx.metadata({ title: `Showing ${kind} canvas` });

      try {
        await requestDaemon("canvas:show", { id });
        return {
          title: `Canvas: ${kind}`,
          metadata: { kind, id },
          output: `Canvas "${id}" is now visible in the canvas pane.`,
        };
      } catch (error) {
        // Canvas might not exist, try spawning it
        try {
          const result = await requestDaemon<{ paneId: string; id: string }>(
            "canvas:spawn",
            { kind, id, config: {} }
          );
          return {
            title: `Canvas: ${kind}`,
            metadata: { kind, id, paneId: result.paneId },
            output: `Canvas "${id}" spawned in pane ${result.paneId}.`,
          };
        } catch (spawnError) {
          return {
            title: `Canvas Error`,
            metadata: { kind, id },
            output: `Failed to show canvas: ${spawnError instanceof Error ? spawnError.message : String(spawnError)}

Note: Canvas requires the agent-core daemon to be running.
Start it with: bun run src/daemon/index.ts`,
          };
        }
      }
    },
  }),
};

const SpawnCanvasParams = z.object({
  kind: z.enum(["text", "calendar", "document", "table"])
    .describe("Canvas kind/type"),
  id: z.string().describe("Unique canvas identifier"),
  config: z.string()
    .describe("JSON configuration for the canvas"),
});

export const spawnCanvasTool: ToolDefinition = {
  id: "shared:canvas-spawn",
  category: "domain",
  init: async () => ({
    description: `Spawn a new canvas with initial configuration.
    Similar to show, but accepts a config JSON to initialize content.

    Config options by kind:
    - text: { title: string, content: string, width?: number }
    - calendar: { date?: string (YYYY-MM-DD), events?: [{ date: string, title: string }] }
    - document: { title: string, content: string (markdown), width?: number }
    - table: { title: string, headers: string[], rows: string[][], columnWidths?: number[] }

    Examples:
    - Spawn text: { kind: "text", id: "notes", config: '{"title": "Notes", "content": "Hello!"}' }
    - Spawn calendar: { kind: "calendar", id: "cal-1", config: '{"date": "2024-01-15"}' }
    - Spawn table: { kind: "table", id: "data", config: '{"headers": ["Name", "Value"], "rows": [["A", "1"]]}' }`,
    parameters: SpawnCanvasParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { kind, id, config: configStr } = args;

      ctx.metadata({ title: `Spawning ${kind} canvas` });

      let config: Record<string, unknown>;
      try {
        config = JSON.parse(configStr);
      } catch {
        return {
          title: `Canvas Error`,
          metadata: { kind, id },
          output: `Invalid JSON config: ${configStr}`,
        };
      }

      try {
        const result = await requestDaemon<{ paneId: string; id: string; kind: string }>(
          "canvas:spawn",
          { kind, id, config }
        );
        return {
          title: `Canvas: ${kind}`,
          metadata: { kind, id, paneId: result.paneId },
          output: `Canvas "${id}" (${kind}) spawned in pane ${result.paneId}.

Config applied:
${JSON.stringify(config, null, 2)}`,
        };
      } catch (error) {
        return {
          title: `Canvas Error`,
          metadata: { kind, id },
          output: `Failed to spawn canvas: ${error instanceof Error ? error.message : String(error)}

Note: Canvas requires the agent-core daemon to be running.
Start it with: bun run src/daemon/index.ts`,
        };
      }
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
    Send new config to the canvas to update its display.

    Examples:
    - Update text: { id: "notes", config: '{"content": "Updated notes"}' }
    - Update calendar date: { id: "cal-1", config: '{"date": "2024-01-20"}' }
    - Add calendar event: { id: "cal-1", config: '{"events": [{"date": "2024-01-20", "title": "Meeting"}]}' }`,
    parameters: UpdateCanvasParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { id, config: configStr } = args;

      ctx.metadata({ title: `Updating canvas ${id}` });

      let config: Record<string, unknown>;
      try {
        config = JSON.parse(configStr);
      } catch {
        return {
          title: `Canvas Error`,
          metadata: { id },
          output: `Invalid JSON config: ${configStr}`,
        };
      }

      try {
        await requestDaemon("canvas:update", { id, config });
        return {
          title: `Canvas Updated: ${id}`,
          metadata: { id },
          output: `Canvas "${id}" updated with new configuration.

New config:
${JSON.stringify(config, null, 2)}`,
        };
      } catch (error) {
        return {
          title: `Canvas Error`,
          metadata: { id },
          output: `Failed to update canvas: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  }),
};

const CloseCanvasParams = z.object({
  id: z.string().describe("Canvas identifier to close"),
});

export const closeCanvasTool: ToolDefinition = {
  id: "shared:canvas-close",
  category: "domain",
  init: async () => ({
    description: `Close a canvas and optionally its pane.
    Use this to clean up canvases that are no longer needed.`,
    parameters: CloseCanvasParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { id } = args;

      ctx.metadata({ title: `Closing canvas ${id}` });

      try {
        await requestDaemon("canvas:close", { id });
        return {
          title: `Canvas Closed: ${id}`,
          metadata: { id },
          output: `Canvas "${id}" has been closed.`,
        };
      } catch (error) {
        return {
          title: `Canvas Error`,
          metadata: { id },
          output: `Failed to close canvas: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
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

      try {
        const result = await requestDaemon<{ selection: string | null }>(
          "canvas:selection",
          { id }
        );
        return {
          title: `Canvas Selection: ${id}`,
          metadata: { id, selection: result.selection },
          output: result.selection
            ? `User selection: ${result.selection}`
            : `No selection made in canvas "${id}".`,
        };
      } catch (error) {
        return {
          title: `Canvas Error`,
          metadata: { id },
          output: `Failed to get selection: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  }),
};

const ListCanvasParams = z.object({});

export const listCanvasTool: ToolDefinition = {
  id: "shared:canvas-list",
  category: "domain",
  init: async () => ({
    description: `List all active canvases.
    Shows what canvases are currently open and their configuration.`,
    parameters: ListCanvasParams,
    execute: async (_args, ctx): Promise<ToolExecutionResult> => {
      ctx.metadata({ title: `Listing canvases` });

      try {
        const canvases = await requestDaemon<Array<{
          id: string;
          kind: string;
          paneId: string;
          createdAt: number;
        }>>("canvas:list", {});

        if (canvases.length === 0) {
          return {
            title: `Active Canvases`,
            metadata: { count: 0 },
            output: `No active canvases.`,
          };
        }

        const list = canvases
          .map((c) => `- ${c.id} (${c.kind}) in pane ${c.paneId}`)
          .join("\n");

        return {
          title: `Active Canvases`,
          metadata: { count: canvases.length },
          output: `${canvases.length} active canvas(es):\n${list}`,
        };
      } catch (error) {
        return {
          title: `Canvas Error`,
          metadata: {},
          output: `Failed to list canvases: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  }),
};

export const CANVAS_TOOLS = [
  showCanvasTool,
  spawnCanvasTool,
  updateCanvasTool,
  closeCanvasTool,
  selectionCanvasTool,
  listCanvasTool,
];
