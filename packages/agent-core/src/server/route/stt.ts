import { Hono } from "hono"
import { describeRoute, resolver } from "hono-openapi"
import { z } from "zod"
import { Dictation } from "@/cli/cmd/tui/util/dictation"
import { Log } from "@/util/log"

const log = Log.create({ service: "server:stt" })

const InworldTranscribeInput = z.object({
  audio: z.string().describe("Base64-encoded WAV audio"),
})

const InworldTranscribeResponse = z.object({
  success: z.boolean(),
  text: z.string().optional(),
  error: z.string().optional(),
})

type InworldTranscribeResponse = z.infer<typeof InworldTranscribeResponse>

export const SttRoute = new Hono().post(
  "/inworld",
  describeRoute({
    summary: "Transcribe audio via Inworld Runtime STT",
    description: "Transcribe base64-encoded WAV audio using the configured Inworld Runtime STT graph.",
    operationId: "stt.inworld.transcribe",
    responses: {
      200: {
        description: "Transcription result",
        content: {
          "application/json": {
            schema: resolver(InworldTranscribeResponse),
          },
        },
      },
      400: {
        description: "Invalid request",
        content: {
          "application/json": {
            schema: resolver(InworldTranscribeResponse),
          },
        },
      },
      500: {
        description: "Server error",
        content: {
          "application/json": {
            schema: resolver(InworldTranscribeResponse),
          },
        },
      },
    },
  }),
  async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      const payload: InworldTranscribeResponse = { success: false, error: "Invalid JSON body" }
      return c.json(payload, 400)
    }

    const parsed = InworldTranscribeInput.safeParse(body)
    if (!parsed.success) {
      const payload: InworldTranscribeResponse = { success: false, error: "Invalid request body" }
      return c.json(payload, 400)
    }

    const config = await Dictation.resolveConfig()
    if (!config) {
      const payload: InworldTranscribeResponse = { success: false, error: "Inworld STT not configured" }
      return c.json(payload, 400)
    }

    const audio = Buffer.from(parsed.data.audio, "base64")
    if (audio.length === 0) {
      const payload: InworldTranscribeResponse = { success: false, error: "Audio payload is empty" }
      return c.json(payload, 400)
    }

    try {
      const text = await Dictation.transcribe({ config, audio })
      const payload: InworldTranscribeResponse = { success: true, ...(text ? { text } : {}) }
      return c.json(payload)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.warn("inworld transcription failed", { error: message })
      const payload: InworldTranscribeResponse = { success: false, error: message }
      return c.json(payload, 500)
    }
  },
)
