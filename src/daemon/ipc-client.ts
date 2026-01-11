import { connect } from "node:net";
import { randomUUID } from "node:crypto";
import { resolveIpcSocketPath, type DaemonResponse } from "./ipc";
import { TIMEOUT_IPC_MS } from "../config/constants";

interface RequestOptions {
  socketPath?: string;
  timeoutMs?: number;
}

export async function requestDaemon<T = unknown>(
  method: string,
  params?: Record<string, unknown>,
  options: RequestOptions = {}
): Promise<T> {
  const socketPath = options.socketPath ?? resolveIpcSocketPath();
  const timeoutMs = options.timeoutMs ?? TIMEOUT_IPC_MS;
  const requestId = randomUUID();

  return await new Promise<T>((resolve, reject) => {
    const socket = connect(socketPath);
    let buffer = "";
    let done = false;

    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      socket.destroy();
      reject(new Error("IPC request timed out"));
    }, timeoutMs);

    socket.setEncoding("utf8");

    socket.on("connect", () => {
      const payload = {
        id: requestId,
        method,
        params,
      };
      socket.write(`${JSON.stringify(payload)}\n`);
    });

    socket.on("data", (chunk) => {
      buffer += chunk;
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;

        let response: DaemonResponse<T>;
        try {
          response = JSON.parse(line) as DaemonResponse<T>;
        } catch {
          continue;
        }

        if (response.id !== requestId) {
          continue;
        }

        if (done) return;
        done = true;
        clearTimeout(timeout);
        socket.end();

        if (!response.ok) {
          reject(new Error(response.error ?? "IPC request failed"));
          return;
        }

        resolve(response.result as T);
      }
    });

    socket.on("error", (err) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      reject(err);
    });
  });
}
