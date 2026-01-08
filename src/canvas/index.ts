/**
 * Canvas Integration Module
 *
 * Wraps vendor/canvas to provide TUI displays for agent-core.
 * Supports both tmux and WezTerm terminal multiplexers.
 */

export * from "./types.js";
export * from "./manager.js";

/**
 * Detect available terminal multiplexer
 *
 * Priority:
 * 1. CANVAS_TERMINAL env var (explicit override)
 * 2. tmux if running (even inside WezTerm)
 * 3. WezTerm if available
 */
export function detectTerminal(): import("./types.js").TerminalEnvironment {
  const inTmux = !!process.env.TMUX;
  const inWezTerm =
    process.env.WEZTERM_PANE !== undefined ||
    process.env.WEZTERM_EXECUTABLE !== undefined;

  const preferred = process.env.CANVAS_TERMINAL?.toLowerCase();

  let type: import("./types.js").TerminalType;
  if (preferred === "wezterm" && inWezTerm) {
    type = "wezterm";
  } else if (preferred === "tmux" && inTmux) {
    type = "tmux";
  } else if (inTmux) {
    // Inside tmux - use tmux (even if also in WezTerm)
    type = "tmux";
  } else if (inWezTerm) {
    type = "wezterm";
  } else {
    type = "none";
  }

  const summary = type === "none" ? "no terminal multiplexer" : type;
  return { type, inTmux, inWezTerm, summary };
}

/**
 * Check if canvas is available in current environment
 */
export function isCanvasAvailable(): boolean {
  const env = detectTerminal();
  return env.type !== "none";
}

/**
 * Get the canvas runner command
 */
export function getCanvasCommand(): string {
  // Canvas CLI is run via bun from vendor directory
  return "bun run vendor/canvas/canvas/src/cli.ts";
}
