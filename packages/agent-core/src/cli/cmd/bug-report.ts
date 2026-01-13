/**
 * @file CLI Bug Report Command
 * @description CLI entry point for crash report generation
 */

import { Command } from "commander";
import * as readline from "readline";
import { ReportGenerator } from "../../crash-report/report-generator";

export function createBugReportCommand(): Command {
  return new Command("bug-report")
    .alias("report")
    .description("Generate a crash report for debugging")
    .option("--include-session", "Include session conversation data (requires consent)", false)
    .option("--log-lines <count>", "Number of log lines to include", "500")
    .option("-o, --output <path>", "Output path for the report archive")
    .option("--skip-diagnostics", "Skip running health checks", false)
    .option(
      "--anonymization <level>",
      "Anonymization level: minimal, standard, aggressive",
      "standard"
    )
    .option("-y, --non-interactive", "Skip interactive prompts", false)
    .action(async (options) => {
      try {
        // Validate anonymization level
        const validLevels = ["minimal", "standard", "aggressive"];
        if (!validLevels.includes(options.anonymization)) {
          console.error(`Invalid anonymization level. Choose: ${validLevels.join(", ")}`);
          process.exit(2);
        }

        // Session consent prompt
        let includeSession = options.includeSession;
        if (options.includeSession && !options.nonInteractive) {
          includeSession = await promptConsent(
            "Include session data? This may contain conversation content. (y/N): "
          );
        }

        // Generate report
        const generator = new ReportGenerator({
          includeSession,
          logLines: parseInt(options.logLines, 10),
          outputPath: options.output,
          skipDiagnostics: options.skipDiagnostics,
          anonymization: options.anonymization as "minimal" | "standard" | "aggressive",
          nonInteractive: options.nonInteractive,
        });

        const { archivePath } = await generator.generate();

        // Success message
        console.log("\n📎 Next steps:");
        console.log("   1. Review the report contents for any remaining sensitive data");
        console.log("   2. Create a GitHub issue at https://github.com/your-org/agent-core/issues");
        console.log("   3. Attach the report archive to the issue");
        console.log(`\n   Archive: ${archivePath}\n`);

        process.exit(0);
      } catch (error) {
        console.error(
          "Report generation failed:",
          error instanceof Error ? error.message : String(error)
        );
        process.exit(2);
      }
    });
}

async function promptConsent(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

// Help examples
export const bugReportExamples = `
Examples:
  $ agent-core bug-report                     # Generate basic report
  $ agent-core bug-report --include-session   # Include session data (with consent)
  $ agent-core bug-report --log-lines 1000    # Include more log history
  $ agent-core bug-report -o ~/report.tar.gz  # Custom output path
  $ agent-core bug-report --anonymization aggressive  # Maximum privacy

Anonymization Levels:
  minimal    - Only redact API keys
  standard   - Redact keys, credentials, and usernames in paths
  aggressive - Also redact emails, phone numbers, IPs
`;
