import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../agents/model-auth.js", () => ({
  resolveApiKeyForProvider: vi.fn(),
  requireApiKey: (auth: { apiKey?: string; mode?: string }, provider: string) => {
    if (auth?.apiKey) return auth.apiKey;
    throw new Error(`No API key resolved for provider "${provider}" (auth mode: ${auth?.mode}).`);
  },
}));

const createFetchMock = () =>
  vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: [{ embedding: [1, 2, 3] }] }),
  })) as unknown as typeof fetch;

describe("embedding provider remote overrides", () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("uses remote baseUrl/apiKey and merges headers", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const { createEmbeddingProvider } = await import("./embeddings.js");
    const authModule = await import("../agents/model-auth.js");
    vi.mocked(authModule.resolveApiKeyForProvider).mockResolvedValue({
      apiKey: "provider-key",
      mode: "api-key",
      source: "test",
    });

    const cfg = {
      models: {
        providers: {
          openai: {
            baseUrl: "https://provider.example/v1",
            headers: {
              "X-Provider": "p",
              "X-Shared": "provider",
            },
          },
        },
      },
    };

    const result = await createEmbeddingProvider({
      config: cfg as never,
      provider: "openai",
      remote: {
        baseUrl: "https://remote.example/v1",
        apiKey: "  remote-key  ",
        headers: {
          "X-Shared": "remote",
          "X-Remote": "r",
        },
      },
      model: "text-embedding-3-small",
      fallback: "openai",
    });

    await result.provider.embedQuery("hello");

    expect(authModule.resolveApiKeyForProvider).not.toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://remote.example/v1/embeddings");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer remote-key");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-Provider"]).toBe("p");
    expect(headers["X-Shared"]).toBe("remote");
    expect(headers["X-Remote"]).toBe("r");
  });

  it("falls back to resolved api key when remote apiKey is blank", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const { createEmbeddingProvider } = await import("./embeddings.js");
    const authModule = await import("../agents/model-auth.js");
    vi.mocked(authModule.resolveApiKeyForProvider).mockResolvedValue({
      apiKey: "provider-key",
      mode: "api-key",
      source: "test",
    });

    const cfg = {
      models: {
        providers: {
          openai: {
            baseUrl: "https://provider.example/v1",
          },
        },
      },
    };

    const result = await createEmbeddingProvider({
      config: cfg as never,
      provider: "openai",
      remote: {
        baseUrl: "https://remote.example/v1",
        apiKey: "   ",
      },
      model: "text-embedding-3-small",
      fallback: "openai",
    });

    await result.provider.embedQuery("hello");

    expect(authModule.resolveApiKeyForProvider).toHaveBeenCalledTimes(1);
    const headers = (fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>) ?? {};
    expect(headers.Authorization).toBe("Bearer provider-key");
  });

  it("builds Gemini embeddings requests with api key header", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ embedding: { values: [1, 2, 3] } }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const { createEmbeddingProvider } = await import("./embeddings.js");
    const authModule = await import("../agents/model-auth.js");
    vi.mocked(authModule.resolveApiKeyForProvider).mockResolvedValue({
      apiKey: "provider-key",
      mode: "api-key",
      source: "test",
    });

    const cfg = {
      models: {
        providers: {
          google: {
            baseUrl: "https://generativelanguage.googleapis.com/v1beta",
          },
        },
      },
    };

    const result = await createEmbeddingProvider({
      config: cfg as never,
      provider: "gemini",
      remote: {
        apiKey: "gemini-key",
      },
      model: "text-embedding-004",
      fallback: "openai",
    });

    await result.provider.embedQuery("hello");

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent",
    );
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("gemini-key");
    expect(headers["Content-Type"]).toBe("application/json");
  });
});

describe("embedding provider auto selection", () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("prefers openai when a key resolves", async () => {
    const { createEmbeddingProvider } = await import("./embeddings.js");
    const authModule = await import("../agents/model-auth.js");
    vi.mocked(authModule.resolveApiKeyForProvider).mockImplementation(async ({ provider }) => {
      if (provider === "openai") {
        return { apiKey: "openai-key", source: "env: OPENAI_API_KEY", mode: "api-key" };
      }
      throw new Error(`No API key found for provider "${provider}".`);
    });

    const result = await createEmbeddingProvider({
      config: {} as never,
      provider: "auto",
      model: "",
      fallback: "none",
    });

    expect(result.requestedProvider).toBe("auto");
    expect(result.provider.id).toBe("openai");
  });

  it("uses gemini when openai is missing", async () => {
    const { createEmbeddingProvider } = await import("./embeddings.js");
    const authModule = await import("../agents/model-auth.js");
    vi.mocked(authModule.resolveApiKeyForProvider).mockImplementation(async ({ provider }) => {
      if (provider === "openai") {
        throw new Error('No API key found for provider "openai".');
      }
      if (provider === "google") {
        return { apiKey: "gemini-key", source: "env: GEMINI_API_KEY", mode: "api-key" };
      }
      throw new Error(`Unexpected provider ${provider}`);
    });

    const result = await createEmbeddingProvider({
      config: {} as never,
      provider: "auto",
      model: "",
      fallback: "none",
    });

    expect(result.requestedProvider).toBe("auto");
    expect(result.provider.id).toBe("gemini");
  });
});

// Local llama embedding tests removed - local provider has been deprecated.
// Use Nebius (via OpenAI-compatible API) or other remote providers.
