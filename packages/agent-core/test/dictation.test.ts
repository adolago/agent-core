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
    expect(result?.inputKey).toBe("__root__")
    expect(result?.sampleRate).toBe(16000)
    expect(result?.autoSubmit).toBe(false)
    expect(result?.runtimeMode).toBe("auto")
  })

  it("should respect custom optional field values", async () => {
    const result = await Dictation.resolveConfig({
      endpoint: "https://test.inworld.ai/graph:start",
      api_key: "test-key",
      input_key: "custom_audio",
      sample_rate: 44100,
      auto_submit: true,
      response_path: "data.text",
      runtime_mode: "force",
    })
    expect(result).toBeDefined()
    expect(result?.inputKey).toBe("custom_audio")
    expect(result?.sampleRate).toBe(44100)
    expect(result?.autoSubmit).toBe(true)
    expect(result?.responsePath).toBe("data.text")
    expect(result?.runtimeMode).toBe("force")
  })
})

describe("Dictation.transcribe", () => {
  it("sends GraphTypes.Audio payload from WAV PCM data", async () => {
    const wav = buildWav(new Int16Array([0, 32767]), 8000)
    let seenBody: any
    const fetcher = (async (_url: string, init?: RequestInit) => {
      seenBody = JSON.parse(String(init?.body ?? "{}"))
      return new Response(JSON.stringify({ text: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }) as typeof fetch

    const result = await Dictation.transcribe({
      config: {
        endpoint: "https://example.test/graph:start",
        apiKey: "test-key",
        inputKey: "__root__",
        sampleRate: 16000,
        autoSubmit: false,
        runtimeMode: "auto",
      },
      audio: wav,
      fetcher,
    })

    expect(result).toBe("ok")
    expect(seenBody.input.type).toBe("Audio")
    expect(seenBody.input._iw_type).toBe("Audio")
    expect(seenBody.input.data.sampleRate).toBe(8000)
    expect(seenBody.input.data.data).toHaveLength(2)
    expect(seenBody.input.data.data[0]).toBeCloseTo(0, 6)
    expect(seenBody.input.data.data[1]).toBeCloseTo(0.99997, 4)
  })

  it("supports nested input keys for audio payloads", async () => {
    const wav = buildWav(new Int16Array([0, 32767]), 8000)
    let seenBody: any
    const fetcher = (async (_url: string, init?: RequestInit) => {
      seenBody = JSON.parse(String(init?.body ?? "{}"))
      return new Response(JSON.stringify({ text: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }) as typeof fetch

    const result = await Dictation.transcribe({
      config: {
        endpoint: "https://example.test/graph:start",
        apiKey: "test-key",
        inputKey: "audio",
        sampleRate: 16000,
        autoSubmit: false,
        runtimeMode: "auto",
      },
      audio: wav,
      fetcher,
    })

    expect(result).toBe("ok")
    expect(seenBody.input.audio.type).toBe("Audio")
    expect(seenBody.input.audio._iw_type).toBe("Audio")
    expect(seenBody.input.audio.data.sampleRate).toBe(8000)
    expect(seenBody.input.audio.data.data).toHaveLength(2)
    expect(seenBody.input.audio.data.data[0]).toBeCloseTo(0, 6)
    expect(seenBody.input.audio.data.data[1]).toBeCloseTo(0.99997, 4)
  })
})

function buildWav(samples: Int16Array, sampleRate: number): Uint8Array {
  const channels = 1
  const bytesPerSample = 2
  const dataSize = samples.length * bytesPerSample * channels
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write("RIFF", 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write("WAVE", 8)
  buffer.write("fmt ", 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28)
  buffer.writeUInt16LE(channels * bytesPerSample, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write("data", 36)
  buffer.writeUInt32LE(dataSize, 40)
  for (let i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(samples[i] ?? 0, 44 + i * 2)
  }
  return new Uint8Array(buffer)
}
