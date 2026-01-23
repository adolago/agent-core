const AGENT_CORE_DAEMON_URL = "http://127.0.0.1:3210";
const DEFAULT_TIMEOUT_MS = 500;

function resolveAgentCoreUrl(): string {
  const envUrl = process.env.AGENT_CORE_URL?.trim();
  const raw = envUrl || AGENT_CORE_DAEMON_URL;
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export async function isAgentCoreReachable(
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<boolean> {
  const baseUrl = resolveAgentCoreUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${baseUrl}/global/health`, {
      method: "GET",
      signal: controller.signal,
    });
    return resp.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}
