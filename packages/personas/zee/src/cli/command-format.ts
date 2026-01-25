import { normalizeProfileName } from "./profile-utils.js";

const CLI_PREFIX_RE = /^(?:pnpm|npm|bunx|npx)\s+zee\b|^zee\b/;
const PROFILE_FLAG_RE = /(?:^|\s)--profile(?:\s|=|$)/;
const DEV_FLAG_RE = /(?:^|\s)--dev(?:\s|$)/;

export function formatCliCommand(
  command: string,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string {
  const profile = normalizeProfileName(env.ZEE_PROFILE);
  if (!profile) return command;
  if (!CLI_PREFIX_RE.test(command)) return command;
  if (PROFILE_FLAG_RE.test(command) || DEV_FLAG_RE.test(command)) return command;
  return command.replace(CLI_PREFIX_RE, (match) => `${match} --profile ${profile}`);
}
