/**
 * Canvas Tools - WezTerm-native canvas rendering
 *
 * Provides canvas display capabilities for all personas.
 * Canvas types: text, calendar, document, table, diagram, graph, mindmap
 */

import { tool } from "@opencode-ai/plugin"
import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

type CanvasKind = "text" | "calendar" | "document" | "table" | "diagram" | "graph" | "mindmap"

type CanvasState = {
  version: 1
  canvases: Record<
    string,
    {
      paneId: string
      kind: CanvasKind
      createdAt: number
    }
  >
}

const DEFAULT_CANVAS_PERCENT = 67

function getStateDir(): string {
  const xdg = process.env.XDG_STATE_HOME?.trim()
  if (xdg) return path.join(xdg, "agent-core")
  return path.join(os.homedir(), ".local", "state", "agent-core")
}

function getCanvasDir(): string {
  return path.join(getStateDir(), "canvas")
}

function getCanvasStatePath(): string {
  return path.join(getCanvasDir(), "state.json")
}

async function ensureCanvasDir(): Promise<void> {
  await mkdir(getCanvasDir(), { recursive: true })
}

async function loadCanvasState(): Promise<CanvasState> {
  const statePath = getCanvasStatePath()
  if (!existsSync(statePath)) {
    return { version: 1, canvases: {} }
  }
  try {
    const raw = await readFile(statePath, "utf-8")
    const parsed = JSON.parse(raw) as Partial<CanvasState>
    if (parsed.version !== 1 || !parsed.canvases) return { version: 1, canvases: {} }
    return { version: 1, canvases: parsed.canvases }
  } catch {
    return { version: 1, canvases: {} }
  }
}

async function saveCanvasState(state: CanvasState): Promise<void> {
  await ensureCanvasDir()
  await writeFile(getCanvasStatePath(), JSON.stringify(state, null, 2), "utf-8")
}

function getRuntimeDir(): string | undefined {
  const configured = process.env.XDG_RUNTIME_DIR?.trim()
  if (configured) return configured
  if (typeof process.getuid === "function") return `/run/user/${process.getuid()}`
  return undefined
}

async function resolveWeztermUnixSocket(): Promise<string | undefined> {
  const existing = process.env.WEZTERM_UNIX_SOCKET?.trim()
  if (existing) return existing

  const runtimeDir = getRuntimeDir()
  if (!runtimeDir) return undefined

  const weztermDir = path.join(runtimeDir, "wezterm")
  if (!existsSync(weztermDir)) return undefined

  try {
    const entries = await readdir(weztermDir, { withFileTypes: true })

    // Prefer the well-known Wayland/X11 socket symlink if present.
    const wellKnown = entries.find((e) => e.isSymbolicLink() && e.name.endsWith("org.wezfurlong.wezterm"))
    if (wellKnown) return path.join(weztermDir, wellKnown.name)

    // Fallback to the newest gui-sock-* entry.
    const guiSockets = entries
      .filter((e) => e.name.startsWith("gui-sock-"))
      .map((e) => path.join(weztermDir, e.name))

    let best: { p: string; mtimeMs: number } | undefined
    for (const p of guiSockets) {
      try {
        const s = await stat(p)
        const mtimeMs = s.mtimeMs ?? 0
        if (!best || mtimeMs > best.mtimeMs) best = { p, mtimeMs }
      } catch {
        // ignore
      }
    }

    return best?.p
  } catch {
    return undefined
  }
}

async function weztermEnv(): Promise<NodeJS.ProcessEnv> {
  const env = { ...process.env }

  // Prevent `wezterm cli` from spawning an invisible mux server when no GUI socket is discoverable.
  const socket = await resolveWeztermUnixSocket()
  if (!socket) {
    throw new Error("WEZTERM_UNIX_SOCKET not set and no WezTerm GUI socket found")
  }
  env.WEZTERM_UNIX_SOCKET = socket

  const runtimeDir = getRuntimeDir()
  if (runtimeDir && !env.XDG_RUNTIME_DIR) env.XDG_RUNTIME_DIR = runtimeDir

  return env
}

async function weztermCli(args: string[], options: { timeoutMs?: number } = {}): Promise<{ stdout: string; stderr: string }> {
  const timeoutMs = options.timeoutMs ?? 5000
  const { stdout, stderr } = await execFileAsync("wezterm", ["cli", ...args], {
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
    env: await weztermEnv(),
  })
  return { stdout: String(stdout ?? ""), stderr: String(stderr ?? "") }
}

type WeztermListEntry = {
  pane_id?: number
  paneId?: number
  paneID?: number
  pane?: number
  tab_id?: number
  is_active?: boolean
  cwd?: string
}

async function getWeztermList(): Promise<WeztermListEntry[]> {
  const { stdout } = await weztermCli(["list", "--format", "json"], { timeoutMs: 2500 })
  const data = JSON.parse(stdout) as unknown
  if (!Array.isArray(data)) return []
  return data as WeztermListEntry[]
}

async function getWeztermPaneIds(): Promise<Set<string>> {
  const data = await getWeztermList()
  const ids = new Set<string>()
  for (const entry of data) {
    const paneId = entry?.pane_id ?? entry?.paneId ?? entry?.paneID ?? entry?.pane
    if (paneId === undefined || paneId === null) continue
    ids.add(String(paneId))
  }
  return ids
}

function weztermEnabled(): boolean {
  const raw = process.env.AGENT_CORE_CANVAS_WEZTERM?.trim().toLowerCase()
  if (!raw) return true
  return !["0", "false", "off", "no"].includes(raw)
}

function isPaneId(paneId: string | undefined): paneId is string {
  if (!paneId) return false
  return /^[0-9]+$/.test(paneId)
}

async function weztermAvailable(): Promise<boolean> {
  if (!weztermEnabled()) return false
  try {
    const ids = await getWeztermPaneIds()
    return ids.size > 0
  } catch {
    return false
  }
}

async function paneExists(paneId: string): Promise<boolean> {
  try {
    const ids = await getWeztermPaneIds()
    return ids.has(paneId)
  } catch {
    return false
  }
}

function normalizeCwd(cwd: string | undefined): string | undefined {
  if (!cwd) return undefined
  // WezTerm returns file:// URLs for cwd
  if (cwd.startsWith("file://")) {
    // Format: file://hostname/path - extract the path part
    const match = cwd.match(/^file:\/\/[^/]*(.+)$/)
    return match?.[1]
  }
  return cwd
}

function getPaneId(entry: WeztermListEntry): string | undefined {
  const paneId = entry?.pane_id ?? entry?.paneId ?? entry?.paneID ?? entry?.pane
  return paneId === undefined || paneId === null ? undefined : String(paneId)
}

async function resolveTargetPaneId(): Promise<string | undefined> {
  const list = await getWeztermList()
  const paneIds = new Set<string>()
  for (const entry of list) {
    const paneId = getPaneId(entry)
    if (paneId) paneIds.add(paneId)
  }

  // 1. Explicit configuration takes priority
  const configured = process.env.AGENT_CORE_CANVAS_PANE_ID?.trim()
  if (configured && isPaneId(configured) && paneIds.has(configured)) return configured

  // 2. Environment variable from WezTerm (set when running in WezTerm terminal)
  const envPane = process.env.WEZTERM_PANE?.trim()
  if (envPane && isPaneId(envPane) && paneIds.has(envPane)) return envPane

  // 3. Find a pane in the same working directory (same project/tab)
  const cwd = process.cwd()

  // Filter panes that match our current working directory
  const cwdMatches = list.filter((entry) => {
    const paneCwd = normalizeCwd(entry.cwd)
    return paneCwd && (paneCwd === cwd || paneCwd.startsWith(cwd + "/") || cwd.startsWith(paneCwd + "/"))
  })

  if (cwdMatches.length > 0) {
    // Prefer the active pane within matching cwd, otherwise take the first match
    const activeInCwd = cwdMatches.find((x) => x.is_active)
    const target = activeInCwd ?? cwdMatches[0]
    const paneId = getPaneId(target)
    if (paneId) return paneId
  }

  // 4. Last resort: use globally active pane (may be in wrong tab)
  // This maintains backwards compatibility but will likely open in wrong tab
  if (list.length === 0) return undefined
  const active = list.find((x) => x.is_active) ?? list[0]
  return getPaneId(active)
}

function safeString(input: unknown): string | undefined {
  if (typeof input === "string") return input
  return undefined
}

function renderTable(headers: string[], rows: string[][]): string {
  const normalizedRows = rows.map((r) => r.map((cell) => (cell === undefined || cell === null ? "" : String(cell))))
  const cols = Math.max(headers.length, ...normalizedRows.map((r) => r.length), 0)
  const tableHeaders = Array.from({ length: cols }, (_, i) => headers[i] ?? "")
  const tableRows = normalizedRows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ""))

  const widths = Array.from({ length: cols }, (_, i) => {
    const values = [tableHeaders[i], ...tableRows.map((r) => r[i])]
    return Math.max(...values.map((v) => String(v).length), 0)
  })

  const sep = (left: string, mid: string, right: string) =>
    left + widths.map((w) => "─".repeat(w + 2)).join(mid) + right

  const rowLine = (cells: string[]) =>
    "│" + cells.map((c, i) => ` ${String(c).padEnd(widths[i])} `).join("│") + "│"

  const lines: string[] = []
  lines.push(sep("┌", "┬", "┐"))
  lines.push(rowLine(tableHeaders))
  lines.push(sep("├", "┼", "┤"))
  for (const r of tableRows) lines.push(rowLine(r))
  lines.push(sep("└", "┴", "┘"))
  return lines.join("\n")
}

function buildCanvasBody(kind: CanvasKind, id: string, config: Record<string, unknown>): { title: string; body: string } {
  const title = safeString(config.title) || id

  if (kind === "table") {
    const headersRaw = config.headers
    const rowsRaw = config.rows
    const headers = Array.isArray(headersRaw) ? headersRaw.filter((h) => typeof h === "string") : []
    const rows = Array.isArray(rowsRaw)
      ? rowsRaw
          .filter((r) => Array.isArray(r))
          .map((r) => (r as unknown[]).map((cell) => (cell === undefined || cell === null ? "" : String(cell))))
      : []
    return {
      title,
      body: renderTable(headers, rows),
    }
  }

  const content = safeString(config.content)
  if (content) {
    return { title, body: content }
  }

  return { title, body: JSON.stringify(config, null, 2) }
}

function buildPanePayload(title: string, kind: CanvasKind, id: string, body: string): string {
  const now = new Date()
  const meta = `${id} • ${kind} • ${now.toLocaleString()}`
  const header = `${title}\n${"=".repeat(Math.min(80, Math.max(8, title.length)))}\n\n`
  const footer = `\n\n${meta}\n`
  const clear = "\x1b[2J\x1b[H"
  const setTitle = `\x1b]0;Canvas: ${title}\x07`
  return clear + setTitle + header + body + footer
}

async function ensureCanvasPane(id: string, kind: CanvasKind): Promise<{ paneId: string; created: boolean }> {
  const state = await loadCanvasState()
  const existing = state.canvases[id]
  if (existing && (await paneExists(existing.paneId))) {
    return { paneId: existing.paneId, created: false }
  }

  const percent = (() => {
    const raw = process.env.AGENT_CORE_CANVAS_PERCENT?.trim()
    const num = raw ? Number(raw) : NaN
    if (!Number.isFinite(num) || num <= 0 || num >= 100) return DEFAULT_CANVAS_PERCENT
    return Math.round(num)
  })()

  const targetPaneId = await resolveTargetPaneId()

  const splitPane = async (paneId: string | undefined): Promise<string> => {
    // Start a "display" pane that doesn't echo input; content is rendered by sending text to stdin.
    const splitArgs = ["split-pane", "--right", "--percent", String(percent)]
    if (paneId) splitArgs.push("--pane-id", paneId)
    splitArgs.push("--", "sh", "-c", "stty -echo 2>/dev/null; cat")
    const { stdout } = await weztermCli(splitArgs, { timeoutMs: 5000 })
    return stdout.trim()
  }

  const paneId = await (async () => {
    try {
      return await splitPane(targetPaneId)
    } catch (error) {
      if (!targetPaneId) throw error
      return await splitPane(undefined)
    }
  })()
  if (!paneId) throw new Error("wezterm did not return a pane id")

  state.canvases[id] = { paneId, kind, createdAt: Date.now() }
  await saveCanvasState(state)

  // Restore focus back to the calling pane if available.
  if (targetPaneId) {
    try {
      await weztermCli(["activate-pane", "--pane-id", targetPaneId], { timeoutMs: 2500 })
    } catch {
      // ignore
    }
  }

  return { paneId, created: true }
}

async function renderToPane(paneId: string, payload: string): Promise<void> {
  // NOTE: send-text sends input to the process attached to the pane; our canvas pane runs `cat`.
  await weztermCli(["send-text", "--pane-id", paneId, "--no-paste", payload], { timeoutMs: 5000 })
}

// Canvas spawn tool
export const spawn = tool({
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
    let config: Record<string, unknown>
    try {
      config = JSON.parse(args.config)
    } catch {
      return `Invalid JSON config: ${args.config}`
    }

    const kind = args.kind as CanvasKind
    const { title, body } = buildCanvasBody(kind, args.id, config)

    if (!(await weztermAvailable())) {
      return `=== ${title} ===
(Canvas type: ${kind})

${body}

---
Note: WezTerm canvas panes are unavailable (not running in WezTerm or \`wezterm cli\` not reachable). Content displayed inline.`
    }

    try {
      const { paneId, created } = await ensureCanvasPane(args.id, kind)
      const payload = buildPanePayload(title, kind, args.id, body)
      await renderToPane(paneId, payload)
      return `${created ? "Canvas created" : "Canvas updated"}: "${args.id}" (${kind}) in WezTerm pane ${paneId}.`
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return `=== ${title} ===
(Canvas type: ${kind})

${body}

---
Note: Failed to render canvas in WezTerm (${msg}). Content displayed inline.`
    }
  },
})

// Canvas update tool
export const update = tool({
  description: `Update an existing canvas's content.

Examples:
- Update text: { id: "poem", config: '{"content": "New poem content"}' }
- Update calendar: { id: "cal", config: '{"events": [{"date": "2026-01-20", "title": "Meeting"}]}' }`,
  args: {
    id: tool.schema.string().describe("Canvas identifier to update"),
    config: tool.schema.string().describe("New JSON configuration"),
  },
  async execute(args) {
    let config: Record<string, unknown>
    try {
      config = JSON.parse(args.config)
    } catch {
      return `Invalid JSON config: ${args.config}`
    }

    if (!(await weztermAvailable())) {
      return `Canvas "${args.id}" update requested.

WezTerm canvas panes are unavailable (not running in WezTerm or \`wezterm cli\` not reachable).`
    }

    const state = await loadCanvasState()
    const existing = state.canvases[args.id]
    if (!existing) {
      return `Canvas "${args.id}" does not exist yet. Use canvas_spawn first.`
    }

    if (!(await paneExists(existing.paneId))) {
      delete state.canvases[args.id]
      await saveCanvasState(state)
      return `Canvas "${args.id}" pane is no longer available. Use canvas_spawn to recreate it.`
    }

    const { title, body } = buildCanvasBody(existing.kind, args.id, config)
    const payload = buildPanePayload(title, existing.kind, args.id, body)
    await renderToPane(existing.paneId, payload)
    return `Canvas "${args.id}" updated in WezTerm pane ${existing.paneId}.`
  },
})

// Canvas close tool
export const close = tool({
  description: `Close a canvas pane.`,
  args: {
    id: tool.schema.string().describe("Canvas identifier to close"),
  },
  async execute(args) {
    if (!(await weztermAvailable())) {
      return `Canvas "${args.id}" close requested.

WezTerm canvas panes are unavailable (not running in WezTerm or \`wezterm cli\` not reachable).`
    }

    const state = await loadCanvasState()
    const existing = state.canvases[args.id]
    if (!existing) return `Canvas "${args.id}" is not open.`

    try {
      await weztermCli(["kill-pane", "--pane-id", existing.paneId], { timeoutMs: 5000 })
    } catch {
      // ignore (pane may already be closed)
    }

    delete state.canvases[args.id]
    await saveCanvasState(state)
    return `Canvas "${args.id}" closed.`
  },
})

// Canvas list tool
export const list = tool({
  description: `List all active canvases.`,
  args: {},
  async execute() {
    const state = await loadCanvasState()
    const ids = Object.keys(state.canvases)
    if (ids.length === 0) return "No active canvases."

    if (!(await weztermAvailable())) {
      const lines = ids
        .sort((a, b) => a.localeCompare(b))
        .map((id) => {
          const c = state.canvases[id]
          if (!c) return null
          return `- ${id} (${c.kind}) last known pane ${c.paneId}`
        })
        .filter(Boolean)
        .join("\n")

      return `${ids.length} canvas(es) in state (WezTerm unavailable, not verifying panes):\n${lines}`
    }

    const live = new Map<string, { paneId: string; kind: CanvasKind; createdAt: number }>()
    for (const id of ids) {
      const c = state.canvases[id]
      if (!c) continue
      if (await paneExists(c.paneId)) {
        live.set(id, c)
      } else {
        delete state.canvases[id]
      }
    }
    await saveCanvasState(state)

    if (live.size === 0) return "No active canvases."

    const lines = Array.from(live.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([id, c]) => `- ${id} (${c.kind}) in pane ${c.paneId}`)
      .join("\n")

    return `${live.size} active canvas(es):\n${lines}`
  },
})
