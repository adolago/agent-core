/**
 * Canvas - TUI toolkit for agent displays
 *
 * Provides terminal-based UI canvases for interactive displays
 * (emails, calendars, data views) via tmux or WezTerm panes.
 *
 * @packageDocumentation
 */

export type TerminalType = "tmux" | "wezterm" | "none";

export interface TerminalEnvironment {
  type: TerminalType;
  inTmux: boolean;
  inWezTerm: boolean;
  summary: string;
}

export interface SpawnResult {
  method: string;
  pid?: number;
}

export interface SpawnOptions {
  socketPath?: string;
  scenario?: string;
}

export interface CanvasConfig {
  kind: string;
  id: string;
  config?: Record<string, unknown>;
  options?: SpawnOptions;
}

/**
 * IPC message types for canvas communication
 */
export type CanvasMessage =
  | { type: "ready"; scenario: string }
  | { type: "selected"; data: unknown }
  | { type: "cancelled" }
  | { type: "update"; config: Record<string, unknown> }
  | { type: "close" };

/**
 * Canvas capability definition
 */
export interface CanvasCapability {
  id: string;
  name: string;
  description: string;
  scenarios: string[];
}
