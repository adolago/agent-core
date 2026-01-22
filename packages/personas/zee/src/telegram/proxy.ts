// @ts-nocheck
import { ProxyAgent } from "undici";

const MAX_PROXY_URL_LENGTH = 2048;
const ALLOWED_PROXY_PROTOCOLS = new Set([
  "http:",
  "https:",
  "socks:",
  "socks4:",
  "socks4a:",
  "socks5:",
  "socks5h:",
]);

function normalizeProxyUrl(proxyUrl: string): string {
  const trimmed = proxyUrl.trim();
  if (!trimmed) {
    throw new Error("Proxy URL is empty.");
  }
  if (trimmed.length > MAX_PROXY_URL_LENGTH) {
    throw new Error("Proxy URL is too long.");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (err) {
    throw new Error(
      `Proxy URL is invalid: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const protocol = parsed.protocol.toLowerCase();
  if (!ALLOWED_PROXY_PROTOCOLS.has(protocol)) {
    throw new Error(
      `Proxy protocol must be one of ${[...ALLOWED_PROXY_PROTOCOLS].join(", ")} (got ${parsed.protocol}).`,
    );
  }
  return parsed.toString();
}

export function makeProxyFetch(proxyUrl: string): typeof fetch {
  const normalized = normalizeProxyUrl(proxyUrl);
  const agent = new ProxyAgent(normalized);
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const base = init ? { ...init } : {};
    return fetch(input, { ...base, dispatcher: agent });
  };
}
