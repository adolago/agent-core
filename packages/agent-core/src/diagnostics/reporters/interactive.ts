/**
 * @file Interactive Reporter
 * @description TTY-friendly colored output for health check results
 */

import type { CheckReport, CheckResult, CheckCategory } from "../types";

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

const ICONS = {
  pass: `${colors.green}✓${colors.reset}`,
  warn: `${colors.yellow}⚠${colors.reset}`,
  fail: `${colors.red}✗${colors.reset}`,
  skip: `${colors.gray}○${colors.reset}`,
};

const CATEGORY_NAMES: Record<CheckCategory, string> = {
  runtime: "Core Runtime",
  config: "Configuration",
  providers: "Providers",
  integrity: "Integrity",
};

export class InteractiveReporter {
  private verbose: boolean;
  private useColors: boolean;

  constructor(options: { verbose?: boolean; colors?: boolean } = {}) {
    this.verbose = options.verbose || false;
    this.useColors = options.colors ?? process.stdout.isTTY ?? false;
  }

  format(report: CheckReport): string {
    const lines: string[] = [];
    const c = this.useColors ? colors : { reset: "", bold: "", dim: "", green: "", yellow: "", red: "", cyan: "", gray: "" };
    const icons = this.useColors ? ICONS : { pass: "[PASS]", warn: "[WARN]", fail: "[FAIL]", skip: "[SKIP]" };

    lines.push("");
    lines.push(`${c.bold}Agent-Core Health Check${c.reset}`);
    lines.push(`${c.gray}${"═".repeat(50)}${c.reset}`);
    lines.push("");

    for (const cat of ["runtime", "config", "providers", "integrity"] as CheckCategory[]) {
      const summary = report.categories[cat];
      if (summary.total === 0) continue;

      const icon = summary.status === "ok" ? icons.pass : summary.status === "warning" ? icons.warn : icons.fail;
      lines.push(`${icon} ${c.bold}${CATEGORY_NAMES[cat]}${c.reset}`);

      for (const check of summary.checks) {
        const checkIcon = icons[check.status];
        lines.push(`   ${checkIcon} ${check.name}: ${check.message}`);

        if (this.verbose && check.details) {
          for (const detail of check.details.split("\n")) {
            lines.push(`      ${c.gray}${detail}${c.reset}`);
          }
        }
      }
      lines.push("");
    }

    if (report.fixes.length > 0) {
      lines.push(`${c.cyan}🔧 Auto-fixed${c.reset}`);
      for (const fix of report.fixes) {
        const icon = fix.success ? icons.pass : icons.fail;
        lines.push(`   ${icon} ${fix.message}`);
      }
      lines.push("");
    }

    const { passed, warnings, failed, skipped } = report.summary;
    lines.push(`${c.gray}${"─".repeat(50)}${c.reset}`);

    const parts = [];
    if (passed > 0) parts.push(`${c.green}${passed} passed${c.reset}`);
    if (warnings > 0) parts.push(`${c.yellow}${warnings} warnings${c.reset}`);
    if (failed > 0) parts.push(`${c.red}${failed} failed${c.reset}`);
    if (skipped > 0) parts.push(`${c.gray}${skipped} skipped${c.reset}`);

    lines.push(`Summary: ${parts.join(", ")}`);
    lines.push(`${c.gray}Completed in ${report.durationMs}ms${c.reset}`);
    lines.push("");

    return lines.join("\n");
  }
}
