// Lazy-load agent-core model metadata so we can infer context windows when
// the agent reports a model id.

import { loadModelCatalog } from "./llm-types.js";

const MODEL_CACHE = new Map<string, number>();
const loadPromise = (async () => {
  try {
    const catalog = await loadModelCatalog({ useCache: true });
    for (const entry of catalog) {
      if (!entry?.id) continue;
      if (typeof entry.contextWindow === "number" && entry.contextWindow > 0) {
        MODEL_CACHE.set(entry.id, entry.contextWindow);
        MODEL_CACHE.set(`${entry.provider}/${entry.id}`, entry.contextWindow);
      }
    }
  } catch {
    // If agent-core isn't available, leave cache empty; lookup will fall back.
  }
})();

export function lookupContextTokens(modelId?: string): number | undefined {
  if (!modelId) return undefined;
  // Best-effort: kick off loading, but don't block.
  void loadPromise;
  const direct = MODEL_CACHE.get(modelId);
  if (direct !== undefined) return direct;
  const slash = modelId.indexOf("/");
  if (slash === -1) return undefined;
  return MODEL_CACHE.get(modelId.slice(slash + 1));
}
