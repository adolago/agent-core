#!/usr/bin/env npx tsx
/**
 * delegation CLI
 * 
 * Usage: npx tsx delegate-cli.ts --to <persona> --task <task> [--context <ctx>]
 */
import { delegate } from "./delegate.js";

const args = process.argv.slice(2);
function getArg(name: string) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const to = getArg("to");
const task = getArg("task");
const context = getArg("context");

if (!to || !task) {
  console.error("Usage: delegate-cli.ts --to <persona> --task <task>");
  process.exit(1);
}

delegate(to, task, context).catch(() => process.exit(1));
