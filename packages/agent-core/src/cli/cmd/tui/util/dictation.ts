import { platform } from "os"

export namespace Dictation {
  export type Config = {
    enabled?: boolean
    endpoint?: string
    api_key?: string
    input_key?: string
    sample_rate?: number
    auto_submit?: boolean
    response_path?: string
    record_command?: string | string[]
  }

  export type RuntimeConfig = {
    endpoint: string
    apiKey: string
    inputKey: string
    sampleRate: number
    autoSubmit: boolean
    responsePath?: string
    recordCommand?: string | string[]
  }

  export type TranscribeState = "sending" | "receiving"
  export type State = "idle" | "listening" | TranscribeState | "transcribing"

  export type RecordingResult = {
    audio: Uint8Array
    stderr: string
  }

  export type RecordingHandle = {
    stop: () => Promise<RecordingResult>
    cancel: () => Promise<void>
  }

  const DEFAULT_SAMPLE_RATE = 16_000
  const DEFAULT_INPUT_KEY = "audio"
  const TEXT_KEYS = new Set(["text", "transcript", "utterance", "output", "result"])

  export function resolveConfig(input?: Config): RuntimeConfig | undefined {
    if (input?.enabled === false) return
    const envEndpoint = process.env["INWORLD_STT_ENDPOINT"] ?? process.env["OPENCODE_INWORLD_STT_ENDPOINT"]
    const envApiKey = process.env["INWORLD_API_KEY"] ?? process.env["OPENCODE_INWORLD_API_KEY"]
    const endpoint = input?.endpoint ?? envEndpoint
    const apiKey = input?.api_key ?? envApiKey
    if (!endpoint || !apiKey) return
    return {
      endpoint,
      apiKey,
      inputKey: input?.input_key ?? DEFAULT_INPUT_KEY,
      sampleRate: input?.sample_rate ?? DEFAULT_SAMPLE_RATE,
      autoSubmit: input?.auto_submit ?? false,
      responsePath: input?.response_path,
      recordCommand: input?.record_command,
    }
  }

  export function resolveRecorderCommand(input: {
    sampleRate: number
    command?: string | string[]
  }): string[] | undefined {
    const override = input.command ?? process.env["OPENCODE_DICTATION_RECORD_COMMAND"]
    if (override) {
      const parsed = Array.isArray(override) ? override : override.trim().split(/\s+/)
      return parsed.length > 0 ? parsed : undefined
    }

    if (platform() !== "linux") return
    const arecord = Bun.which("arecord")
    if (arecord) {
      return [arecord, "-q", "-f", "S16_LE", "-r", String(input.sampleRate), "-c", "1", "-t", "wav"]
    }
    const ffmpeg = Bun.which("ffmpeg")
    if (ffmpeg) {
      return [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "pulse",
        "-i",
        "default",
        "-ac",
        "1",
        "-ar",
        String(input.sampleRate),
        "-f",
        "wav",
        "-",
      ]
    }

    return
  }

  export function startRecording(input: { command: string[] }): RecordingHandle {
    const proc = Bun.spawn({
      cmd: input.command,
      stdout: "pipe",
      stderr: "pipe",
    })
    const stdout = readAll(proc.stdout)
    const stderr = readAllText(proc.stderr)
    let stopped = false

    return {
      async stop() {
        if (!stopped) {
          stopped = true
          proc.kill("SIGINT")
        }
        await proc.exited.catch(() => {})
        return {
          audio: await stdout,
          stderr: await stderr,
        }
      },
      async cancel() {
        if (!stopped) {
          stopped = true
          proc.kill("SIGTERM")
        }
        await proc.exited.catch(() => {})
      },
    }
  }

  export async function transcribe(input: {
    config: RuntimeConfig
    audio: Uint8Array
    fetcher?: typeof fetch
    onState?: (state: TranscribeState) => void
  }): Promise<string | undefined> {
    const fetcher = input.fetcher ?? fetch
    input.onState?.("sending")
    const payload = {
      input: {
        [input.config.inputKey]: {
          data: Buffer.from(input.audio).toString("base64"),
          sampleRate: input.config.sampleRate,
          mimeType: "audio/wav",
        },
      },
    }
    const response = await fetcher(input.config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${input.config.apiKey}`,
      },
      body: JSON.stringify(payload),
    })
    input.onState?.("receiving")

    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(`Dictation request failed (${response.status}): ${text || response.statusText}`)
    }

    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.includes("application/json")) {
      const text = await response.text()
      return text.trim() || undefined
    }

    const data = await response.json()
    if (input.config.responsePath) {
      const resolved = getByPath(data, input.config.responsePath)
      if (typeof resolved === "string") return resolved
    }
    return findTranscript(data)
  }

  function findTranscript(value: unknown): string | undefined {
    if (!value || typeof value !== "object") return
    if (Array.isArray(value)) {
      for (const entry of value) {
        const found = findTranscript(entry)
        if (found) return found
      }
      return
    }

    for (const [key, entry] of Object.entries(value)) {
      if (TEXT_KEYS.has(key.toLowerCase()) && typeof entry === "string") {
        return entry
      }
    }
    for (const entry of Object.values(value)) {
      const found = findTranscript(entry)
      if (found) return found
    }
    return
  }

  function getByPath(value: unknown, path: string): unknown {
    const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean)
    let current: unknown = value
    for (const part of parts) {
      if (current && typeof current === "object") {
        if (Array.isArray(current)) {
          const idx = Number(part)
          if (Number.isNaN(idx)) return
          current = current[idx]
        } else {
          current = (current as Record<string, unknown>)[part]
        }
      } else {
        return
      }
    }
    return current
  }

  async function readAll(stream?: ReadableStream<Uint8Array> | null): Promise<Uint8Array> {
    if (!stream) return new Uint8Array()
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        total += value.length
      }
    }
    const result = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }
    return result
  }

  async function readAllText(stream?: ReadableStream<Uint8Array> | null): Promise<string> {
    const data = await readAll(stream)
    if (data.length === 0) return ""
    return new TextDecoder().decode(data).trim()
  }
}
