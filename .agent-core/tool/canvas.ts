/**
 * Canvas Tools - WezTerm-native canvas rendering
 *
 * Provides canvas display capabilities for all personas.
 * Canvas types: text, calendar, document, table, diagram, graph, mindmap
 */

import { tool } from "@opencode-ai/plugin"

// Canvas spawn tool
export const canvasSpawn = tool({
  description: `Spawn a canvas to display content in a WezTerm pane.

Canvas types:
- text: Simple text display with title and content
- calendar: Monthly calendar view with events
- document: Markdown-like document rendering
- table: Tabular data display
- diagram: Flowchart/architecture diagrams
- graph: Nodes and edges visualization
- mindmap: Hierarchical tree view

Config options by kind:
- text: { title: string, content: string }
- calendar: { date?: "YYYY-MM-DD", events?: [{ date: string, title: string }] }
- document: { title: string, content: string (markdown) }
- table: { title: string, headers: string[], rows: string[][] }

Examples:
- Display poem: { kind: "text", id: "poem", config: '{"title": "My Poem", "content": "Roses are red..."}' }
- Show calendar: { kind: "calendar", id: "cal", config: '{"date": "2026-01-15", "events": []}' }
- Show table: { kind: "table", id: "data", config: '{"title": "Portfolio", "headers": ["Symbol", "Value"], "rows": [["AAPL", "$100"]]}' }`,
  args: {
    kind: tool.schema
      .enum(["text", "calendar", "document", "table", "diagram", "graph", "mindmap"])
      .describe("Canvas type"),
    id: tool.schema.string().describe("Unique canvas identifier"),
    config: tool.schema.string().describe("JSON configuration for the canvas content"),
  },
  async execute(args) {
    const { requestDaemon } = await import("../../../src/daemon/ipc-client.js")

    let config: Record<string, unknown>
    try {
      config = JSON.parse(args.config)
    } catch {
      return `Invalid JSON config: ${args.config}`
    }

    try {
      const result = await requestDaemon<{ paneId: string; id: string; kind: string }>(
        "canvas:spawn",
        { kind: args.kind, id: args.id, config }
      )
      return `Canvas "${args.id}" (${args.kind}) displayed in pane ${result.paneId}.

Content:
${JSON.stringify(config, null, 2)}`
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return `Failed to spawn canvas: ${msg}

Note: Canvas requires the agent-core daemon to be running.
Start it with: agent-core daemon`
    }
  },
})

// Canvas update tool
export const canvasUpdate = tool({
  description: `Update an existing canvas's content.

Examples:
- Update text: { id: "poem", config: '{"content": "New poem content"}' }
- Update calendar: { id: "cal", config: '{"events": [{"date": "2026-01-20", "title": "Meeting"}]}' }`,
  args: {
    id: tool.schema.string().describe("Canvas identifier to update"),
    config: tool.schema.string().describe("New JSON configuration"),
  },
  async execute(args) {
    const { requestDaemon } = await import("../../../src/daemon/ipc-client.js")

    let config: Record<string, unknown>
    try {
      config = JSON.parse(args.config)
    } catch {
      return `Invalid JSON config: ${args.config}`
    }

    try {
      await requestDaemon("canvas:update", { id: args.id, config })
      return `Canvas "${args.id}" updated.

New content:
${JSON.stringify(config, null, 2)}`
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return `Failed to update canvas: ${msg}`
    }
  },
})

// Canvas close tool
export const canvasClose = tool({
  description: `Close a canvas pane.`,
  args: {
    id: tool.schema.string().describe("Canvas identifier to close"),
  },
  async execute(args) {
    const { requestDaemon } = await import("../../../src/daemon/ipc-client.js")

    try {
      await requestDaemon("canvas:close", { id: args.id })
      return `Canvas "${args.id}" closed.`
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return `Failed to close canvas: ${msg}`
    }
  },
})

// Canvas list tool
export const canvasList = tool({
  description: `List all active canvases.`,
  args: {},
  async execute() {
    const { requestDaemon } = await import("../../../src/daemon/ipc-client.js")

    try {
      const canvases = await requestDaemon<
        Array<{
          id: string
          kind: string
          paneId: string
          createdAt: number
        }>
      >("canvas:list", {})

      if (canvases.length === 0) {
        return "No active canvases."
      }

      const list = canvases.map((c) => `- ${c.id} (${c.kind}) in pane ${c.paneId}`).join("\n")

      return `${canvases.length} active canvas(es):
${list}`
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return `Failed to list canvases: ${msg}`
    }
  },
})
