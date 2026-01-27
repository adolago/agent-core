import { normalizeProviderId } from "../../agents/model-selection.js";
import type { MediaUnderstandingProvider } from "../types.js";
import { googleProvider } from "./google/index.js";

// Media understanding: Google only (Gemini for image, audio, video)
// All use GEMINI_API_KEY via standard auth
const PROVIDERS: MediaUnderstandingProvider[] = [
  googleProvider,
];

export function normalizeMediaProviderId(id: string): string {
  const normalized = normalizeProviderId(id);
  // All Google aliases → google (uses Gemini for image, audio, video)
  if (normalized === "gemini" || normalized === "google-stt" ||
      normalized === "chirp" || normalized === "chirp2" || normalized === "chirp-2" || normalized === "chirp_2") {
    return "google";
  }
  return normalized;
}

export function buildMediaUnderstandingRegistry(
  overrides?: Record<string, MediaUnderstandingProvider>,
): Map<string, MediaUnderstandingProvider> {
  const registry = new Map<string, MediaUnderstandingProvider>();
  for (const provider of PROVIDERS) {
    registry.set(normalizeMediaProviderId(provider.id), provider);
  }
  if (overrides) {
    for (const [key, provider] of Object.entries(overrides)) {
      const normalizedKey = normalizeMediaProviderId(key);
      const existing = registry.get(normalizedKey);
      const merged = existing
        ? {
            ...existing,
            ...provider,
            capabilities: provider.capabilities ?? existing.capabilities,
          }
        : provider;
      registry.set(normalizedKey, merged);
    }
  }
  return registry;
}

export function getMediaUnderstandingProvider(
  id: string,
  registry: Map<string, MediaUnderstandingProvider>,
): MediaUnderstandingProvider | undefined {
  return registry.get(normalizeMediaProviderId(id));
}
