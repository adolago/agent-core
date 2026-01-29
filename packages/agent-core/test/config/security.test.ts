import { test, expect, describe } from "bun:test"
import { Config } from "../../src/config/config"

describe("Config Security", () => {
  const MASK = "********"

  test("redact hides sensitive fields", () => {
    const config: Config.Info = {
      provider: {
        openai: {
          options: {
            apiKey: "sk-secret-key",
          },
        },
      },
      memory: {
        qdrantApiKey: "qdrant-secret",
        qdrant: {
          apiKey: "qdrant-nested-secret",
        },
        embedding: {
          apiKey: "embedding-secret",
        },
      },
      tiara: {
        qdrant: {
          apiKey: "tiara-secret",
        },
      },
      zee: {
        splitwise: {
          token: "zee-token",
        },
      },
      grammar: {
        provider: "languagetool",
        apiKey: "grammar-secret",
      },
      mcp: {
        jira: {
          type: "remote",
          url: "https://jira.com",
          oauth: {
            clientSecret: "oauth-secret",
          },
        },
      },
    }

    const redacted = Config.redact(config)

    expect(redacted.provider?.openai?.options?.apiKey).toBe(MASK)
    expect(redacted.memory?.qdrantApiKey).toBe(MASK)
    expect(redacted.memory?.qdrant?.apiKey).toBe(MASK)
    expect(redacted.memory?.embedding?.apiKey).toBe(MASK)
    expect(redacted.tiara?.qdrant?.apiKey).toBe(MASK)
    expect(redacted.zee?.splitwise?.token).toBe(MASK)
    expect(redacted.grammar?.apiKey).toBe(MASK)

    // Check MCP redaction
    const jira = redacted.mcp?.jira as any
    expect(jira.oauth.clientSecret).toBe(MASK)

    // Ensure original object is not mutated
    expect(config.provider?.openai?.options?.apiKey).toBe("sk-secret-key")
  })

  test("clean removes masked fields", () => {
    const config: Config.Info = {
      theme: "dark",
      provider: {
        openai: {
          options: {
            apiKey: MASK,
            baseURL: "https://api.openai.com",
          },
        },
      },
      memory: {
        qdrantApiKey: MASK,
        qdrant: {
          apiKey: MASK,
          url: "http://localhost:6333",
        },
      },
    }

    const cleaned = Config.clean(config)

    expect(cleaned.theme).toBe("dark")
    expect(cleaned.provider?.openai?.options?.baseURL).toBe("https://api.openai.com")
    expect(cleaned.provider?.openai?.options?.apiKey).toBeUndefined()

    expect(cleaned.memory?.qdrantApiKey).toBeUndefined()
    expect(cleaned.memory?.qdrant?.url).toBe("http://localhost:6333")
    expect(cleaned.memory?.qdrant?.apiKey).toBeUndefined()

    // Ensure original object is not mutated
    expect(config.provider?.openai?.options?.apiKey).toBe(MASK)
  })

  test("clean preserves non-masked fields even if sensitive", () => {
    // If user explicitly sets a NEW key, it should be preserved
    const config: Config.Info = {
      provider: {
        openai: {
          options: {
            apiKey: "sk-new-key",
          },
        },
      },
    }

    const cleaned = Config.clean(config)
    expect(cleaned.provider?.openai?.options?.apiKey).toBe("sk-new-key")
  })
})
