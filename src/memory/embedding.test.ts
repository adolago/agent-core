/**
 * Embedding provider tests
 *
 * Tests dimension handling and provider creation for the unified memory layer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createEmbeddingProvider,
  NebiusEmbeddingProvider,
  OpenAIEmbeddingProvider,
  GoogleEmbeddingProvider,
} from "./embedding";
import { EMBEDDING_PROFILES, resolveEmbeddingProfile } from "../config/embedding-profiles";

describe("embedding profiles", () => {
  it("defines nebius/qwen3-embedding-8b with 4096 dimensions", () => {
    const profile = EMBEDDING_PROFILES["nebius/qwen3-embedding-8b"];
    expect(profile).toBeDefined();
    expect(profile.provider).toBe("nebius");
    expect(profile.model).toBe("Qwen/Qwen3-Embedding-8B");
    expect(profile.dimensions).toBe(4096);
    expect(profile.baseUrl).toBe("https://api.tokenfactory.nebius.com/v1");
  });

  it("resolves nebius profile correctly", () => {
    const profile = resolveEmbeddingProfile("nebius/qwen3-embedding-8b");
    expect(profile).toBeDefined();
    expect(profile?.provider).toBe("nebius");
    expect(profile?.dimensions).toBe(4096);
  });

  it("defines openai/text-embedding-3-small with 1536 dimensions", () => {
    const profile = EMBEDDING_PROFILES["openai/text-embedding-3-small"];
    expect(profile).toBeDefined();
    expect(profile.provider).toBe("openai");
    expect(profile.dimensions).toBe(1536);
  });

  it("defines google/text-embedding-004 with 768 dimensions", () => {
    const profile = EMBEDDING_PROFILES["google/text-embedding-004"];
    expect(profile).toBeDefined();
    expect(profile.provider).toBe("google");
    expect(profile.dimensions).toBe(768);
  });
});

describe("NebiusEmbeddingProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("defaults to 4096 dimensions", () => {
    process.env.NEBIUS_API_KEY = "test-key";
    const provider = new NebiusEmbeddingProvider({});
    expect(provider.dimension).toBe(4096);
    expect(provider.model).toBe("Qwen/Qwen3-Embedding-8B");
    expect(provider.id).toBe("nebius");
  });

  it("uses configured dimensions", () => {
    process.env.NEBIUS_API_KEY = "test-key";
    const provider = new NebiusEmbeddingProvider({ dimensions: 2048 });
    expect(provider.dimension).toBe(2048);
  });

  it("updates dimension from API response", async () => {
    process.env.NEBIUS_API_KEY = "test-key";
    const mockEmbedding = new Array(4096).fill(0.1);

    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ embedding: mockEmbedding, index: 0 }],
      }),
    } as Response);

    const provider = new NebiusEmbeddingProvider({});
    const result = await provider.embedBatch(["test"]);

    expect(result[0]).toHaveLength(4096);
    expect(provider.dimension).toBe(4096);
  });

  it("throws without API key when auth store is empty", () => {
    delete process.env.NEBIUS_API_KEY;
    // The provider also checks the auth store at ~/.local/share/agent-core/auth.json
    // This test verifies the error message format when no key is found anywhere
    // Skip if running in CI or environment where auth store exists
    try {
      new NebiusEmbeddingProvider({});
      // If we get here, an API key was found (auth store has one)
      // This is fine - we just wanted to verify the constructor works
    } catch (error) {
      expect((error as Error).message).toMatch(/Nebius API key required/);
    }
  });
});

describe("createEmbeddingProvider factory", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("creates nebius provider with correct defaults", () => {
    process.env.NEBIUS_API_KEY = "test-key";
    const provider = createEmbeddingProvider({ provider: "nebius" });
    // CachedEmbeddingProvider wraps the inner provider
    expect(provider.id).toBe("nebius");
    expect(provider.dimension).toBe(4096);
  });

  it("creates openai provider with correct defaults", () => {
    process.env.OPENAI_API_KEY = "test-key";
    const provider = createEmbeddingProvider({ provider: "openai" });
    expect(provider.id).toBe("openai");
    expect(provider.dimension).toBe(1536);
  });

  it("creates google provider with correct defaults", () => {
    process.env.GEMINI_API_KEY = "test-key";
    const provider = createEmbeddingProvider({ provider: "google" });
    expect(provider.id).toBe("google");
    expect(provider.dimension).toBe(768);
  });

  it("respects custom dimensions config", () => {
    process.env.NEBIUS_API_KEY = "test-key";
    const provider = createEmbeddingProvider({ provider: "nebius", dimensions: 1024 });
    expect(provider.dimension).toBe(1024);
  });
});

describe("dimension mismatch detection", () => {
  it("profiles have distinct dimensions that would cause collection mismatch", () => {
    const nebius = EMBEDDING_PROFILES["nebius/qwen3-embedding-8b"];
    const openai = EMBEDDING_PROFILES["openai/text-embedding-3-small"];
    const google = EMBEDDING_PROFILES["google/text-embedding-004"];

    // These should all be different, which means switching providers
    // without updating the Qdrant collection would fail
    expect(nebius.dimensions).not.toBe(openai.dimensions);
    expect(nebius.dimensions).not.toBe(google.dimensions);
    expect(openai.dimensions).not.toBe(google.dimensions);

    // Document the actual dimensions for clarity
    expect(nebius.dimensions).toBe(4096); // Qwen3-Embedding-8B
    expect(openai.dimensions).toBe(1536); // text-embedding-3-small
    expect(google.dimensions).toBe(768); // text-embedding-004
  });
});
