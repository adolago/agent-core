#!/usr/bin/env node
import process from "node:process";

import { applyCliProfileEnv, parseCliProfileArgs } from "./cli/profile.js";

const parsed = parseCliProfileArgs(process.argv);
if (!parsed.ok) {
  // Keep it simple; Commander will handle rich help/errors after we strip flags.
  console.error(`[zee] ${parsed.error}`);
  process.exit(2);
}

if (parsed.profile) {
  applyCliProfileEnv({ profile: parsed.profile });
}

// Always use the sanitized argv (strips leading "--" from pnpm, removes profile flags).
process.argv = parsed.argv;

const { runCli } = await import("./cli/run-main.js");
await runCli(parsed.argv);
