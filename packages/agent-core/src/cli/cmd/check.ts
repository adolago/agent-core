/**
 * @file CLI Check Command
 * @description CLI entry point for health checks
 */

import { Command } from "commander";
import { CheckEngine } from "../../diagnostics/check-engine";
import { InteractiveReporter } from "../../diagnostics/reporters/interactive";
import { JsonReporter } from "../../diagnostics/reporters/json";
import { MinimalReporter } from "../../diagnostics/reporters/minimal";
import type { CheckCategory } from "../../diagnostics/types";

export function createCheckCommand(): Command {
  return new Command("check")
    .description("Run diagnostic health checks")
    .option("--full", "Run extended checks (slower but more thorough)", false)
    .option("--fix", "Attempt to auto-fix detected issues", false)
    .option("--json", "Output in JSON format for scripting", false)
    .option("--minimal", "Single-line output for scripts", false)
    .option("-v, --verbose", "Show detailed output including check details", false)
    .option("--timeout <ms>", "Timeout per category in milliseconds", "10000")
    .option(
      "--category <names...>",
      "Run only specific categories (runtime, config, providers, integrity)"
    )
    .option("--skip <ids...>", "Skip specific check IDs")
    .option("--no-color", "Disable colored output")
    .action(async (options) => {
      try {
        // Parse categories
        let categories: CheckCategory[] | undefined;
        if (options.category) {
          const validCategories = ["runtime", "config", "providers", "integrity"];
          categories = options.category.filter((c: string) =>
            validCategories.includes(c)
          ) as CheckCategory[];

          if (categories.length === 0) {
            console.error(
              `Invalid categories. Valid options: ${validCategories.join(", ")}`
            );
            process.exit(2);
          }
        }

        // Create engine with options
        const engine = new CheckEngine({
          full: options.full,
          fix: options.fix,
          verbose: options.verbose,
          timeout: parseInt(options.timeout, 10),
          categories,
          skip: options.skip,
        });

        // Run checks
        const report = await engine.runAll();

        // Output based on format
        if (options.json) {
          const reporter = new JsonReporter();
          console.log(reporter.format(report));
        } else if (options.minimal) {
          const reporter = new MinimalReporter();
          console.log(reporter.format(report));
        } else {
          const reporter = new InteractiveReporter({
            verbose: options.verbose,
            colors: options.color !== false,
          });
          console.log(reporter.format(report));
        }

        // Exit with appropriate code
        if (report.summary.failed > 0) {
          process.exit(1);
        }
        process.exit(0);
      } catch (error) {
        console.error(
          "Health check failed:",
          error instanceof Error ? error.message : String(error)
        );
        process.exit(2);
      }
    });
}

// Help examples
export const checkExamples = `
Examples:
  $ agent-core check                    # Run basic health checks
  $ agent-core check --full             # Run all checks including extended
  $ agent-core check --fix              # Auto-fix repairable issues
  $ agent-core check --json             # Output as JSON for CI
  $ agent-core check --category runtime # Check only runtime category
  $ agent-core check --skip runtime.disk-space  # Skip specific check
  $ agent-core check --verbose          # Show detailed output

Check Categories:
  runtime    - Bun version, directories, disk, memory
  config     - Configuration validation, deprecated options
  providers  - AI provider connectivity (Anthropic, OpenAI, Gemini, Ollama)
  integrity  - Lock files, processes, session files

Exit Codes:
  0 - All checks passed
  1 - One or more checks failed
  2 - Command error (invalid args, etc.)
`;
