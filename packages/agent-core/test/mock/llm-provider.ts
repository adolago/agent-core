/**
 * Mock LLM Provider for testing
 *
 * Provides mock responses for LLM API calls to enable testing without
 * real API credentials or network access.
 */

// Define types inline as the AI SDK doesn't export these anymore
interface LanguageModelV2StreamPart {
  type: "text-delta" | "tool-call" | "finish" | "error"
  textDelta?: string
  toolCallId?: string
  toolName?: string
  args?: string
  finishReason?: "stop" | "tool-calls" | "length" | "content-filter" | "error"
  usage?: { promptTokens: number; completionTokens: number }
  error?: Error
}

interface LanguageModelV2Prompt {
  role: "user" | "assistant" | "system" | "tool"
  content: Array<{ type: string; text?: string }>
}

interface LanguageModelV2Options {
  prompt: LanguageModelV2Prompt[]
}

interface LanguageModelV2 {
  specificationVersion: string
  provider: string
  modelId: string
  defaultObjectGenerationMode: string
  doGenerate(options: LanguageModelV2Options): Promise<{
    text?: string
    toolCalls?: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }>
    finishReason: string
    usage: { promptTokens: number; completionTokens: number }
    rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> }
    warnings: unknown[]
  }>
  doStream(options: LanguageModelV2Options): Promise<{
    stream: ReadableStream<LanguageModelV2StreamPart>
    rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> }
    warnings: unknown[]
  }>
}

export interface MockResponse {
  text?: string
  toolCalls?: Array<{
    toolCallId: string
    toolName: string
    args: Record<string, unknown>
  }>
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  finishReason?: "stop" | "tool-calls" | "length" | "content-filter" | "error"
}

export interface MockProviderOptions {
  /** Pre-configured responses for specific prompts (matched by substring) */
  responses?: Map<string, MockResponse>
  /** Default response when no match found */
  defaultResponse?: MockResponse
  /** Artificial delay in ms */
  delay?: number
  /** Simulate errors */
  errorRate?: number
  /** Error to throw when errorRate triggers */
  errorType?: "network" | "auth" | "rate-limit" | "server"
}

const DEFAULT_RESPONSE: MockResponse = {
  text: "This is a mock response from the test LLM provider.",
  usage: {
    promptTokens: 10,
    completionTokens: 20,
    totalTokens: 30,
  },
  finishReason: "stop",
}

export function createMockProvider(options: MockProviderOptions = {}): LanguageModelV2 {
  const {
    responses = new Map(),
    defaultResponse = DEFAULT_RESPONSE,
    delay = 0,
    errorRate = 0,
    errorType = "server",
  } = options

  function getResponseForPrompt(prompt: string): MockResponse {
    for (const [key, response] of responses) {
      if (prompt.includes(key)) {
        return response
      }
    }
    return defaultResponse
  }

  function maybeThrowError() {
    if (errorRate > 0 && Math.random() < errorRate) {
      switch (errorType) {
        case "network":
          throw new Error("Network error: Connection refused")
        case "auth":
          throw new Error("Authentication failed: Invalid API key")
        case "rate-limit":
          throw new Error("Rate limit exceeded: Too many requests")
        case "server":
        default:
          throw new Error("Server error: Internal server error")
      }
    }
  }

  return {
    specificationVersion: "v2",
    provider: "mock",
    modelId: "mock-model",
    defaultObjectGenerationMode: "json",

    async doGenerate(options) {
      maybeThrowError()

      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay))
      }

      const promptText = options.prompt
        .map((p) => {
          if (p.role === "user") {
            return p.content.map((c) => (c.type === "text" ? c.text : "")).join("")
          }
          return ""
        })
        .join("\n")

      const response = getResponseForPrompt(promptText)

      return {
        text: response.text,
        toolCalls: response.toolCalls,
        finishReason: response.finishReason || "stop",
        usage: {
          promptTokens: response.usage?.promptTokens ?? 10,
          completionTokens: response.usage?.completionTokens ?? 20,
        },
        rawCall: {
          rawPrompt: null,
          rawSettings: {},
        },
        warnings: [],
      }
    },

    async doStream(options) {
      maybeThrowError()

      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay))
      }

      const promptText = options.prompt
        .map((p) => {
          if (p.role === "user") {
            return p.content.map((c) => (c.type === "text" ? c.text : "")).join("")
          }
          return ""
        })
        .join("\n")

      const response = getResponseForPrompt(promptText)

      const stream = new ReadableStream<LanguageModelV2StreamPart>({
        async start(controller) {
          // Emit text chunks
          if (response.text) {
            const words = response.text.split(" ")
            for (const word of words) {
              controller.enqueue({
                type: "text-delta",
                textDelta: word + " ",
              })
            }
          }

          // Emit tool calls
          if (response.toolCalls) {
            for (const tc of response.toolCalls) {
              controller.enqueue({
                type: "tool-call",
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                args: JSON.stringify(tc.args),
              })
            }
          }

          // Emit finish
          controller.enqueue({
            type: "finish",
            finishReason: response.finishReason || "stop",
            usage: {
              promptTokens: response.usage?.promptTokens ?? 10,
              completionTokens: response.usage?.completionTokens ?? 20,
            },
          })

          controller.close()
        },
      })

      return {
        stream,
        rawCall: {
          rawPrompt: null,
          rawSettings: {},
        },
        warnings: [],
      }
    },
  }
}

/**
 * Create a mock provider that tracks all calls for assertions
 */
export function createTrackingMockProvider(options: MockProviderOptions = {}) {
  const calls: Array<{
    method: "doGenerate" | "doStream"
    prompt: string
    timestamp: number
  }> = []

  const provider = createMockProvider(options)

  const originalDoGenerate = provider.doGenerate.bind(provider)
  const originalDoStream = provider.doStream.bind(provider)

  provider.doGenerate = async (opts) => {
    const promptText = opts.prompt
      .map((p) => (p.role === "user" ? p.content.map((c) => (c.type === "text" ? c.text : "")).join("") : ""))
      .join("\n")

    calls.push({
      method: "doGenerate",
      prompt: promptText,
      timestamp: Date.now(),
    })

    return originalDoGenerate(opts)
  }

  provider.doStream = async (opts) => {
    const promptText = opts.prompt
      .map((p) => (p.role === "user" ? p.content.map((c) => (c.type === "text" ? c.text : "")).join("") : ""))
      .join("\n")

    calls.push({
      method: "doStream",
      prompt: promptText,
      timestamp: Date.now(),
    })

    return originalDoStream(opts)
  }

  return {
    provider,
    getCalls: () => [...calls],
    clearCalls: () => {
      calls.length = 0
    },
    getLastCall: () => calls[calls.length - 1],
  }
}
