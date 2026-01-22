import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { rawDataToString } from "../infra/ws.js";
import { logDebug, logError } from "../logger.js";
import {
  type ConnectParams,
  type EventFrame,
  type HelloOk,
  PROTOCOL_VERSION,
  type RequestFrame,
  validateEventFrame,
  validateRequestFrame,
  validateResponseFrame,
} from "./protocol/index.js";

/** Error class for gateway-specific errors with additional context */
export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: GatewayError | Error) => void;
  expectFinal: boolean;
  method: string; // Track which method this request is for
  startTime: number; // Track when the request was made
};

export type GatewayClientOptions = {
  url?: string; // ws://127.0.0.1:18789
  token?: string;
  password?: string;
  instanceId?: string;
  clientName?: string;
  clientVersion?: string;
  platform?: string;
  mode?: string;
  minProtocol?: number;
  maxProtocol?: number;
  onEvent?: (evt: EventFrame) => void;
  onHelloOk?: (hello: HelloOk) => void;
  onClose?: (code: number, reason: string) => void;
  onGap?: (info: { expected: number; received: number }) => void;
};

export const GATEWAY_CLOSE_CODE_HINTS: Readonly<Record<number, string>> = {
  1000: "normal closure",
  1006: "abnormal closure (no close frame)",
  1008: "policy violation",
  1012: "service restart",
};

export function describeGatewayCloseCode(code: number): string | undefined {
  return GATEWAY_CLOSE_CODE_HINTS[code];
}

export class GatewayClient {
  private ws: WebSocket | null = null;
  private opts: GatewayClientOptions;
  private pending = new Map<string, Pending>();
  private backoffMs = 1000;
  private closed = false;
  private lastSeq: number | null = null;
  // Track last tick to detect silent stalls.
  private lastTick: number | null = null;
  private tickIntervalMs = 30_000;
  private tickTimer: NodeJS.Timeout | null = null;
  // Reconnection tracking
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10; // Maximum reconnection attempts before giving up

  constructor(opts: GatewayClientOptions) {
    this.opts = opts;
  }

  /** Reset reconnection counter (call after successful connection) */
  private resetReconnectCount(): void {
    this.reconnectAttempts = 0;
  }

  start() {
    if (this.closed) return;
    const url = this.opts.url ?? "ws://127.0.0.1:18789";
    // Allow node screen snapshots and other large responses.
    this.ws = new WebSocket(url, { maxPayload: 25 * 1024 * 1024 });

    this.ws.on("open", () => this.sendConnect());
    this.ws.on("message", (data) => this.handleMessage(rawDataToString(data)));
    // Track ping activity for staleness detection (ws library auto-responds with pong)
    this.ws.on("ping", () => {
      this.lastTick = Date.now();
    });
    this.ws.on("close", (code, reason) => {
      const reasonText = rawDataToString(reason);
      this.ws = null;
      this.flushPendingErrors(
        new Error(`gateway closed (${code}): ${reasonText}`),
      );
      this.scheduleReconnect();
      this.opts.onClose?.(code, reasonText);
    });
    this.ws.on("error", (err) => {
      logDebug(`gateway client error: ${String(err)}`);
    });
  }

  stop() {
    this.closed = true;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.flushPendingErrors(new Error("gateway client stopped"));
  }

  private sendConnect() {
    const auth =
      this.opts.token || this.opts.password
        ? {
            token: this.opts.token,
            password: this.opts.password,
          }
        : undefined;
    const params: ConnectParams = {
      minProtocol: this.opts.minProtocol ?? PROTOCOL_VERSION,
      maxProtocol: this.opts.maxProtocol ?? PROTOCOL_VERSION,
      client: {
        name: this.opts.clientName ?? "gateway-client",
        version: this.opts.clientVersion ?? "dev",
        platform: this.opts.platform ?? process.platform,
        mode: this.opts.mode ?? "backend",
        instanceId: this.opts.instanceId,
      },
      caps: [],
      auth,
    };

    void this.request<HelloOk>("connect", params)
      .then((helloOk) => {
        this.backoffMs = 1000;
        this.resetReconnectCount(); // Reset reconnect counter on successful connection
        this.tickIntervalMs =
          typeof helloOk.policy?.tickIntervalMs === "number"
            ? helloOk.policy.tickIntervalMs
            : 30_000;
        this.lastTick = Date.now();
        this.startTickWatch();
        this.opts.onHelloOk?.(helloOk);
      })
      .catch((err) => {
        const msg = `gateway connect failed: ${String(err)}`;
        if (this.opts.mode === "probe") logDebug(msg);
        else logError(msg);
        this.ws?.close(1008, "connect failed");
      });
  }

  private handleMessage(raw: string) {
    try {
      const parsed = JSON.parse(raw);
      if (validateEventFrame(parsed)) {
        const evt = parsed as EventFrame;
        const seq = typeof evt.seq === "number" ? evt.seq : null;
        if (seq !== null) {
          if (this.lastSeq !== null && seq > this.lastSeq + 1) {
            this.opts.onGap?.({ expected: this.lastSeq + 1, received: seq });
          }
          this.lastSeq = seq;
        }
        if (evt.event === "tick") {
          this.lastTick = Date.now();
        }
        this.opts.onEvent?.(evt);
        return;
      }
      if (validateResponseFrame(parsed)) {
        const pending = this.pending.get(parsed.id);
        if (!pending) return;
        // If the payload is an ack with status accepted, keep waiting for final.
        const payload = parsed.payload as { status?: unknown } | undefined;
        const status = payload?.status;
        if (pending.expectFinal && status === "accepted") {
          return;
        }
        this.pending.delete(parsed.id);
        if (parsed.ok) pending.resolve(parsed.payload);
        else
          pending.reject(new Error(parsed.error?.message ?? "unknown error"));
        return;
      }
      // Log unrecognized message format (not a parse error, but unknown frame type)
      logDebug(
        `gateway client received unrecognized frame type: ${raw.slice(0, 100)}`,
      );
    } catch (err) {
      // JSON parse errors are logged with context for debugging
      const errMsg = err instanceof Error ? err.message : String(err);
      const preview = raw.length > 50 ? `${raw.slice(0, 50)}...` : raw;
      logError(
        `gateway client parse error: ${errMsg} (message preview: ${preview})`,
      );
    }
  }

  private scheduleReconnect() {
    if (this.closed) return;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    // Check max reconnection attempts
    this.reconnectAttempts++;
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      logError(
        `gateway client exceeded max reconnection attempts (${this.maxReconnectAttempts}), giving up`,
      );
      this.flushPendingErrors(
        new Error(
          `max reconnection attempts exceeded (${this.maxReconnectAttempts})`,
        ),
      );
      return;
    }

    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
    logDebug(
      `gateway client reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
    );
    setTimeout(() => this.start(), delay).unref();
  }

  private flushPendingErrors(err: Error | GatewayError) {
    const now = Date.now();
    for (const [id, p] of this.pending) {
      const elapsed = now - p.startTime;
      const gatewayErr = new GatewayError(
        `${err.message} (method: ${p.method}, elapsed: ${elapsed}ms)`,
        err instanceof GatewayError ? err.code : "CONNECTION_LOST",
        { requestId: id, method: p.method, elapsed },
      );
      p.reject(gatewayErr);
    }
    this.pending.clear();
  }

  private startTickWatch() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    const interval = Math.max(this.tickIntervalMs, 1000);
    this.tickTimer = setInterval(() => {
      if (this.closed) return;
      if (!this.lastTick) return;
      const gap = Date.now() - this.lastTick;
      if (gap > this.tickIntervalMs * 2) {
        this.ws?.close(4000, "tick timeout");
      }
    }, interval);
  }

  async request<T = unknown>(
    method: string,
    params?: unknown,
    opts?: { expectFinal?: boolean },
  ): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new GatewayError("gateway not connected", "NOT_CONNECTED");
    }
    const id = randomUUID();
    const frame: RequestFrame = { type: "req", id, method, params };
    if (!validateRequestFrame(frame)) {
      throw new GatewayError(
        `invalid request frame: ${JSON.stringify(validateRequestFrame.errors, null, 2)}`,
        "INVALID_FRAME",
        validateRequestFrame.errors,
      );
    }
    const expectFinal = opts?.expectFinal === true;
    const p = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        method,
        startTime: Date.now(),
        expectFinal,
      });
    });
    this.ws.send(JSON.stringify(frame));
    return p;
  }
}
