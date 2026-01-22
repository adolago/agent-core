import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config/config.js";
import { shouldLogVerbose } from "../globals.js";
import { DEFAULT_LOG_DIR } from "../logging.js";

export type WideEventPayloadPolicy = "summary" | "debug" | "full";

export type WideEventConfig = {
  enabled?: boolean;
  file?: string;
  sampleRate?: number;
  slowMs?: number;
  payloads?: WideEventPayloadPolicy;
};

export type WideEvent = {
  ts: string;
  service: string;
  traceId: string;
  requestId: string;
  method: string;
  connId?: string;
  remoteAddr?: string;
  client?: {
    name?: string;
    mode?: string;
    version?: string;
  };
  sessionId?: string;
  runId?: string;
  persona?: string;
  provider?: string;
  model?: string;
  request?: Record<string, unknown>;
  outcome?: "ok" | "error";
  error?: { code?: string; message?: string };
  durationMs?: number;
  slow?: boolean;
  debug?: boolean;
  sample?: { kept: boolean; reason: string; rate?: number };
  meta?: Record<string, unknown>;
};

type WideEventContext = {
  event: WideEvent;
  startMs: number;
  debug: boolean;
  payloadPolicy: WideEventPayloadPolicy;
  finished: boolean;
};

const storage = new AsyncLocalStorage<WideEventContext>();
const writesByPath = new Map<string, Promise<void>>();
const DEFAULT_SAMPLE_RATE = 0.02;
const DEFAULT_SLOW_MS = 2000;

function resolveWideEventFile(): string {
  const today = new Date().toISOString().slice(0, 10);
  return path.join(DEFAULT_LOG_DIR, `zee-wide-${today}.jsonl`);
}

function resolveWideEventSettings(): Required<WideEventConfig> {
  const logging = loadConfig().logging;
  const cfg = logging?.wideEvents;
  return {
    enabled: cfg?.enabled ?? true,
    file: cfg?.file ?? resolveWideEventFile(),
    sampleRate:
      typeof cfg?.sampleRate === "number"
        ? cfg.sampleRate
        : DEFAULT_SAMPLE_RATE,
    slowMs: typeof cfg?.slowMs === "number" ? cfg.slowMs : DEFAULT_SLOW_MS,
    payloads: cfg?.payloads ?? "debug",
  };
}

export function areWideEventsEnabled(): boolean {
  return resolveWideEventSettings().enabled;
}

export function resolveWideEventPolicy(): WideEventPayloadPolicy {
  return resolveWideEventSettings().payloads;
}

export function getWideEventLogPath(): string {
  return resolveWideEventSettings().file;
}

export async function emitWideEvent(params: {
  event: WideEvent;
  ok: boolean;
  durationMs: number;
  error?: { code?: string; message?: string } | Error;
  debug?: boolean;
  meta?: Record<string, unknown>;
}) {
  const settings = resolveWideEventSettings();
  if (!settings.enabled) return;
  const durationMs = params.durationMs;
  const debug = params.debug ?? false;
  const event: WideEvent = {
    ...params.event,
    durationMs,
    outcome: params.ok ? "ok" : "error",
    slow: durationMs >= settings.slowMs,
    debug,
    meta: params.meta
      ? { ...params.event.meta, ...params.meta }
      : params.event.meta,
  };
  if (params.error) {
    const err =
      params.error instanceof Error
        ? { message: params.error.message }
        : params.error;
    event.error = {
      code: err.code,
      message: err.message,
    };
  }
  const decision = (() => {
    if (debug) return { kept: true, reason: "debug" };
    if (event.outcome === "error") return { kept: true, reason: "error" };
    if (durationMs >= settings.slowMs) return { kept: true, reason: "slow" };
    const rate = Math.max(0, Math.min(1, settings.sampleRate));
    return { kept: Math.random() < rate, reason: "sample", rate };
  })();
  event.sample = {
    kept: decision.kept,
    reason: decision.reason,
    rate: decision.rate,
  };
  if (!decision.kept) return;
  const line = `${JSON.stringify(event)}\n`;
  try {
    await appendWideEventLine(settings.file, line);
  } catch (err) {
    // ignore logging failures, but leave a breadcrumb for debugging
    try {
      const note = `${new Date().toISOString()} emitWideEvent failed: ${
        err instanceof Error ? err.message : String(err)
      }\n`;
      await appendWideEventLine(`${settings.file}.errors`, note);
    } catch {
      // ignore secondary logging failures
    }
  }
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function summarizeText(
  value: string,
  opts: { debug: boolean; policy: WideEventPayloadPolicy },
): Record<string, unknown> {
  const trimmed = value.trim();
  const summary: Record<string, unknown> = {
    length: trimmed.length,
    hash: hashValue(trimmed),
  };
  if (opts.policy === "full" || (opts.policy === "debug" && opts.debug)) {
    summary.preview = trimmed.slice(0, 240);
  }
  return summary;
}

function summarizeMediaUrl(value: string) {
  try {
    const url = new URL(value);
    return {
      host: url.host,
      pathHash: hashValue(url.pathname),
    };
  } catch {
    return { host: "invalid", pathHash: hashValue(value) };
  }
}

export function extractTraceId(params?: Record<string, unknown>): string {
  const traceId =
    typeof params?.traceId === "string" && params.traceId.trim()
      ? params.traceId.trim()
      : undefined;
  return traceId ?? randomUUID();
}

export function extractDebugFlag(params?: Record<string, unknown>): boolean {
  if (shouldLogVerbose()) return true;
  const debug =
    params && typeof params.debug === "boolean" ? params.debug : undefined;
  const verbose =
    params && typeof params.verbose === "boolean" ? params.verbose : undefined;
  return Boolean(debug || verbose);
}

export function summarizeGatewayParams(
  params: Record<string, unknown> | undefined,
  opts: { debug: boolean; policy: WideEventPayloadPolicy },
): { summary: Record<string, unknown>; extracted: Partial<WideEvent> } {
  const record = params ?? {};
  const keys = Object.keys(record).sort();
  const pick = (key: string) =>
    typeof record[key] === "string" && record[key]?.trim()
      ? String(record[key]).trim()
      : undefined;

  const sessionId = pick("sessionId");
  const runId = pick("runId") ?? pick("idempotencyKey");
  const persona = pick("persona");
  const provider = pick("provider");
  const model = pick("model");
  const accountId = pick("accountId");
  const to = pick("to");
  const chatId = pick("chatId") ?? pick("threadId") ?? pick("channelId");
  const message = pick("message") ?? pick("prompt");
  const extraSystemPrompt = pick("extraSystemPrompt");
  const mediaUrl = pick("mediaUrl");

  const summary: Record<string, unknown> = {
    keys,
  };
  if (accountId) summary.accountId = accountId;
  if (to) summary.toHash = hashValue(to);
  if (chatId) summary.chatHash = hashValue(chatId);
  if (message) summary.message = summarizeText(message, opts);
  if (extraSystemPrompt)
    summary.extraSystemPrompt = summarizeText(extraSystemPrompt, opts);
  if (mediaUrl) summary.media = summarizeMediaUrl(mediaUrl);

  const extracted: Partial<WideEvent> = {
    sessionId,
    runId,
    persona,
    provider,
    model,
  };
  return { summary, extracted };
}

export function runWithWideEventContext<T>(
  init: Omit<WideEvent, "ts"> & { ts?: string },
  opts: { debug: boolean; payloadPolicy: WideEventPayloadPolicy },
  fn: () => Promise<T>,
): Promise<T> {
  const settings = resolveWideEventSettings();
  if (!settings.enabled) return fn();
  const ctx: WideEventContext = {
    event: {
      ts: init.ts ?? new Date().toISOString(),
      ...init,
      debug: opts.debug,
    },
    startMs: Date.now(),
    debug: opts.debug,
    payloadPolicy: opts.payloadPolicy,
    finished: false,
  };
  return storage.run(ctx, fn);
}

export function getWideEventContext(): WideEventContext | undefined {
  return storage.getStore();
}

export function addWideEventFields(fields: Partial<WideEvent>): void {
  const ctx = storage.getStore();
  if (!ctx || ctx.finished) return;
  ctx.event = {
    ...ctx.event,
    ...fields,
    request: {
      ...ctx.event.request,
      ...fields.request,
    },
    meta: {
      ...ctx.event.meta,
      ...fields.meta,
    },
  };
}

function shouldKeepEvent(ctx: WideEventContext, durationMs: number) {
  const settings = resolveWideEventSettings();
  if (ctx.debug) return { kept: true, reason: "debug" };
  if (ctx.event.outcome === "error") return { kept: true, reason: "error" };
  if (durationMs >= settings.slowMs) return { kept: true, reason: "slow" };
  const rate = Math.max(0, Math.min(1, settings.sampleRate));
  const kept = Math.random() < rate;
  return { kept, reason: "sample", rate };
}

async function appendWideEventLine(filePath: string, line: string) {
  const resolved = path.resolve(filePath);
  const prev = writesByPath.get(resolved) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(async () => {
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.appendFile(resolved, line, "utf8");
    });
  writesByPath.set(resolved, next);
  await next;
}

export async function finishWideEvent(params: {
  ok: boolean;
  error?: { code?: string; message?: string } | Error;
  meta?: Record<string, unknown>;
}) {
  const ctx = storage.getStore();
  if (!ctx || ctx.finished) return;
  ctx.finished = true;
  const durationMs = Date.now() - ctx.startMs;
  ctx.event.durationMs = durationMs;
  ctx.event.outcome = params.ok ? "ok" : "error";
  ctx.event.slow = durationMs >= resolveWideEventSettings().slowMs;
  if (params.meta && Object.keys(params.meta).length > 0) {
    ctx.event.meta = { ...ctx.event.meta, ...params.meta };
  }
  if (params.error) {
    const err =
      params.error instanceof Error
        ? { message: params.error.message }
        : params.error;
    ctx.event.error = {
      code: err.code,
      message: err.message,
    };
  }

  const decision = shouldKeepEvent(ctx, durationMs);
  ctx.event.sample = {
    kept: decision.kept,
    reason: decision.reason,
    rate: decision.rate,
  };
  if (!decision.kept) return;

  const settings = resolveWideEventSettings();
  const line = `${JSON.stringify(ctx.event)}\n`;
  try {
    await appendWideEventLine(settings.file, line);
  } catch (err) {
    // ignore logging failures, but leave a breadcrumb for debugging
    try {
      const note = `${new Date().toISOString()} finishWideEvent failed: ${
        err instanceof Error ? err.message : String(err)
      }\n`;
      await appendWideEventLine(`${settings.file}.errors`, note);
    } catch {
      // ignore secondary logging failures
    }
  }
}
