import { describe, expect, it } from "vitest";

import type { ZeeConfig } from "../config/config.js";
import { resolveEntriesWithActiveFallback, resolveModelEntries } from "./resolve.js";

const providerRegistry = new Map([
  ["google", { capabilities: ["image", "video", "audio"] }],
]);

describe("resolveModelEntries", () => {
  it("uses provider capabilities for shared entries without explicit caps", () => {
    const cfg: ZeeConfig = {
      tools: {
        media: {
          models: [{ provider: "google", model: "gemini-3-flash" }],
        },
      },
    };

    const imageEntries = resolveModelEntries({
      cfg,
      capability: "image",
      providerRegistry,
    });
    expect(imageEntries).toHaveLength(1);

    // Google now has all capabilities (image, video, audio)
    const audioEntries = resolveModelEntries({
      cfg,
      capability: "audio",
      providerRegistry,
    });
    expect(audioEntries).toHaveLength(1);
  });

  it("keeps per-capability entries even without explicit caps", () => {
    const cfg: ZeeConfig = {
      tools: {
        media: {
          image: {
            models: [{ provider: "google", model: "gemini-3-flash" }],
          },
        },
      },
    };

    const imageEntries = resolveModelEntries({
      cfg,
      capability: "image",
      config: cfg.tools?.media?.image,
      providerRegistry,
    });
    expect(imageEntries).toHaveLength(1);
  });

  it("skips shared CLI entries without capabilities", () => {
    const cfg: ZeeConfig = {
      tools: {
        media: {
          models: [{ type: "cli", command: "gemini", args: ["--file", "{{MediaPath}}"] }],
        },
      },
    };

    const entries = resolveModelEntries({
      cfg,
      capability: "image",
      providerRegistry,
    });
    expect(entries).toHaveLength(0);
  });
});

describe("resolveEntriesWithActiveFallback", () => {
  it("uses active model when enabled and no models are configured", () => {
    const cfg: ZeeConfig = {
      tools: {
        media: {
          audio: { enabled: true },
        },
      },
    };

    const entries = resolveEntriesWithActiveFallback({
      cfg,
      capability: "audio",
      config: cfg.tools?.media?.audio,
      providerRegistry,
      activeModel: { provider: "google", model: "chirp_2" },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.provider).toBe("google");
  });

  it("ignores active model when configured entries exist", () => {
    const cfg: ZeeConfig = {
      tools: {
        media: {
          audio: { enabled: true, models: [{ provider: "google", model: "chirp_2" }] },
        },
      },
    };

    const entries = resolveEntriesWithActiveFallback({
      cfg,
      capability: "audio",
      config: cfg.tools?.media?.audio,
      providerRegistry,
      activeModel: { provider: "google", model: "chirp_2" },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.provider).toBe("google");
  });

  it("skips active model when provider is not in registry", () => {
    const cfg: ZeeConfig = {
      tools: {
        media: {
          video: { enabled: true },
        },
      },
    };

    const entries = resolveEntriesWithActiveFallback({
      cfg,
      capability: "video",
      config: cfg.tools?.media?.video,
      providerRegistry,
      // Use a provider that doesn't exist in registry
      activeModel: { provider: "unknown-provider", model: "some-model" },
    });
    expect(entries).toHaveLength(0);
  });
});
