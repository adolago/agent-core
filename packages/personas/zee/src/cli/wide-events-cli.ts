import fs from "node:fs/promises";
import path from "node:path";
import { formatErrorMessage } from "../infra/errors.js";
import {
  areWideEventsEnabled,
  getWideEventLogPath,
  resolveWideEventPolicy,
} from "../logging/wide-events.js";
import { defaultRuntime, type RuntimeEnv } from "../runtime.js";
import { theme } from "../terminal/theme.js";
import { callGatewayFromCli, type GatewayRpcOpts } from "./gateway-rpc.js";

export type WideEventsCliOptions = {
  file?: string;
  lines?: string | number;
  where?: string[];
  json?: boolean;
};

export type WideEventsProbeOptions = GatewayRpcOpts;
export type WideEventsHealthOptions = {
  json?: boolean;
};

type WideEventLine = Record<string, unknown>;

const DEFAULT_LIMIT = 200;
const MAX_BYTES = 1_000_000;

function parseFilters(where?: string[]) {
  const filters: Record<string, string> = {};
  if (!where) return filters;
  for (const raw of where) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!key || rest.length === 0) continue;
    filters[key.trim()] = rest.join("=").trim();
  }
  return filters;
}

function matchesFilters(line: WideEventLine, filters: Record<string, string>) {
  for (const [key, value] of Object.entries(filters)) {
    const lineValue = line[key];
    if (lineValue == null) return false;
    if (typeof lineValue === "string") {
      if (lineValue !== value) return false;
      continue;
    }
    if (
      typeof lineValue === "number" ||
      typeof lineValue === "boolean" ||
      typeof lineValue === "bigint"
    ) {
      if (lineValue.toString() !== value) return false;
      continue;
    }
    return false;
  }
  return true;
}

async function readTailLines(file: string, limit: number): Promise<string[]> {
  const stat = await fs.stat(file).catch(() => null);
  if (!stat) return [];
  const size = stat.size;
  const start = Math.max(0, size - MAX_BYTES);
  const handle = await fs.open(file, "r");
  try {
    const length = Math.max(0, size - start);
    if (length === 0) return [];
    const buffer = Buffer.alloc(length);
    const readResult = await handle.read(buffer, 0, length, start);
    const text = buffer.toString("utf8", 0, readResult.bytesRead);
    let lines = text.split("\n");
    if (start > 0) lines = lines.slice(1);
    if (lines.length && lines[lines.length - 1] === "") {
      lines = lines.slice(0, -1);
    }
    if (lines.length > limit) {
      lines = lines.slice(lines.length - limit);
    }
    return lines;
  } finally {
    await handle.close();
  }
}

export async function wideEventsCommand(
  opts: WideEventsCliOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  const limitRaw =
    typeof opts.lines === "string" ? Number(opts.lines) : opts.lines;
  const limit =
    typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.floor(limitRaw)
      : DEFAULT_LIMIT;
  const file = opts.file?.trim() || getWideEventLogPath();
  const filters = parseFilters(opts.where);
  const rawLines = await readTailLines(file, limit * 4);
  const parsed = rawLines
    .map((line) => {
      try {
        return JSON.parse(line) as WideEventLine;
      } catch {
        return null;
      }
    })
    .filter((line): line is WideEventLine => Boolean(line));
  const filtered = parsed.filter((line) => matchesFilters(line, filters));
  const lines = filtered.slice(Math.max(0, filtered.length - limit));

  if (opts.json) {
    runtime.log(JSON.stringify({ file, filters, lines }, null, 2));
    return;
  }

  runtime.log(theme.info(`Wide events: ${file}`));
  if (Object.keys(filters).length > 0) {
    runtime.log(theme.info(`Filter: ${JSON.stringify(filters)}`));
  }
  if (lines.length === 0) {
    runtime.log(theme.muted("No matching wide events."));
    return;
  }
  for (const line of lines) {
    const ts = typeof line.ts === "string" ? line.ts : "";
    const method = typeof line.method === "string" ? line.method : "";
    const outcome = typeof line.outcome === "string" ? line.outcome : "";
    const summary = [ts, method, outcome].filter(Boolean).join(" ");
    runtime.log(summary || JSON.stringify(line));
  }
}

export async function wideEventsProbeCommand(
  opts: WideEventsProbeOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  const json =
    Boolean(opts.json) ||
    process.argv.some((arg) => arg === "--json" || arg.startsWith("--json="));
  const result = await callGatewayFromCli(
    "wideEvents.probe",
    { ...opts, json },
    {},
  );
  if (json) {
    runtime.log(JSON.stringify(result, null, 2));
    return;
  }
  const payload = result as {
    file?: string;
    enabled?: boolean;
    payloads?: string;
    ts?: string;
  };
  const line = [
    payload.ts ? `ts=${payload.ts}` : null,
    payload.file ? `file=${payload.file}` : null,
    typeof payload.enabled === "boolean" ? `enabled=${payload.enabled}` : null,
    payload.payloads ? `payloads=${payload.payloads}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  runtime.log(line ? theme.success(line) : theme.success("probe ok"));
}

export async function wideEventsHealthCommand(
  opts: WideEventsHealthOptions,
  runtime: RuntimeEnv = defaultRuntime,
) {
  const json =
    Boolean(opts.json) ||
    process.argv.some((arg) => arg === "--json" || arg.startsWith("--json="));
  const file = getWideEventLogPath();
  const dir = path.dirname(file);
  const enabled = areWideEventsEnabled();
  const payloads = resolveWideEventPolicy();
  const warnBytes = 50 * 1024 * 1024;
  const journalHint =
    "journalctl --user -u zee-wide-events-health.service -n 200 --no-pager";
  const today = new Date().toISOString().slice(0, 10);
  const base = path.basename(file);
  const rotationPattern = /^zee-wide-\d{4}-\d{2}-\d{2}\.jsonl$/;
  const matchesPattern = rotationPattern.test(base);
  const expectedBase = `zee-wide-${today}.jsonl`;
  const rotation = matchesPattern
    ? base === expectedBase
      ? { ok: true, detail: "today" }
      : { ok: false, detail: `stale (${base})` }
    : { ok: true, detail: "custom" };

  const result: Record<string, unknown> = {
    ok: true,
    enabled,
    payloads,
    file,
    dir,
    rotation,
    warnBytes,
    journalHint,
  };

  const dirStat = await fs.stat(dir).catch(() => null);
  const dirOk = Boolean(dirStat?.isDirectory());
  result.dirOk = dirOk;
  if (!dirOk) {
    result.ok = false;
    result.dirError = "log dir missing";
  } else {
    try {
      await fs.access(dir, fs.constants.W_OK);
      result.dirWritable = true;
    } catch (err) {
      result.ok = false;
      result.dirWritable = false;
      result.dirError = err instanceof Error ? err.message : String(err);
    }
  }

  let fileExists = false;
  let created = false;
  const stat = await fs.stat(file).catch(() => null);
  if (stat) {
    fileExists = true;
    result.sizeBytes = stat.size;
    result.mtime = stat.mtime?.toISOString?.();
    result.sizeWarn = stat.size >= warnBytes;
  }
  result.fileExists = fileExists;

  try {
    const handle = await fs.open(file, "a");
    await handle.close();
    created = !fileExists;
    result.fileWritable = true;
    if (created) result.created = true;
  } catch (err) {
    result.ok = false;
    result.fileWritable = false;
    result.fileError = err instanceof Error ? err.message : String(err);
  }

  if (!rotation.ok) result.ok = false;

  if (json) {
    runtime.log(JSON.stringify(result, null, 2));
    return;
  }

  const status = result.ok ? theme.success("ok") : theme.error("error");
  runtime.log(
    theme.info(
      `wide-events health: ${status} enabled=${enabled} payloads=${payloads}`,
    ),
  );
  runtime.log(theme.info(`file: ${file}`));
  runtime.log(
    theme.info(
      `dir: ${dir} ${dirOk ? "ok" : "missing"} ${
        result.dirWritable ? "writable" : "not-writable"
      }`,
    ),
  );
  runtime.log(
    theme.info(`rotation: ${rotation.ok ? "ok" : "warn"} (${rotation.detail})`),
  );
  if (typeof result.sizeBytes === "number") {
    const sizeLabel = result.sizeWarn ? "warn" : "ok";
    runtime.log(
      theme.info(
        `size: ${result.sizeBytes} bytes (${sizeLabel}, warn>=${warnBytes})`,
      ),
    );
  }
  if (result.fileWritable) {
    runtime.log(
      theme.info(
        `file: ${fileExists ? "exists" : "missing"} writable${
          created ? " (created)" : ""
        }`,
      ),
    );
  } else {
    runtime.log(
      theme.error(
        `file: not-writable (${formatErrorMessage(result.fileError)})`,
      ),
    );
  }
  runtime.log(theme.muted(`logs: ${journalHint}`));
}
