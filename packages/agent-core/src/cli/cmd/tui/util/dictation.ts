import { platform } from "os"
import path from "path"
import { createRequire } from "module"
import { promisify } from "node:util"
import { fileURLToPath } from "url"
import { Auth } from "@/auth"

export namespace Dictation {
  export type RuntimeMode = "auto" | "force" | "disable"

  export type Config = {
    enabled?: boolean
    endpoint?: string
    api_key?: string
    input_key?: string
    sample_rate?: number
    auto_submit?: boolean
    response_path?: string
    record_command?: string | string[]
    runtime_mode?: RuntimeMode
    max_duration?: number
  }

  export type RuntimeConfig = {
    endpoint: string
    apiKey: string
    inputKey: string
    sampleRate: number
    autoSubmit: boolean
    responsePath?: string
    recordCommand?: string | string[]
    runtimeMode: RuntimeMode
    maxDuration: number
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

  type DecodedAudio = {
    data: number[]
    sampleRate: number
  }

  const DEFAULT_SAMPLE_RATE = 16_000
  const DEFAULT_INPUT_KEY = "__root__"
  const DEFAULT_RUNTIME_MODE: RuntimeMode = "auto"
  const DEFAULT_MAX_DURATION = 30 // seconds - prevents 413 payload too large errors
  const TEXT_KEYS = new Set(["text", "transcript", "utterance", "output", "result"])
  const GRAPH_MISMATCH_CACHE = new Set<string>()
  let runtimeSttBindings: Promise<{ expose: Record<string, unknown> }> | null = null

  export async function resolveConfig(input?: Config): Promise<RuntimeConfig | undefined> {
    if (input?.enabled === false) return
    const envEndpoint = process.env["INWORLD_STT_ENDPOINT"] ?? process.env["OPENCODE_INWORLD_STT_ENDPOINT"]
    const envApiKey = process.env["INWORLD_API_KEY"] ?? process.env["OPENCODE_INWORLD_API_KEY"]

    let endpoint = input?.endpoint ?? envEndpoint
    let apiKey = input?.api_key ?? envApiKey

    if (!endpoint || !apiKey) {
      const storedAuth = await Auth.get("inworld")
      if (storedAuth?.type === "api" && storedAuth.key) {
        try {
          const parsed = JSON.parse(storedAuth.key) as { apiKey?: string; endpoint?: string }
          if (parsed.apiKey && parsed.endpoint) {
            endpoint = endpoint ?? parsed.endpoint
            apiKey = apiKey ?? parsed.apiKey
          }
        } catch {
          // Key is not JSON, ignore
        }
      }
    }
    if (!endpoint || !apiKey) return
    return {
      endpoint,
      apiKey,
      inputKey: input?.input_key ?? DEFAULT_INPUT_KEY,
      sampleRate: input?.sample_rate ?? DEFAULT_SAMPLE_RATE,
      autoSubmit: input?.auto_submit ?? false,
      responsePath: input?.response_path,
      recordCommand: input?.record_command,
      runtimeMode:
        input?.runtime_mode === "force" || input?.runtime_mode === "disable" ? input.runtime_mode : DEFAULT_RUNTIME_MODE,
      maxDuration: input?.max_duration ?? DEFAULT_MAX_DURATION,
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

    const os = platform()
    const ffmpeg = Bun.which("ffmpeg")
    const rec = Bun.which("rec")
    const sox = Bun.which("sox")

    const recCommand = rec
      ? [
          rec,
          "-q",
          "-r",
          String(input.sampleRate),
          "-c",
          "1",
          "-b",
          "16",
          "-e",
          "signed-integer",
          "-t",
          "wav",
          "-",
        ]
      : undefined

    const soxCommand = sox
      ? [
          sox,
          "-q",
          "-d",
          "-r",
          String(input.sampleRate),
          "-c",
          "1",
          "-b",
          "16",
          "-e",
          "signed-integer",
          "-t",
          "wav",
          "-",
        ]
      : undefined

    if (os === "linux") {
      const arecord = Bun.which("arecord")
      if (arecord) {
        return [arecord, "-q", "-f", "S16_LE", "-r", String(input.sampleRate), "-c", "1", "-t", "wav", "-"]
      }
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
      return recCommand ?? soxCommand
    }

    if (os === "darwin") {
      if (recCommand) return recCommand
      if (soxCommand) return soxCommand
      if (ffmpeg) {
        return [
          ffmpeg,
          "-hide_banner",
          "-loglevel",
          "error",
          "-f",
          "avfoundation",
          "-i",
          "none:0",
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

    if (os === "win32") {
      if (recCommand) return recCommand
      if (soxCommand) return soxCommand
      if (ffmpeg) {
        return [
          ffmpeg,
          "-hide_banner",
          "-loglevel",
          "error",
          "-f",
          "dshow",
          "-i",
          "audio=default",
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
    let decoded = decodeWav(input.audio)
    if (!decoded) {
      throw new Error(
        "Dictation expects 16-bit PCM WAV audio. Update tui.dictation.record_command to output WAV.",
      )
    }
    // Truncate audio to max duration to avoid 413 payload too large errors
    const maxSamples = input.config.maxDuration * decoded.sampleRate
    if (decoded.data.length > maxSamples) {
      decoded = { data: decoded.data.slice(0, maxSamples), sampleRate: decoded.sampleRate }
    }
    const runtimeMode = input.config.runtimeMode ?? DEFAULT_RUNTIME_MODE
    if (runtimeMode === "force" || (runtimeMode === "auto" && GRAPH_MISMATCH_CACHE.has(input.config.endpoint))) {
      return await transcribeWithRuntime({
        config: input.config,
        decoded,
        onState: input.onState,
      })
    }
    const audioInput = {
      type: "Audio",
      _iw_type: "Audio",
      data: {
        data: decoded.data,
        sampleRate: decoded.sampleRate,
      },
    }
    const inputKey = input.config.inputKey?.trim()
    const payload = {
      input: !inputKey || inputKey === DEFAULT_INPUT_KEY ? audioInput : { [inputKey]: audioInput },
    }

    try {
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
      const isNdjson = contentType.includes("application/x-ndjson") || contentType.includes("application/ndjson")
      if (isNdjson) {
        const text = await response.text().catch(() => "")
        return parseNdjsonTranscript(text, input.config.responsePath)
      }
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
    } catch (error) {
      if (runtimeMode === "auto" && isInputMismatchError(error)) {
        GRAPH_MISMATCH_CACHE.add(input.config.endpoint)
        try {
          return await transcribeWithRuntime({
            config: input.config,
            decoded,
            onState: input.onState,
          })
        } catch (runtimeError) {
          const baseMessage = error instanceof Error ? error.message : String(error)
          const runtimeMessage = runtimeError instanceof Error ? runtimeError.message : String(runtimeError)
          throw new Error(
            `Dictation failed via graph endpoint (${baseMessage}) and runtime fallback failed (${runtimeMessage}).`,
          )
        }
      }
      throw error
    }
  }

  function decodeWav(input: Uint8Array): DecodedAudio | undefined {
    if (input.byteLength < 44) return
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength)
    if (readTag(view, 0) !== "RIFF" || readTag(view, 8) !== "WAVE") return

    let offset = 12
    let format: { audioFormat: number; channels: number; sampleRate: number; bitsPerSample: number } | undefined
    let dataOffset: number | undefined
    let dataSize: number | undefined

    while (offset + 8 <= input.byteLength) {
      const chunkId = readTag(view, offset)
      const chunkSize = view.getUint32(offset + 4, true)
      offset += 8

      if (chunkId === "fmt ") {
        if (chunkSize < 16) return
        format = {
          audioFormat: view.getUint16(offset, true),
          channels: view.getUint16(offset + 2, true),
          sampleRate: view.getUint32(offset + 4, true),
          bitsPerSample: view.getUint16(offset + 14, true),
        }
        offset += chunkSize
        if (chunkSize % 2 === 1) offset += 1
      } else if (chunkId === "data") {
        dataOffset = offset
        // For streaming WAV, chunkSize may be a placeholder (0x80000000).
        // Use remaining bytes in buffer as actual data size.
        dataSize = Math.min(chunkSize, input.byteLength - offset)
        break // data chunk is last, stop parsing
      } else {
        // Skip unknown chunks
        if (offset + chunkSize > input.byteLength) break
        offset += chunkSize
        if (chunkSize % 2 === 1) offset += 1
      }
    }

    if (!format || dataOffset === undefined || dataSize === undefined) return
    if (format.channels < 1) return
    const bytesPerSample = format.bitsPerSample / 8
    if (!Number.isInteger(bytesPerSample) || bytesPerSample <= 0) return
    const frameSize = bytesPerSample * format.channels
    if (frameSize <= 0) return

    const available = Math.min(dataSize, input.byteLength - dataOffset)
    const sampleCount = Math.floor(available / frameSize)
    const data = new Array<number>(sampleCount)
    const dataView = new DataView(input.buffer, input.byteOffset + dataOffset, available)

    if (format.audioFormat === 1 && format.bitsPerSample === 16) {
      for (let i = 0; i < sampleCount; i += 1) {
        const sample = dataView.getInt16(i * frameSize, true)
        data[i] = sample / 32768
      }
    } else if (format.audioFormat === 3 && format.bitsPerSample === 32) {
      for (let i = 0; i < sampleCount; i += 1) {
        data[i] = dataView.getFloat32(i * frameSize, true)
      }
    } else {
      return
    }

    return { data, sampleRate: format.sampleRate }
  }

  function readTag(view: DataView, offset: number): string {
    return String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    )
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

  function parseNdjsonTranscript(text: string, responsePath?: string): string | undefined {
    if (!text) return
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    let lastTranscript: string | undefined
    for (const line of lines) {
      let entry: unknown
      try {
        entry = JSON.parse(line)
      } catch {
        continue
      }
      if (entry && typeof entry === "object") {
        const error = (entry as Record<string, unknown>).error
        if (typeof error === "string" && error.trim()) {
          throw new Error(error)
        }
      }
      if (responsePath) {
        const resolved = getByPath(entry, responsePath)
        if (typeof resolved === "string" && resolved.trim()) return resolved.trim()
      }
      const found = findTranscript(entry)
      if (found) lastTranscript = found
    }
    return lastTranscript?.trim() || undefined
  }

  function isInputMismatchError(error: unknown): boolean {
    if (!(error instanceof Error)) return false
    return /input type mismatch|missing required input/i.test(error.message)
  }

  async function transcribeWithRuntime(input: {
    config: RuntimeConfig
    decoded: DecodedAudio
    onState?: (state: TranscribeState) => void
  }): Promise<string | undefined> {
    let expose: Record<string, unknown> | undefined
    try {
      ;({ expose } = await ensureRuntimeSttBindings())
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`@inworld/runtime is required for dictation fallback: ${message}`)
    }

    input.onState?.("sending")
    const sttFactory = expose?.STTFactoryFunctions as
      | { new: () => unknown; delete: (ptr: unknown) => void }
      | undefined
    const sttInterface = expose?.STTInterfaceFunctions as
      | {
          createRemote: (factory: unknown, config: unknown) => Promise<unknown>
          isOK: (ptr: unknown) => boolean
          get: (ptr: unknown) => unknown
          delete: (ptr: unknown) => void
          deleteInterface?: (ptr: unknown) => void
          recognizeSpeech: (stt: unknown, audio: unknown, config: unknown) => Promise<unknown>
        }
      | undefined
    const remoteConfig = expose?.RemoteSTTConfigFunctions as
      | { new: () => unknown; delete: (ptr: unknown) => void; setApiKey: (ptr: unknown, key: string) => void }
      | undefined
    const speechConfig = expose?.SpeechRecognitionConfigFunctions as
      | { new: () => unknown; delete: (ptr: unknown) => void }
      | undefined
    const audioChunk = expose?.AudioChunkFunctions as
      | {
          new: () => unknown
          delete: (ptr: unknown) => void
          setData: (ptr: unknown, data: unknown) => void
          setSampleRate: (ptr: unknown, rate: number) => void
        }
      | undefined
    const vectorFloat = expose?.VectorFloatFunctions as
      | {
          new: () => unknown
          pushBack: (ptr: unknown, value: number) => void
        }
      | undefined
    const inputStream = expose?.InputStreamFunctions as
      | {
          isOK: (ptr: unknown) => boolean
          get: (ptr: unknown) => unknown
          delete: (ptr: unknown) => void
          deleteStream: (ptr: unknown) => void
          hasNext: (ptr: unknown) => Promise<boolean>
          read: (ptr: unknown) => Promise<unknown>
        }
      | undefined
    const inworldString = expose?.InworldStringFunctions as
      | { isOK: (ptr: unknown) => boolean; get: (ptr: unknown) => string }
      | undefined

    if (
      !sttFactory ||
      !sttInterface ||
      !remoteConfig ||
      !speechConfig ||
      !audioChunk ||
      !vectorFloat ||
      !inputStream ||
      !inworldString
    ) {
      throw new Error("@inworld/runtime STT bindings are unavailable")
    }

    let factoryPtr: unknown
    let configPtr: unknown
    let sttPtr: unknown
    let audioPtr: unknown
    let speechPtr: unknown
    let statusOrStream: unknown
    let streamPtr: unknown

    try {
      factoryPtr = sttFactory.new()
      configPtr = remoteConfig.new()
      remoteConfig.setApiKey(configPtr, input.config.apiKey)
      const statusOrStt = await sttInterface.createRemote(factoryPtr, configPtr)
      if (!sttInterface.isOK(statusOrStt)) {
        throw new Error("Failed to create runtime STT instance")
      }
      sttPtr = sttInterface.get(statusOrStt)
      sttInterface.delete(statusOrStt)
      statusOrStream = undefined

      const vectorPtr = vectorFloat.new()
      for (const sample of input.decoded.data) {
        vectorFloat.pushBack(vectorPtr, sample)
      }

      audioPtr = audioChunk.new()
      audioChunk.setData(audioPtr, vectorPtr)
      audioChunk.setSampleRate(audioPtr, input.decoded.sampleRate)

      speechPtr = speechConfig.new()
      statusOrStream = await sttInterface.recognizeSpeech(sttPtr, audioPtr, speechPtr)
      if (!inputStream.isOK(statusOrStream)) {
        throw new Error("Failed to recognize speech via runtime STT")
      }

      streamPtr = inputStream.get(statusOrStream)
      input.onState?.("receiving")

      let text = ""
      while (await inputStream.hasNext(streamPtr)) {
        const statusOrText = await inputStream.read(streamPtr)
        if (!inworldString.isOK(statusOrText)) {
          throw new Error("Failed to read STT stream output")
        }
        const chunk = inworldString.get(statusOrText)
        if (chunk) text += chunk
      }

      return text.trim() || undefined
    } finally {
      if (streamPtr) inputStream.deleteStream(streamPtr)
      if (statusOrStream) inputStream.delete(statusOrStream)
      if (audioPtr) audioChunk.delete(audioPtr)
      if (speechPtr) speechConfig.delete(speechPtr)
      if (sttPtr && sttInterface.deleteInterface) sttInterface.deleteInterface(sttPtr)
      if (configPtr) remoteConfig.delete(configPtr)
      if (factoryPtr) sttFactory.delete(factoryPtr)
    }
  }

  async function ensureRuntimeSttBindings(): Promise<{ expose: Record<string, unknown> }> {
    if (runtimeSttBindings) return runtimeSttBindings
    runtimeSttBindings = (async () => {
      let runtimeDir: string
      try {
        const runtimeEntry = await import.meta.resolve("@inworld/runtime")
        const runtimeEntryPath = fileURLToPath(runtimeEntry)
        runtimeDir = path.dirname(runtimeEntryPath)
      } catch {
        // Fallback for bundled binary: check common locations for @inworld/runtime
        const { existsSync } = await import("fs")
        const { homedir } = await import("os")
        const home = homedir()
        const candidates = [
          // Standard source location
          path.join(home, ".local", "src", "agent-core", "node_modules", "@inworld", "runtime"),
          path.join(home, ".local", "src", "agent-core", "packages", "agent-core", "node_modules", "@inworld", "runtime"),
          // Environment variable override
          process.env.AGENT_CORE_SOURCE && path.join(process.env.AGENT_CORE_SOURCE, "node_modules", "@inworld", "runtime"),
          // Global bun modules
          path.join(home, ".bun", "install", "global", "node_modules", "@inworld", "runtime"),
          // Current working directory
          path.join(process.cwd(), "node_modules", "@inworld", "runtime"),
        ].filter(Boolean) as string[]
        const found = candidates.find((p) => existsSync(path.join(p, "package.json")))
        if (!found) {
          throw new Error(
            `Cannot find module '@inworld/runtime' - install it with: bun add @inworld/runtime (checked: ${candidates.join(", ")})`
          )
        }
        runtimeDir = found
      }
      // Create require relative to the runtime directory, not the bundled binary
      const { pathToFileURL } = await import("url")
      const require = createRequire(pathToFileURL(path.join(runtimeDir, "package.json")).href)
      const expose = require("./expose_binary.js") as Record<string, unknown>

      const hasSttBindings =
        Boolean(expose.RemoteSTTConfigFunctions) &&
        Boolean(expose.STTFactoryFunctions) &&
        Boolean(expose.STTInterfaceFunctions) &&
        Boolean(expose.SpeechRecognitionConfigFunctions)
      if (hasSttBindings) return { expose }

      const platformDetection = require("./common/platform_detection.js") as {
        getBinaryPath?: (baseDir: string) => string
      }
      if (typeof platformDetection.getBinaryPath !== "function") {
        throw new Error("Unable to resolve Inworld runtime binary path")
      }
      const koffiModule = await import("koffi")
      const koffi = (koffiModule as { default?: typeof import("koffi") }).default ?? koffiModule
      const libPath = platformDetection.getBinaryPath(path.join(runtimeDir, "..", "bin"))
      const inworld = koffi.load(libPath)

      const asyncFn = (name: string, ret: string, args: string[]) =>
        promisify(inworld.func(name, ret, args).async)
      const syncFn = (name: string, ret: string, args: string[]) => inworld.func(name, ret, args)

      if (!expose.RemoteSTTConfigFunctions) {
        expose.RemoteSTTConfigFunctions = {
          new: syncFn("inworld_RemoteSTTConfig_new", "void *", []),
          delete: syncFn("inworld_RemoteSTTConfig_delete", "void", ["void *"]),
          setApiKey: syncFn("inworld_RemoteSTTConfig_api_key_set", "void", ["void *", "str"]),
        }
      }

      if (!expose.LocalSTTConfigFunctions) {
        expose.LocalSTTConfigFunctions = {
          new: syncFn("inworld_LocalSTTConfig_new", "void *", []),
          delete: syncFn("inworld_LocalSTTConfig_delete", "void", ["void *"]),
          setModelPath: syncFn("inworld_LocalSTTConfig_model_path_set", "void", ["void *", "str"]),
          setDevice: syncFn("inworld_LocalSTTConfig_device_set", "void", ["void *", "void *"]),
        }
      }

      if (!expose.SpeechRecognitionConfigFunctions) {
        expose.SpeechRecognitionConfigFunctions = {
          new: syncFn("inworld_SpeechRecognitionConfig_new", "void *", []),
          delete: syncFn("inworld_SpeechRecognitionConfig_delete", "void", ["void *"]),
        }
      }

      if (!expose.STTFactoryFunctions) {
        expose.STTFactoryFunctions = {
          new: syncFn("inworld_STTFactory_new", "void *", []),
          delete: syncFn("inworld_STTFactory_delete", "void", ["void *"]),
        }
      }

      if (!expose.STTInterfaceFunctions) {
        expose.STTInterfaceFunctions = {
          createRemote: asyncFn("inworld_STTFactory_CreateSTT_rcinworld_RemoteSTTConfig", "void *", [
            "void *",
            "void *",
          ]),
          createLocal: asyncFn("inworld_STTFactory_CreateSTT_rcinworld_LocalSTTConfig", "void *", [
            "void *",
            "void *",
          ]),
          isOK: syncFn("inworld_StatusOr_STTInterface_ok", "bool", ["void *"]),
          get: syncFn("inworld_StatusOr_STTInterface_value", "void *", ["void *"]),
          delete: syncFn("inworld_StatusOr_STTInterface_delete", "void", ["void *"]),
          recognizeSpeech: asyncFn("inworld_STTInterface_RecognizeSpeech", "void *", [
            "void *",
            "void *",
            "void *",
          ]),
          deleteInterface: syncFn("inworld_STTInterface_delete", "void", ["void *"]),
        }
      }

      return { expose }
    })()

    return runtimeSttBindings
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
