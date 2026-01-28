import { HttpError } from "grammy";

import { extractErrorCode, formatErrorMessage } from "../infra/errors.js";

const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set([
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "ENOTFOUND",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "EPIPE",
  "ERR_SOCKET_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_REQUEST_TIMEOUT",
]);
const RETRYABLE_MESSAGE_RE =
  /(?:429|timeout|timed out|connect|reset|closed|unavailable|temporar(?:ily|y)|socket hang up|network)/i;

function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof Error && err.name === "AbortError") return true;
  if (typeof err === "object" && "name" in err && err.name === "AbortError") return true;
  const code = extractErrorCode(err);
  return code === "ABORT_ERR" || code === "ERR_ABORTED";
}

function getErrorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  if ("status" in err && typeof err.status === "number") return err.status;
  if ("response" in err && err.response && typeof err.response === "object") {
    const status = (err.response as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  if ("error_code" in err && typeof err.error_code === "number") return err.error_code;
  if ("error" in err && err.error && typeof err.error === "object") {
    const nestedStatus = (err.error as { error_code?: unknown }).error_code;
    if (typeof nestedStatus === "number") return nestedStatus;
  }
  if (err instanceof HttpError) {
    const status = err.response?.status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

function getErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let i = 0; i < 3; i += 1) {
    const code = extractErrorCode(current);
    if (code) return code;
    if (!current || typeof current !== "object" || !("cause" in current)) break;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function isRecoverableTelegramNetworkError(
  err: unknown,
  _options?: { context?: string },
): boolean {
  if (isAbortError(err)) return false;
  const status = getErrorStatus(err);
  if (typeof status === "number" && RETRYABLE_STATUS_CODES.has(status)) return true;
  const code = getErrorCode(err);
  if (code && RETRYABLE_ERROR_CODES.has(code)) return true;
  return RETRYABLE_MESSAGE_RE.test(formatErrorMessage(err));
}
