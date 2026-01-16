import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { getZeeCodexbarConfig, type ZeeCodexbarConfig } from "../../config/runtime";
import { getSafeEnv } from "../../util/safe-env";

export type CodexbarConfigResolved = {
  enabled: boolean;
  command: string;
  baseArgs: string[];
  timeoutMs?: number;
  error?: string;
};

export type CodexbarRunResult = {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};

function parseTimeoutMs(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function resolveCodexbarConfig(): CodexbarConfigResolved {
  const config: ZeeCodexbarConfig = getZeeCodexbarConfig();
  const enabled = config.enabled === true;
  const commandConfig = config.command ?? process.env.CODEXBAR_COMMAND ?? "codexbar";
  const timeoutMs =
    config.timeoutMs ?? parseTimeoutMs(process.env.CODEXBAR_TIMEOUT_MS);

  const command = Array.isArray(commandConfig) ? commandConfig[0] : commandConfig;
  const baseArgs = Array.isArray(commandConfig) ? commandConfig.slice(1) : [];

  if (path.isAbsolute(command) && !existsSync(command)) {
    return {
      enabled,
      command,
      baseArgs,
      timeoutMs,
      error: `CodexBar CLI not found at ${command}`,
    };
  }

  return { enabled, command, baseArgs, timeoutMs };
}

export function runCodexbar(
  args: string[],
  config: CodexbarConfigResolved,
  timeoutMs?: number,
): CodexbarRunResult {
  const result = spawnSync(config.command, [...config.baseArgs, ...args], {
    encoding: "utf-8",
    env: getSafeEnv(),
    timeout: timeoutMs ?? config.timeoutMs ?? 10000,
  });

  if (result.error) {
    const error = result.error as NodeJS.ErrnoException;
    const message =
      error.code === "ENOENT"
        ? `CodexBar CLI not found. Ensure "codexbar" is on PATH or set zee.codexbar.command.`
        : error.message;
    return {
      ok: false,
      status: result.status,
      stdout: result.stdout?.toString() ?? "",
      stderr: result.stderr?.toString() ?? "",
      error: message,
    };
  }

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
  };
}
