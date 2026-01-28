/**
 * Embedding provider tests
 *
 * Tests dimension handling and provider creation for the unified memory layer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createEmbeddingProvider,
  OpenAIEmbeddingProvider,
  GoogleEmbeddingProvider,
  VoyageEmbeddingProvider,
} from "./embedding";
import { EMBEDDING_PROFILES, resolveEmbeddingProfile } from "../config/embedding-profiles";

describe("embedding profiles", () => {
  it("defines google/gemini-embedding-001 with 3072 dimensions", () => {
    const profile = EMBEDDING_PROFILES["google/gemini-embedding-001"];
    expect(profile).toBeDefined();
    expect(profile.provider).toBe("google");
    expect(profile.model).toBe("gemini-embedding-001");
    expect(profile.dimensions).toBe(3072);
  });

  it("resolves google profile correctly", () => {
    const profile = resolveEmbeddingProfile("google/gemini-embedding-001");
    expect(profile).toBeDefined();
    expect(profile?.provider).toBe("google");
    expect(profile?.dimensions).toBe(3072);
  });

  it("defines openai/text-embedding-3-large with 3072 dimensions", () => {
    const profile = EMBEDDING_PROFILES["openai/text-embedding-3-large"];
    expect(profile).toBeDefined();
    expect(profile.provider).toBe("openai");
    expect(profile.dimensions).toBe(3072);
  });

  it("defines voyage/voyage-3-large with 1024 dimensions", () => {
    const profile = EMBEDDING_PROFILES["voyage/voyage-3-large"];
    expect(profile).toBeDefined();
    expect(profile.provider).toBe("voyage");
    expect(profile.dimensions).toBe(1024);
  });
});

describe("GoogleEmbeddingProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("defaults to 3072 dimensions for gemini-embedding-001", () => {
    process.env.GEMINI_API_KEY = "test-key";
    const provider = new GoogleEmbeddingProvider({});
    expect(provider.dimension).toBe(3072);
    expect(provider.model).toBe("gemini-embedding-001");
    expect(provider.id).toBe("google");
  });

  it("uses configured dimensions", () => {
    process.env.GEMINI_API_KEY = "test-key";
    const provider = new GoogleEmbeddingProvider({ dimensions: 768 });
    expect(provider.dimension).toBe(768);
  });

  it("throws without API key", () => {
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
    expect(() => new GoogleEmbeddingProvider({})).toThrow(/Google API key required/);
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

  it("creates google provider with correct defaults", () => {
    process.env.GEMINI_API_KEY = "test-key";
    const provider = createEmbeddingProvider({ provider: "google" });
    expect(provider.id).toBe("google");
    expect(provider.dimension).toBe(3072);
  });

  it("creates openai provider with correct defaults", () => {
    process.env.OPENAI_API_KEY = "test-key";
    const provider = createEmbeddingProvider({ provider: "openai" });
    expect(provider.id).toBe("openai");
    expect(provider.dimension).toBe(1536);
  });

  it("creates voyage provider with correct defaults", () => {
    process.env.VOYAGE_API_KEY = "test-key";
    const provider = createEmbeddingProvider({ provider: "voyage" });
    expect(provider.id).toBe("voyage");
    expect(provider.dimension).toBe(1024);
  });

  it("respects custom dimensions config", () => {
    process.env.GEMINI_API_KEY = "test-key";
    const provider = createEmbeddingProvider({ provider: "google", dimensions: 768 });
    expect(provider.dimension).toBe(768);
  });
});

describe("dimension mismatch detection", () => {
  it("profiles have expected dimensions", () => {
    const google = EMBEDDING_PROFILES["google/gemini-embedding-001"];
    const openai = EMBEDDING_PROFILES["openai/text-embedding-3-large"];
    const voyage = EMBEDDING_PROFILES["voyage/voyage-3-large"];

    // Google and OpenAI large share 3072 dimensions (interchangeable collections)
    expect(google.dimensions).toBe(3072);
    expect(openai.dimensions).toBe(3072);
    expect(google.dimensions).toBe(openai.dimensions);

    // Voyage uses 1024 dimensions (requires separate collection)
    expect(voyage.dimensions).toBe(1024);
    expect(voyage.dimensions).not.toBe(google.dimensions);
  });
});
