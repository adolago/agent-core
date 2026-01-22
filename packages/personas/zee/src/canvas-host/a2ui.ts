import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { detectMime } from "../media/mime.js";

export const A2UI_PATH = "/__zee__/a2ui";
export const CANVAS_HOST_PATH = "/__zee__/canvas";
export const CANVAS_WS_PATH = "/__zee/ws";

const SCRIPT_TAG_REGEX = /<script\b(?![^>]*\bnonce=)([^>]*)>/gi;
function hasInvalidCanvasPathChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
    const ch = value[i];
    if (
      ch === "<" ||
      ch === ">" ||
      ch === '"' ||
      ch === "'" ||
      ch === "`" ||
      ch === "\\"
    ) {
      return true;
    }
  }
  return false;
}

export function generateCanvasNonce(): string {
  return randomBytes(16).toString("base64");
}

export function applyScriptNonce(html: string, nonce: string): string {
  return html.replace(SCRIPT_TAG_REGEX, `<script nonce="${nonce}"$1>`);
}

function buildCanvasCsp(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss:",
  ].join("; ");
}

export function applyCanvasHtmlHeaders(
  res: ServerResponse,
  nonce: string,
): void {
  res.setHeader("Content-Security-Policy", buildCanvasCsp(nonce));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
}

export function applyCanvasAssetHeaders(res: ServerResponse): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
}

let cachedA2uiRootReal: string | null | undefined;
let resolvingA2uiRoot: Promise<string | null> | null = null;

async function resolveA2uiRoot(): Promise<string | null> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Running from source (bun) or dist (tsc + copied assets).
    path.resolve(here, "a2ui"),
    // Running from dist without copied assets (fallback to source).
    path.resolve(here, "../../src/canvas-host/a2ui"),
    // Running from repo root.
    path.resolve(process.cwd(), "src/canvas-host/a2ui"),
    path.resolve(process.cwd(), "dist/canvas-host/a2ui"),
  ];
  if (process.execPath) {
    candidates.unshift(path.resolve(path.dirname(process.execPath), "a2ui"));
  }

  for (const dir of candidates) {
    try {
      const indexPath = path.join(dir, "index.html");
      const bundlePath = path.join(dir, "a2ui.bundle.js");
      await fs.stat(indexPath);
      await fs.stat(bundlePath);
      return dir;
    } catch {
      // try next
    }
  }
  return null;
}

async function resolveA2uiRootReal(): Promise<string | null> {
  if (cachedA2uiRootReal !== undefined) return cachedA2uiRootReal;
  if (!resolvingA2uiRoot) {
    resolvingA2uiRoot = (async () => {
      const root = await resolveA2uiRoot();
      cachedA2uiRootReal = root ? await fs.realpath(root) : null;
      return cachedA2uiRootReal;
    })();
  }
  return resolvingA2uiRoot;
}

export function normalizeCanvasUrlPath(rawPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath || "/");
  } catch {
    return null;
  }
  if (hasInvalidCanvasPathChars(decoded)) return null;
  const normalized = path.posix.normalize(decoded);
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

async function resolveA2uiFilePath(rootReal: string, normalizedPath: string) {
  const rel = normalizedPath.replace(/^\/+/, "");
  if (rel.split("/").some((p) => p === "..")) return null;

  let candidate = path.join(rootReal, rel);
  if (normalizedPath.endsWith("/")) {
    candidate = path.join(candidate, "index.html");
  }

  try {
    const st = await fs.stat(candidate);
    if (st.isDirectory()) {
      candidate = path.join(candidate, "index.html");
    }
  } catch {
    // ignore
  }

  const rootPrefix = rootReal.endsWith(path.sep)
    ? rootReal
    : `${rootReal}${path.sep}`;
  try {
    const lstat = await fs.lstat(candidate);
    if (lstat.isSymbolicLink()) return null;
    const real = await fs.realpath(candidate);
    if (!real.startsWith(rootPrefix)) return null;
    return real;
  } catch {
    return null;
  }
}

export function injectCanvasLiveReload(html: string): string {
  const snippet = `
<script>
(() => {
  // Cross-platform action bridge helper.
  // Works on:
  // - iOS: window.webkit.messageHandlers.zeeCanvasA2UIAction.postMessage(...)
  // - Android: window.zeeCanvasA2UIAction.postMessage(...)
  const actionHandlerName = "zeeCanvasA2UIAction";
  function postToNode(payload) {
    try {
      const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
      const iosHandler = globalThis.webkit?.messageHandlers?.[actionHandlerName];
      if (iosHandler && typeof iosHandler.postMessage === "function") {
        iosHandler.postMessage(raw);
        return true;
      }
      const androidHandler = globalThis[actionHandlerName];
      if (androidHandler && typeof androidHandler.postMessage === "function") {
        // Important: call as a method on the interface object (binding matters on Android WebView).
        androidHandler.postMessage(raw);
        return true;
      }
    } catch {}
    return false;
  }
  function sendUserAction(userAction) {
    const id =
      (userAction && typeof userAction.id === "string" && userAction.id.trim()) ||
      (globalThis.crypto?.randomUUID?.() ?? String(Date.now()));
    const action = { ...userAction, id };
    return postToNode({ userAction: action });
  }
  globalThis.Zee = globalThis.Zee ?? {};
  globalThis.Zee.postMessage = postToNode;
  globalThis.Zee.sendUserAction = sendUserAction;
  globalThis.zeePostMessage = postToNode;
  globalThis.zeeSendUserAction = sendUserAction;

  try {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(proto + "://" + location.host + ${JSON.stringify(CANVAS_WS_PATH)});
    ws.onmessage = (ev) => {
      if (String(ev.data || "") === "reload") location.reload();
    };
  } catch {}
})();
</script>
`.trim();

  const idx = html.toLowerCase().lastIndexOf("</body>");
  if (idx >= 0) {
    return `${html.slice(0, idx)}\n${snippet}\n${html.slice(idx)}`;
  }
  return `${html}\n${snippet}\n`;
}

export async function handleA2uiHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const urlRaw = req.url;
  if (!urlRaw) return false;

  const url = new URL(urlRaw, "http://localhost");
  if (url.pathname !== A2UI_PATH && !url.pathname.startsWith(`${A2UI_PATH}/`)) {
    return false;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method Not Allowed");
    return true;
  }

  const a2uiRootReal = await resolveA2uiRootReal();
  if (!a2uiRootReal) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("A2UI assets not found");
    return true;
  }

  const rel = url.pathname.slice(A2UI_PATH.length);
  const normalizedPath = normalizeCanvasUrlPath(rel || "/");
  if (!normalizedPath) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("not found");
    return true;
  }

  const filePath = await resolveA2uiFilePath(a2uiRootReal, normalizedPath);
  if (!filePath) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("not found");
    return true;
  }

  const lower = filePath.toLowerCase();
  const mime =
    lower.endsWith(".html") || lower.endsWith(".htm")
      ? "text/html"
      : ((await detectMime({ filePath })) ?? "application/octet-stream");
  res.setHeader("Cache-Control", "no-store");

  if (mime === "text/html") {
    const nonce = generateCanvasNonce();
    const html = await fs.readFile(filePath, "utf8");
    const withReload = injectCanvasLiveReload(html);
    const withNonce = applyScriptNonce(withReload, nonce);
    applyCanvasHtmlHeaders(res, nonce);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(withNonce);
    return true;
  }

  applyCanvasAssetHeaders(res);
  res.setHeader("Content-Type", mime);
  res.end(await fs.readFile(filePath));
  return true;
}
