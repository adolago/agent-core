/**
 * Canvas Manager - WezTerm-native canvas pane management
 *
 * Manages TUI canvases using WezTerm CLI directly.
 * No external dependencies - just WezTerm's built-in capabilities.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { CanvasConfig, CanvasMessage } from "./types.js";

const execAsync = promisify(exec);

export type CanvasKind = "text" | "calendar" | "document" | "table" | "diagram" | "graph" | "mindmap";

export interface CanvasInstance {
  id: string;
  kind: CanvasKind;
  paneId: string;
  config: Record<string, unknown>;
  createdAt: number;
  lastUpdatedAt: number;
}

export interface CanvasManagerConfig {
  /** Default width ratio for canvas panes (0.0-1.0) */
  defaultWidth: number;
  /** Reuse existing canvas pane instead of creating new one */
  reusePane: boolean;
  /** Direction for split pane */
  splitDirection: "right" | "bottom";
}

const DEFAULT_CONFIG: CanvasManagerConfig = {
  defaultWidth: 0.67,
  reusePane: true,
  splitDirection: "right",
};

/**
 * ANSI escape codes for TUI rendering
 */
export const ANSI = {
  // Cursor control
  CLEAR: "\x1b[2J\x1b[H",
  HIDE_CURSOR: "\x1b[?25l",
  SHOW_CURSOR: "\x1b[?25h",
  MOVE_TO: (row: number, col: number) => `\x1b[${row};${col}H`,

  // Colors (foreground)
  FG_BLACK: "\x1b[30m",
  FG_RED: "\x1b[31m",
  FG_GREEN: "\x1b[32m",
  FG_YELLOW: "\x1b[33m",
  FG_BLUE: "\x1b[34m",
  FG_MAGENTA: "\x1b[35m",
  FG_CYAN: "\x1b[36m",
  FG_WHITE: "\x1b[37m",
  FG_DEFAULT: "\x1b[39m",

  // Colors (background)
  BG_BLACK: "\x1b[40m",
  BG_RED: "\x1b[41m",
  BG_GREEN: "\x1b[42m",
  BG_YELLOW: "\x1b[43m",
  BG_BLUE: "\x1b[44m",
  BG_MAGENTA: "\x1b[45m",
  BG_CYAN: "\x1b[46m",
  BG_WHITE: "\x1b[47m",
  BG_DEFAULT: "\x1b[49m",

  // Styles
  BOLD: "\x1b[1m",
  DIM: "\x1b[2m",
  ITALIC: "\x1b[3m",
  UNDERLINE: "\x1b[4m",
  RESET: "\x1b[0m",

  // RGB colors
  fg: (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`,
  bg: (r: number, g: number, b: number) => `\x1b[48;2;${r};${g};${b}m`,
};

/**
 * Box drawing characters for TUI borders
 */
export const BOX = {
  TOP_LEFT: "╭",
  TOP_RIGHT: "╮",
  BOTTOM_LEFT: "╰",
  BOTTOM_RIGHT: "╯",
  HORIZONTAL: "─",
  VERTICAL: "│",
  T_DOWN: "┬",
  T_UP: "┴",
  T_RIGHT: "├",
  T_LEFT: "┤",
  CROSS: "┼",

  // Double line variants
  D_TOP_LEFT: "╔",
  D_TOP_RIGHT: "╗",
  D_BOTTOM_LEFT: "╚",
  D_BOTTOM_RIGHT: "╝",
  D_HORIZONTAL: "═",
  D_VERTICAL: "║",
};

/**
 * Canvas Manager
 *
 * Manages canvas panes using WezTerm CLI.
 */
export class CanvasManager {
  private config: CanvasManagerConfig;
  private canvases = new Map<string, CanvasInstance>();
  private sharedPaneId?: string;

  constructor(config?: Partial<CanvasManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if WezTerm CLI is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execAsync("wezterm cli list --format json");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Spawn a new canvas pane
   */
  async spawn(
    kind: CanvasKind,
    id: string,
    config?: Record<string, unknown>
  ): Promise<CanvasInstance> {
    // Check if canvas already exists
    const existing = this.canvases.get(id);
    if (existing) {
      // Update existing canvas
      await this.update(id, config ?? {});
      return existing;
    }

    // Get or create pane
    let paneId: string;
    if (this.config.reusePane && this.sharedPaneId) {
      // Reuse existing shared pane
      paneId = this.sharedPaneId;
    } else {
      // Create new pane
      paneId = await this.createPane();
      if (this.config.reusePane) {
        this.sharedPaneId = paneId;
      }
    }

    // Create canvas instance
    const canvas: CanvasInstance = {
      id,
      kind,
      paneId,
      config: config ?? {},
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
    };

    this.canvases.set(id, canvas);

    // Render initial content
    await this.render(id);

    return canvas;
  }

  /**
   * Show an existing canvas (bring to focus)
   */
  async show(id: string): Promise<void> {
    const canvas = this.canvases.get(id);
    if (!canvas) {
      throw new Error(`Canvas not found: ${id}`);
    }

    await this.focusPane(canvas.paneId);
    await this.render(id);
  }

  /**
   * Close a canvas
   */
  async close(id: string): Promise<void> {
    const canvas = this.canvases.get(id);
    if (!canvas) {
      return;
    }

    this.canvases.delete(id);

    // If this was the only canvas using the pane, close the pane
    const otherCanvasesUsingPane = Array.from(this.canvases.values()).filter(
      (c) => c.paneId === canvas.paneId
    );

    if (otherCanvasesUsingPane.length === 0 && !this.config.reusePane) {
      await this.closePane(canvas.paneId);
    } else {
      // Clear the pane content
      await this.sendToPane(canvas.paneId, ANSI.CLEAR);
    }
  }

  /**
   * Update canvas configuration and re-render
   */
  async update(id: string, config: Record<string, unknown>): Promise<void> {
    const canvas = this.canvases.get(id);
    if (!canvas) {
      throw new Error(`Canvas not found: ${id}`);
    }

    canvas.config = { ...canvas.config, ...config };
    canvas.lastUpdatedAt = Date.now();

    await this.render(id);
  }

  /**
   * Render canvas content to its pane
   */
  async render(id: string): Promise<void> {
    const canvas = this.canvases.get(id);
    if (!canvas) {
      throw new Error(`Canvas not found: ${id}`);
    }

    // Import renderer dynamically based on kind
    const content = await this.renderContent(canvas);
    await this.sendToPane(canvas.paneId, content);
  }

  /**
   * Get user selection from canvas (placeholder for interactive canvases)
   */
  async getSelection(id: string): Promise<string | null> {
    const canvas = this.canvases.get(id);
    if (!canvas) {
      return null;
    }

    // For now, return the last config selection if any
    return (canvas.config.selection as string) ?? null;
  }

  /**
   * List all active canvases
   */
  listActive(): CanvasInstance[] {
    return Array.from(this.canvases.values());
  }

  /**
   * Close all canvases
   */
  async closeAll(): Promise<void> {
    for (const id of Array.from(this.canvases.keys())) {
      await this.close(id);
    }

    // Close shared pane if it exists
    if (this.sharedPaneId) {
      await this.closePane(this.sharedPaneId);
      this.sharedPaneId = undefined;
    }
  }

  // =========================================================================
  // Private methods
  // =========================================================================

  /**
   * Create a new WezTerm pane
   */
  private async createPane(): Promise<string> {
    const direction =
      this.config.splitDirection === "right" ? "--right" : "--bottom";
    const percent = Math.round(this.config.defaultWidth * 100);

    try {
      const { stdout } = await execAsync(
        `wezterm cli split-pane ${direction} --percent ${percent}`
      );
      return stdout.trim();
    } catch (error) {
      throw new Error(
        `Failed to create pane: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Close a WezTerm pane
   */
  private async closePane(paneId: string): Promise<void> {
    try {
      await execAsync(`wezterm cli kill-pane --pane-id ${paneId}`);
    } catch {
      // Pane might already be closed
    }
  }

  /**
   * Focus a WezTerm pane
   */
  private async focusPane(paneId: string): Promise<void> {
    try {
      await execAsync(`wezterm cli activate-pane --pane-id ${paneId}`);
    } catch {
      // Ignore focus errors
    }
  }

  /**
   * Send text to a WezTerm pane
   */
  private async sendToPane(paneId: string, text: string): Promise<void> {
    // Escape special characters for shell
    const escaped = text.replace(/'/g, "'\\''");

    try {
      await execAsync(
        `wezterm cli send-text --pane-id ${paneId} --no-paste $'${escaped}'`
      );
    } catch (error) {
      throw new Error(
        `Failed to send to pane: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Render content based on canvas kind
   */
  private async renderContent(canvas: CanvasInstance): Promise<string> {
    const { kind, config } = canvas;

    switch (kind) {
      case "text":
        return this.renderText(config);
      case "calendar":
        return this.renderCalendar(config);
      case "document":
        return this.renderDocument(config);
      case "table":
        return this.renderTable(config);
      case "diagram":
        return this.renderDiagram(config);
      case "graph":
        return this.renderGraph(config);
      case "mindmap":
        return this.renderMindmap(config);
      default:
        return this.renderText({ content: `Unknown canvas kind: ${kind}` });
    }
  }

  /**
   * Render text canvas
   */
  private renderText(config: Record<string, unknown>): string {
    const title = (config.title as string) ?? "Canvas";
    const content = (config.content as string) ?? "";
    const width = (config.width as number) ?? 60;

    const lines: string[] = [];

    // Clear and hide cursor
    lines.push(ANSI.CLEAR + ANSI.HIDE_CURSOR);

    // Title bar
    const titlePadded = ` ${title} `;
    const titleLeft = Math.floor((width - titlePadded.length) / 2);
    const topBorder =
      BOX.TOP_LEFT +
      BOX.HORIZONTAL.repeat(titleLeft) +
      ANSI.BOLD +
      titlePadded +
      ANSI.RESET +
      BOX.HORIZONTAL.repeat(width - titleLeft - titlePadded.length) +
      BOX.TOP_RIGHT;
    lines.push(topBorder);

    // Content
    const contentLines = content.split("\n");
    for (const line of contentLines) {
      const paddedLine = line.padEnd(width).slice(0, width);
      lines.push(BOX.VERTICAL + paddedLine + BOX.VERTICAL);
    }

    // Bottom border
    lines.push(
      BOX.BOTTOM_LEFT + BOX.HORIZONTAL.repeat(width) + BOX.BOTTOM_RIGHT
    );

    return lines.join("\n");
  }

  /**
   * Render calendar canvas
   */
  private renderCalendar(config: Record<string, unknown>): string {
    const dateStr = config.date as string | undefined;
    const date = dateStr ? new Date(dateStr) : new Date();
    const events = (config.events as Array<{ date: string; title: string }>) ?? [];

    const year = date.getFullYear();
    const month = date.getMonth();
    const monthName = date.toLocaleString("default", { month: "long" });

    const lines: string[] = [];
    lines.push(ANSI.CLEAR + ANSI.HIDE_CURSOR);

    // Header
    const header = ` ${monthName} ${year} `;
    const width = 28; // 7 days * 4 chars
    lines.push(
      BOX.D_TOP_LEFT +
        BOX.D_HORIZONTAL.repeat(Math.floor((width - header.length) / 2)) +
        ANSI.BOLD +
        ANSI.FG_CYAN +
        header +
        ANSI.RESET +
        BOX.D_HORIZONTAL.repeat(Math.ceil((width - header.length) / 2)) +
        BOX.D_TOP_RIGHT
    );

    // Day headers
    const days = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    lines.push(
      BOX.D_VERTICAL +
        " " +
        days.map((d) => ANSI.DIM + d + ANSI.RESET).join("  ") +
        " " +
        BOX.D_VERTICAL
    );
    lines.push(
      BOX.T_RIGHT + BOX.HORIZONTAL.repeat(width) + BOX.T_LEFT
    );

    // Calendar grid
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const isCurrentMonth =
      today.getFullYear() === year && today.getMonth() === month;

    let dayNum = 1;
    for (let week = 0; week < 6 && dayNum <= daysInMonth; week++) {
      let row = BOX.VERTICAL + " ";
      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        if (week === 0 && dayOfWeek < firstDay) {
          row += "    ";
        } else if (dayNum > daysInMonth) {
          row += "    ";
        } else {
          const isToday = isCurrentMonth && today.getDate() === dayNum;
          const hasEvent = events.some((e) => {
            const eventDate = new Date(e.date);
            return (
              eventDate.getFullYear() === year &&
              eventDate.getMonth() === month &&
              eventDate.getDate() === dayNum
            );
          });

          let dayStr = dayNum.toString().padStart(2);
          if (isToday) {
            dayStr = ANSI.BG_BLUE + ANSI.FG_WHITE + dayStr + ANSI.RESET;
          } else if (hasEvent) {
            dayStr = ANSI.FG_GREEN + ANSI.BOLD + dayStr + ANSI.RESET;
          }
          row += dayStr + "  ";
          dayNum++;
        }
      }
      lines.push(row.trimEnd() + " ".repeat(Math.max(0, width - row.length + 2)) + BOX.VERTICAL);
    }

    // Footer
    lines.push(
      BOX.D_BOTTOM_LEFT + BOX.D_HORIZONTAL.repeat(width) + BOX.D_BOTTOM_RIGHT
    );

    // Events list
    if (events.length > 0) {
      lines.push("");
      lines.push(ANSI.BOLD + "Events:" + ANSI.RESET);
      for (const event of events.slice(0, 5)) {
        const eventDate = new Date(event.date);
        lines.push(
          `  ${ANSI.FG_GREEN}${eventDate.getDate()}${ANSI.RESET} - ${event.title}`
        );
      }
    }

    return lines.join("\n");
  }

  /**
   * Render document canvas (simple markdown-like rendering)
   */
  private renderDocument(config: Record<string, unknown>): string {
    const title = (config.title as string) ?? "Document";
    const content = (config.content as string) ?? "";
    const width = (config.width as number) ?? 70;

    const lines: string[] = [];
    lines.push(ANSI.CLEAR + ANSI.HIDE_CURSOR);

    // Title
    lines.push(
      ANSI.BOLD + ANSI.FG_CYAN + "═".repeat(width) + ANSI.RESET
    );
    lines.push(
      ANSI.BOLD + " " + title + ANSI.RESET
    );
    lines.push(
      ANSI.BOLD + ANSI.FG_CYAN + "═".repeat(width) + ANSI.RESET
    );
    lines.push("");

    // Content with simple markdown rendering
    const contentLines = content.split("\n");
    for (const line of contentLines) {
      if (line.startsWith("# ")) {
        lines.push(ANSI.BOLD + ANSI.FG_YELLOW + line.slice(2) + ANSI.RESET);
      } else if (line.startsWith("## ")) {
        lines.push(ANSI.BOLD + ANSI.FG_GREEN + line.slice(3) + ANSI.RESET);
      } else if (line.startsWith("### ")) {
        lines.push(ANSI.BOLD + line.slice(4) + ANSI.RESET);
      } else if (line.startsWith("- ")) {
        lines.push(ANSI.FG_CYAN + "  •" + ANSI.RESET + line.slice(1));
      } else if (line.startsWith("```")) {
        lines.push(ANSI.DIM + line + ANSI.RESET);
      } else if (line.match(/^\d+\. /)) {
        lines.push(ANSI.FG_MAGENTA + "  " + line + ANSI.RESET);
      } else {
        lines.push(line);
      }
    }

    return lines.join("\n");
  }

  /**
   * Render table canvas
   */
  private renderTable(config: Record<string, unknown>): string {
    const title = (config.title as string) ?? "Table";
    const headers = (config.headers as string[]) ?? [];
    const rows = (config.rows as string[][]) ?? [];
    const columnWidths = (config.columnWidths as number[]) ??
      headers.map(() => 15);

    const lines: string[] = [];
    lines.push(ANSI.CLEAR + ANSI.HIDE_CURSOR);

    // Title
    lines.push(ANSI.BOLD + ANSI.FG_CYAN + title + ANSI.RESET);
    lines.push("");

    // Calculate total width
    const totalWidth = columnWidths.reduce((a, b) => a + b, 0) + headers.length + 1;

    // Header border
    lines.push(
      BOX.TOP_LEFT +
        columnWidths.map((w) => BOX.HORIZONTAL.repeat(w)).join(BOX.T_DOWN) +
        BOX.TOP_RIGHT
    );

    // Headers
    const headerRow = headers
      .map((h, i) => {
        const w = columnWidths[i];
        return ANSI.BOLD + h.slice(0, w).padEnd(w) + ANSI.RESET;
      })
      .join(BOX.VERTICAL);
    lines.push(BOX.VERTICAL + headerRow + BOX.VERTICAL);

    // Header/content separator
    lines.push(
      BOX.T_RIGHT +
        columnWidths.map((w) => BOX.HORIZONTAL.repeat(w)).join(BOX.CROSS) +
        BOX.T_LEFT
    );

    // Rows
    for (const row of rows) {
      const rowStr = row
        .map((cell, i) => {
          const w = columnWidths[i] ?? 15;
          return (cell ?? "").slice(0, w).padEnd(w);
        })
        .join(BOX.VERTICAL);
      lines.push(BOX.VERTICAL + rowStr + BOX.VERTICAL);
    }

    // Bottom border
    lines.push(
      BOX.BOTTOM_LEFT +
        columnWidths.map((w) => BOX.HORIZONTAL.repeat(w)).join(BOX.T_UP) +
        BOX.BOTTOM_RIGHT
    );

    return lines.join("\n");
  }

  /**
   * Render diagram canvas (flowchart/architecture style)
   *
   * Config:
   * - title: string
   * - nodes: Array<{ id: string, label: string, type?: "box"|"diamond"|"oval" }>
   * - edges: Array<{ from: string, to: string, label?: string }>
   * - direction?: "TB" | "LR" (top-to-bottom or left-to-right)
   */
  private renderDiagram(config: Record<string, unknown>): string {
    const title = (config.title as string) ?? "Diagram";
    const nodes = (config.nodes as Array<{ id: string; label: string; type?: string }>) ?? [];
    const edges = (config.edges as Array<{ from: string; to: string; label?: string }>) ?? [];
    const direction = (config.direction as string) ?? "TB";

    const lines: string[] = [];
    lines.push(ANSI.CLEAR + ANSI.HIDE_CURSOR);

    // Title
    lines.push(ANSI.BOLD + ANSI.FG_CYAN + title + ANSI.RESET);
    lines.push(ANSI.DIM + "─".repeat(title.length + 4) + ANSI.RESET);
    lines.push("");

    // Build node map for edge rendering
    const nodeMap = new Map(nodes.map((n, i) => [n.id, { ...n, index: i }]));

    // Render nodes
    const nodeWidth = 20;
    const isHorizontal = direction === "LR";

    if (isHorizontal) {
      // Horizontal layout
      let row1 = "";
      let row2 = "";
      let row3 = "";

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const label = node.label.slice(0, nodeWidth - 4).padStart(Math.floor((nodeWidth - 4 + node.label.length) / 2)).padEnd(nodeWidth - 4);

        if (node.type === "diamond") {
          row1 += "    " + " ".repeat(Math.floor((nodeWidth - 6) / 2)) + "/" + "\\".padEnd(Math.ceil((nodeWidth - 6) / 2)) + "    ";
          row2 += "   <" + label + ">   ";
          row3 += "    " + " ".repeat(Math.floor((nodeWidth - 6) / 2)) + "\\" + "/".padEnd(Math.ceil((nodeWidth - 6) / 2)) + "    ";
        } else if (node.type === "oval") {
          row1 += "  (" + "─".repeat(nodeWidth - 4) + ")  ";
          row2 += "  │" + label + "│  ";
          row3 += "  (" + "─".repeat(nodeWidth - 4) + ")  ";
        } else {
          // Default: box
          row1 += "┌" + "─".repeat(nodeWidth - 2) + "┐";
          row2 += "│" + ANSI.BOLD + label + ANSI.RESET + "│";
          row3 += "└" + "─".repeat(nodeWidth - 2) + "┘";
        }

        // Add arrow between nodes
        if (i < nodes.length - 1) {
          const edge = edges.find(e => e.from === node.id && e.to === nodes[i + 1]?.id);
          if (edge) {
            row1 += "     ";
            row2 += " ──▶ ";
            row3 += edge.label ? ` ${edge.label.slice(0, 3)} ` : "     ";
          } else {
            row1 += "     ";
            row2 += "     ";
            row3 += "     ";
          }
        }
      }

      lines.push(row1);
      lines.push(row2);
      lines.push(row3);
    } else {
      // Vertical layout (TB)
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const label = node.label.slice(0, nodeWidth - 4);
        const padLeft = Math.floor((nodeWidth - 4 - label.length) / 2);
        const padRight = nodeWidth - 4 - label.length - padLeft;

        if (node.type === "diamond") {
          const mid = Math.floor(nodeWidth / 2);
          lines.push(" ".repeat(mid - 1) + "/" + "\\");
          lines.push("<" + " ".repeat(padLeft) + ANSI.BOLD + label + ANSI.RESET + " ".repeat(padRight) + ">");
          lines.push(" ".repeat(mid - 1) + "\\" + "/");
        } else if (node.type === "oval") {
          lines.push("(" + "─".repeat(nodeWidth - 2) + ")");
          lines.push("│" + " ".repeat(padLeft) + ANSI.BOLD + label + ANSI.RESET + " ".repeat(padRight) + "│");
          lines.push("(" + "─".repeat(nodeWidth - 2) + ")");
        } else {
          // Default: box
          lines.push("┌" + "─".repeat(nodeWidth - 2) + "┐");
          lines.push("│" + " ".repeat(padLeft) + ANSI.BOLD + label + ANSI.RESET + " ".repeat(padRight) + "│");
          lines.push("└" + "─".repeat(nodeWidth - 2) + "┘");
        }

        // Add arrow to next node
        if (i < nodes.length - 1) {
          const edge = edges.find(e => e.from === node.id && e.to === nodes[i + 1]?.id);
          const mid = Math.floor(nodeWidth / 2);
          lines.push(" ".repeat(mid) + "│");
          if (edge?.label) {
            lines.push(" ".repeat(mid) + "│ " + ANSI.DIM + edge.label + ANSI.RESET);
          }
          lines.push(" ".repeat(mid) + "▼");
        }
      }
    }

    // Legend for node types
    lines.push("");
    lines.push(ANSI.DIM + "Legend: ┌─┐ process  <> decision  () terminal" + ANSI.RESET);

    return lines.join("\n");
  }

  /**
   * Render graph canvas (nodes and edges)
   *
   * Config:
   * - title: string
   * - nodes: Array<{ id: string, label: string, color?: string }>
   * - edges: Array<{ from: string, to: string, label?: string, weight?: number }>
   */
  private renderGraph(config: Record<string, unknown>): string {
    const title = (config.title as string) ?? "Graph";
    const nodes = (config.nodes as Array<{ id: string; label: string; color?: string }>) ?? [];
    const edges = (config.edges as Array<{ from: string; to: string; label?: string; weight?: number }>) ?? [];

    const lines: string[] = [];
    lines.push(ANSI.CLEAR + ANSI.HIDE_CURSOR);

    // Title
    lines.push(ANSI.BOLD + ANSI.FG_MAGENTA + "◉ " + title + ANSI.RESET);
    lines.push("");

    // Build adjacency representation
    const adjacency = new Map<string, Array<{ to: string; label?: string; weight?: number }>>();
    for (const edge of edges) {
      if (!adjacency.has(edge.from)) {
        adjacency.set(edge.from, []);
      }
      adjacency.get(edge.from)!.push({ to: edge.to, label: edge.label, weight: edge.weight });
    }

    // Render nodes with their connections
    const nodeColors: Record<string, string> = {
      red: ANSI.FG_RED,
      green: ANSI.FG_GREEN,
      blue: ANSI.FG_BLUE,
      yellow: ANSI.FG_YELLOW,
      cyan: ANSI.FG_CYAN,
      magenta: ANSI.FG_MAGENTA,
    };

    for (const node of nodes) {
      const color = node.color ? (nodeColors[node.color] ?? ANSI.FG_WHITE) : ANSI.FG_CYAN;

      // Node representation
      lines.push(color + "◉" + ANSI.RESET + " " + ANSI.BOLD + node.label + ANSI.RESET + ANSI.DIM + ` (${node.id})` + ANSI.RESET);

      // Outgoing edges
      const outEdges = adjacency.get(node.id) ?? [];
      for (let i = 0; i < outEdges.length; i++) {
        const edge = outEdges[i];
        const isLast = i === outEdges.length - 1;
        const prefix = isLast ? "  └─▶ " : "  ├─▶ ";
        const targetNode = nodes.find(n => n.id === edge.to);
        const targetLabel = targetNode?.label ?? edge.to;
        const edgeInfo = edge.label
          ? ` ${ANSI.DIM}[${edge.label}${edge.weight ? ` w:${edge.weight}` : ""}]${ANSI.RESET}`
          : edge.weight
            ? ` ${ANSI.DIM}[w:${edge.weight}]${ANSI.RESET}`
            : "";
        lines.push(prefix + targetLabel + edgeInfo);
      }

      if (outEdges.length === 0) {
        lines.push("  " + ANSI.DIM + "(no outgoing edges)" + ANSI.RESET);
      }
      lines.push("");
    }

    // Stats
    lines.push(ANSI.DIM + "─".repeat(40) + ANSI.RESET);
    lines.push(ANSI.DIM + `Nodes: ${nodes.length}  Edges: ${edges.length}` + ANSI.RESET);

    return lines.join("\n");
  }

  /**
   * Render mindmap canvas (hierarchical tree)
   *
   * Config:
   * - title: string (root node)
   * - children: Array<MindmapNode> where MindmapNode = { label: string, children?: MindmapNode[] }
   */
  private renderMindmap(config: Record<string, unknown>): string {
    const title = (config.title as string) ?? "Mindmap";
    const children = (config.children as Array<MindmapNode>) ?? [];

    interface MindmapNode {
      label: string;
      children?: MindmapNode[];
    }

    const lines: string[] = [];
    lines.push(ANSI.CLEAR + ANSI.HIDE_CURSOR);

    // Render tree recursively
    const renderNode = (node: MindmapNode, prefix: string, isLast: boolean, isRoot: boolean): void => {
      if (isRoot) {
        lines.push(ANSI.BOLD + ANSI.FG_YELLOW + "◆ " + node.label + ANSI.RESET);
      } else {
        const connector = isLast ? "└── " : "├── ";
        lines.push(prefix + connector + node.label);
      }

      const childPrefix = isRoot ? "" : prefix + (isLast ? "    " : "│   ");
      const nodeChildren = node.children ?? [];
      for (let i = 0; i < nodeChildren.length; i++) {
        renderNode(nodeChildren[i], childPrefix, i === nodeChildren.length - 1, false);
      }
    };

    // Root node
    renderNode({ label: title, children }, "", true, true);

    // Count total nodes
    const countNodes = (nodes: MindmapNode[]): number => {
      return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children ?? []), 0);
    };
    const totalNodes = 1 + countNodes(children);

    lines.push("");
    lines.push(ANSI.DIM + `Total nodes: ${totalNodes}` + ANSI.RESET);

    return lines.join("\n");
  }
}

/**
 * Create a canvas manager with default configuration
 */
export function createCanvasManager(
  config?: Partial<CanvasManagerConfig>
): CanvasManager {
  return new CanvasManager(config);
}
