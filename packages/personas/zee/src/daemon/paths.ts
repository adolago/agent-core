import fs from "node:fs";
import path from "node:path";

import { resolveGatewayProfileSuffix } from "./constants.js";

const windowsAbsolutePath = /^[a-zA-Z]:[\\/]/;
const windowsUncPath = /^\\\\/;

export function resolveHomeDir(env: Record<string, string | undefined>): string {
  const home = env.HOME?.trim() || env.USERPROFILE?.trim();
  if (!home) throw new Error("Missing HOME");
  return home;
}

export function resolveUserPathWithHome(input: string, home?: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) {
    if (!home) throw new Error("Missing HOME");
    const expanded = trimmed.replace(/^~(?=$|[\\/])/, home);
    return path.resolve(expanded);
  }
  if (windowsAbsolutePath.test(trimmed) || windowsUncPath.test(trimmed)) {
    return trimmed;
  }
  return path.resolve(trimmed);
}

export function resolveGatewayStateDir(env: Record<string, string | undefined>): string {
  const override =
    env.ZEE_STATE_DIR?.trim() || env.MOLTBOT_STATE_DIR?.trim() || env.CLAWDBOT_STATE_DIR?.trim();
  if (override) {
    const home = override.startsWith("~") ? resolveHomeDir(env) : undefined;
    return resolveUserPathWithHome(override, home);
  }
  const home = resolveHomeDir(env);
  const profile = env.ZEE_PROFILE ?? env.MOLTBOT_PROFILE ?? env.CLAWDBOT_PROFILE;
  const suffix = resolveGatewayProfileSuffix(profile);
  const preferred = path.join(home, `.zee${suffix}`);
  if (fs.existsSync(preferred)) return preferred;
  const legacyClawdbot = path.join(home, `.clawdbot${suffix}`);
  if (fs.existsSync(legacyClawdbot)) return legacyClawdbot;
  const legacyMoltbot = path.join(home, `.moltbot${suffix}`);
  if (fs.existsSync(legacyMoltbot)) return legacyMoltbot;
  return preferred;
}
