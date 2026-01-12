import { createServer, type Server, type Socket } from "node:net";
import { dirname } from "node:path";
import { mkdirSync, existsSync, unlinkSync } from "node:fs";
import type { DaemonRequest, DaemonResponse } from "./ipc";

type RequestHandler = (request: DaemonRequest) => Promise<unknown>;

interface IpcServerOptions {
  socketPath: string;
  handleRequest: RequestHandler;
  log?: (level: string, message: string) => void;
}

export class DaemonIpcServer {
  private server?: Server;
  private socketPath: string;
  private handleRequest: RequestHandler;
  private log: (level: string, message: string) => void;

  constructor(options: IpcServerOptions) {
    this.socketPath = options.socketPath;
    this.handleRequest = options.handleRequest;
    this.log = options.log ?? (() => undefined);
  }

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    const socketDir = dirname(this.socketPath);
    mkdirSync(socketDir, { recursive: true });
    if (existsSync(this.socketPath)) {
      unlinkSync(this.socketPath);
    }

    this.server = createServer((socket) => {
      this.log("debug", "IPC client connected");
      this.handleSocket(socket);
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.on("error", (err) => reject(err));
      this.server!.listen(this.socketPath, () => resolve());
    });

    this.log("info", `IPC server listening at ${this.socketPath}`);
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.server!.close(() => resolve());
    });
    this.server = undefined;

    if (existsSync(this.socketPath)) {
      unlinkSync(this.socketPath);
    }

    this.log("info", "IPC server stopped");
  }

  private handleSocket(socket: Socket): void {
    let buffer = "";
    socket.setEncoding("utf8");

    const cleanup = () => {
      buffer = ""; // Clear buffer to prevent memory leak
    };

    socket.on("data", (chunk) => {
      buffer += chunk;
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        this.handleLine(line, socket).catch((err) => {
          this.log("error", `IPC handler error: ${err instanceof Error ? err.message : String(err)}`);
        });
      }
    });

    socket.on("error", (err) => {
      this.log("error", `IPC socket error: ${err.message}`);
      cleanup();
      if (!socket.destroyed) {
        socket.destroy();
      }
    });

    socket.on("close", () => {
      this.log("debug", "IPC client disconnected");
      cleanup();
    });
  }

  private safeWrite(socket: Socket, data: string): boolean {
    if (socket.destroyed || !socket.writable) {
      this.log("warn", "Attempted to write to closed/destroyed socket");
      return false;
    }
    try {
      return socket.write(data);
    } catch (err) {
      this.log("error", `Socket write error: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  private async handleLine(line: string, socket: Socket): Promise<void> {
    let request: DaemonRequest | undefined;
    try {
      request = JSON.parse(line) as DaemonRequest;
    } catch (err) {
      const response: DaemonResponse = {
        id: "unknown",
        ok: false,
        error: "Invalid JSON request",
      };
      this.safeWrite(socket, `${JSON.stringify(response)}\n`);
      return;
    }

    try {
      const result = await this.handleRequest(request);
      const response: DaemonResponse = {
        id: request.id,
        ok: true,
        result,
      };
      this.safeWrite(socket, `${JSON.stringify(response)}\n`);
    } catch (err) {
      const response: DaemonResponse = {
        id: request.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
      this.safeWrite(socket, `${JSON.stringify(response)}\n`);
    }
  }
}
