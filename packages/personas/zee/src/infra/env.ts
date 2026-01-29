import { createSubsystemLogger } from "../logging/subsystem.js";
import { parseBooleanValue } from "../utils/boolean.js";

const log = createSubsystemLogger("env");
const loggedEnv = new Set<string>();

type AcceptedEnvOption = {
  key: string;
  description: string;
  value?: string;
  redact?: boolean;
};

function formatEnvValue(value: string, redact?: boolean): string {
  if (redact) return "<redacted>";
  const singleLine = value.replace(/\s+/g, " ").trim();
  if (singleLine.length <= 160) return singleLine;
  return `${singleLine.slice(0, 160)}…`;
}

export function logAcceptedEnvOption(option: AcceptedEnvOption): void {
  if (process.env.VITEST || process.env.NODE_ENV === "test") return;
  if (loggedEnv.has(option.key)) return;
  const rawValue = option.value ?? process.env[option.key];
  if (!rawValue || !rawValue.trim()) return;
  loggedEnv.add(option.key);
  log.info(`env: ${option.key}=${formatEnvValue(rawValue, option.redact)} (${option.description})`);
}

export function normalizeZaiEnv(): void {
  if (!process.env.ZAI_API_KEY?.trim() && process.env.Z_AI_API_KEY?.trim()) {
    process.env.ZAI_API_KEY = process.env.Z_AI_API_KEY;
  }
}

export function isTruthyEnvValue(value?: string): boolean {
  return parseBooleanValue(value) === true;
}

function mirrorEnvPrefix(primary: string, legacyPrefixes: string[]): void {
  const env = process.env;
  const keys = Object.keys(env);

  for (const key of keys) {
    if (!key.startsWith(primary)) continue;
    const suffix = key.slice(primary.length);
    const value = env[key];
    if (!value?.trim()) continue;
    for (const legacyPrefix of legacyPrefixes) {
      const legacyKey = `${legacyPrefix}${suffix}`;
      if (!env[legacyKey]) env[legacyKey] = value;
    }
  }

  for (const key of keys) {
    for (const legacyPrefix of legacyPrefixes) {
      if (!key.startsWith(legacyPrefix)) continue;
      const suffix = key.slice(legacyPrefix.length);
      const primaryKey = `${primary}${suffix}`;
      if (!env[primaryKey] && env[key]?.trim()) {
        env[primaryKey] = env[key];
      }
    }
  }
}

export function normalizeEnv(): void {
  normalizeZaiEnv();
  mirrorEnvPrefix("ZEE_", ["MOLTBOT_", "CLAWDBOT_"]);
}
