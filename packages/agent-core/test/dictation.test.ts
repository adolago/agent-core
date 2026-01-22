import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test"
import { Auth } from "../src/auth"

const { Dictation } = await import("../src/cli/cmd/tui/util/dictation")

describe("Dictation.resolveConfig", () => {
  let authGetSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    delete process.env.INWORLD_API_KEY
    delete process.env.INWORLD_STT_ENDPOINT
    delete process.env.OPENCODE_INWORLD_API_KEY
    delete process.env.OPENCODE_INWORLD_STT_ENDPOINT
    authGetSpy = spyOn(Auth, "get").mockImplementation(async () => undefined)
  })

  afterEach(() => {
    authGetSpy.mockRestore()
  })

  it("should return undefined when disabled", async () => {
    const result = await Dictation.resolveConfig({ enabled: false })
    expect(result).toBeUndefined()
  })

  it("should return undefined when no credentials available", async () => {
    const result = await Dictation.resolveConfig({})
    expect(result).toBeUndefined()
  })

  it("should use config values when provided", async () => {
    const result = await Dictation.resolveConfig({
      endpoint: "https://test.inworld.ai/graph:start",
      api_key: "dGVzdC1rZXk=", // base64 "test-key"
    })
    expect(result).toBeDefined()
    expect(result?.endpoint).toBe("https://test.inworld.ai/graph:start")
    expect(result?.apiKey).toBe("dGVzdC1rZXk=")
  })

  it("should use environment variables as fallback", async () => {
    process.env.INWORLD_API_KEY = "env-key"
    process.env.INWORLD_STT_ENDPOINT = "https://env.inworld.ai/graph:start"

    const result = await Dictation.resolveConfig({})
    expect(result).toBeDefined()
    expect(result?.endpoint).toBe("https://env.inworld.ai/graph:start")
    expect(result?.apiKey).toBe("env-key")
  })

  it("should use OPENCODE_ prefixed env vars as fallback", async () => {
    process.env.OPENCODE_INWORLD_API_KEY = "opencode-key"
    process.env.OPENCODE_INWORLD_STT_ENDPOINT = "https://opencode.inworld.ai/graph:start"

    const result = await Dictation.resolveConfig({})
    expect(result).toBeDefined()
    expect(result?.endpoint).toBe("https://opencode.inworld.ai/graph:start")
    expect(result?.apiKey).toBe("opencode-key")
  })

  it("should read from stored auth when env/config not available", async () => {
    authGetSpy.mockImplementation(async (providerID: string) => {
      if (providerID === "inworld") {
        return {
          type: "api",
          key: JSON.stringify({
            apiKey: "stored-api-key",
            endpoint: "https://stored.inworld.ai/graph:start",
          }),
        }
      }
      return undefined
    })

    const result = await Dictation.resolveConfig({})
    expect(result).toBeDefined()
    expect(result?.endpoint).toBe("https://stored.inworld.ai/graph:start")
    expect(result?.apiKey).toBe("stored-api-key")
  })

  it("should prefer config over stored auth", async () => {
    authGetSpy.mockImplementation(async (providerID: string) => {
      if (providerID === "inworld") {
        return {
          type: "api",
          key: JSON.stringify({
            apiKey: "stored-api-key",
            endpoint: "https://stored.inworld.ai/graph:start",
          }),
        }
      }
      return undefined
    })

    const result = await Dictation.resolveConfig({
      endpoint: "https://config.inworld.ai/graph:start",
      api_key: "config-api-key",
    })
    expect(result).toBeDefined()
    expect(result?.endpoint).toBe("https://config.inworld.ai/graph:start")
    expect(result?.apiKey).toBe("config-api-key")
  })

  it("should use default values for optional fields", async () => {
    const result = await Dictation.resolveConfig({
      endpoint: "https://test.inworld.ai/graph:start",
      api_key: "test-key",
    })
    expect(result).toBeDefined()
    expect(result?.inputKey).toBe("audio")
    expect(result?.sampleRate).toBe(16000)
    expect(result?.autoSubmit).toBe(false)
  })

  it("should respect custom optional field values", async () => {
    const result = await Dictation.resolveConfig({
      endpoint: "https://test.inworld.ai/graph:start",
      api_key: "test-key",
      input_key: "custom_audio",
      sample_rate: 44100,
      auto_submit: true,
      response_path: "data.text",
    })
    expect(result).toBeDefined()
    expect(result?.inputKey).toBe("custom_audio")
    expect(result?.sampleRate).toBe(44100)
    expect(result?.autoSubmit).toBe(true)
    expect(result?.responsePath).toBe("data.text")
  })
})
