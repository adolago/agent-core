/**
 * @file Pretty Formatter
 * @description Human-readable colored log output for terminals
 */

import type { IFormatter, LogEntry, LogLevel } from "../types";

const LEVEL_COLORS: Record<LogLevel, string> = {
  trace: "\x1b[90m",  // Gray
  debug: "\x1b[36m",  // Cyan
  info: "\x1b[32m",   // Green
  warn: "\x1b[33m",   // Yellow
  error: "\x1b[31m",  // Red
  fatal: "\x1b[35m",  // Magenta
};

const LEVEL_LABELS: Record<LogLevel, string> = {
  trace: "TRC",
  debug: "DBG",
  info: "INF",
  warn: "WRN",
  error: "ERR",
  fatal: "FTL",
};

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

export class PrettyFormatter implements IFormatter {
  private useColors: boolean;

  constructor(options: { colors?: boolean } = {}) {
    this.useColors = options.colors ?? process.stdout.isTTY ?? false;
  }

  format(entry: LogEntry): string {
    const parts: string[] = [];

    // Timestamp (HH:MM:SS.mmm)
    const time = new Date(entry.timestamp);
    const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}:${time.getSeconds().toString().padStart(2, "0")}.${time.getMilliseconds().toString().padStart(3, "0")}`;
    parts.push(this.dim(timeStr));

    // Level
    const levelColor = LEVEL_COLORS[entry.level];
    const levelLabel = LEVEL_LABELS[entry.level];
    parts.push(this.color(levelLabel, levelColor));

    // Component
    if (entry.component) {
      parts.push(this.dim(`[${entry.component}]`));
    }

    // Message
    parts.push(entry.message);

    // Correlation ID (abbreviated)
    if (entry.correlationId) {
      const shortId = entry.correlationId.slice(-8);
      parts.push(this.dim(`(${shortId})`));
    }

    // Metadata
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      const metaStr = Object.entries(entry.metadata)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(" ");
      parts.push(this.dim(metaStr));
    }

    // Duration
    if (entry.durationMs !== undefined) {
      parts.push(this.dim(`${entry.durationMs}ms`));
    }

    let output = parts.join(" ");

    // Error stack
    if (entry.error?.stack) {
      output += "\n" + this.color(entry.error.stack, LEVEL_COLORS.error);
    }

    return output;
  }

  private color(text: string, color: string): string {
    if (!this.useColors) return text;
    return `${color}${text}${RESET}`;
  }

  private dim(text: string): string {
    if (!this.useColors) return text;
    return `${DIM}${text}${RESET}`;
  }
}
