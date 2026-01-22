import { normalizeAccountId } from "../routing/session-key.js";
import type { ZeeConfig } from "./config.js";

function normalizeCapabilities(
  capabilities: string[] | undefined,
): string[] | undefined {
  if (!capabilities) return undefined;
  return capabilities.map((entry) => entry.trim()).filter(Boolean);
}

/**
 * Messaging providers where thinking output should always be hidden.
 * These platforms cannot meaningfully display thinking/reasoning blocks.
 */
const MESSAGING_PROVIDERS = new Set([
  "whatsapp",
  "telegram",
  "discord",
  "slack",
  "signal",
  "imessage",
]);

/**
 * Check if thinking output can be shown for a given provider.
 * Returns false for messaging platforms (locked), true for TUI/Web/API (toggleable).
 */
export function canShowThinking(provider?: string | null): boolean {
  if (!provider) return true; // Default to true for unknown/unspecified providers
  const normalized = provider.trim().toLowerCase();
  return !MESSAGING_PROVIDERS.has(normalized);
}

export function resolveProviderCapabilities(params: {
  cfg?: ZeeConfig;
  provider?: string | null;
  accountId?: string | null;
}): string[] | undefined {
  const cfg = params.cfg;
  const provider = params.provider?.trim().toLowerCase();
  if (!cfg || !provider) return undefined;

  const accountId = normalizeAccountId(params.accountId);

  switch (provider) {
    case "whatsapp":
      return normalizeCapabilities(
        cfg.whatsapp?.accounts?.[accountId]?.capabilities ??
          cfg.whatsapp?.capabilities,
      );
    case "telegram":
      return normalizeCapabilities(
        cfg.telegram?.accounts?.[accountId]?.capabilities ??
          cfg.telegram?.capabilities,
      );
    case "discord":
      return normalizeCapabilities(
        cfg.discord?.accounts?.[accountId]?.capabilities ??
          cfg.discord?.capabilities,
      );
    case "slack":
      return normalizeCapabilities(
        cfg.slack?.accounts?.[accountId]?.capabilities ??
          cfg.slack?.capabilities,
      );
    case "signal":
      return normalizeCapabilities(
        cfg.signal?.accounts?.[accountId]?.capabilities ??
          cfg.signal?.capabilities,
      );
    case "imessage":
      return normalizeCapabilities(
        cfg.imessage?.accounts?.[accountId]?.capabilities ??
          cfg.imessage?.capabilities,
      );
    default:
      return undefined;
  }
}
