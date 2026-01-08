import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_IPC_SOCKET = join(
  homedir(),
  ".zee",
  "agent-core",
  "daemon.sock"
);

export function resolveIpcSocketPath(): string {
  return process.env.AGENT_CORE_IPC_SOCKET || DEFAULT_IPC_SOCKET;
}

export interface DaemonRequest {
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface DaemonResponse<T = unknown> {
  id: string;
  ok: boolean;
  result?: T;
  error?: string;
}
