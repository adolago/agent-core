import { describe, expect, test, mock } from "bun:test"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { Identifier } from "../../src/id/id"
import { Session } from "../../src/session"
import { MessageV2 } from "../../src/session/message-v2"
import { Flag } from "../../src/flag/flag"

mock.module("../../src/provider/fallback", () => ({
  Fallback: {
    async stream(input: { abort: AbortSignal }) {
      async function* fullStream() {
        // Simulate a provider stream that never yields and ignores abort.
        // This is the failure mode where `for await (...)` would hang forever.
        await new Promise<void>(() => {})
      }
      return { fullStream: fullStream() }
    },
  },
}))

describe("SessionProcessor", () => {
  test("errors if LLM stream never starts", async () => {
    const previousTimeout = Flag.OPENCODE_EXPERIMENTAL_LLM_STREAM_START_TIMEOUT_MS
    ;(Flag as any).OPENCODE_EXPERIMENTAL_LLM_STREAM_START_TIMEOUT_MS = 10
    try {
      await using tmp = await tmpdir()
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const session = await Session.create({})

          const user: MessageV2.User = {
            id: Identifier.ascending("message"),
            sessionID: session.id,
            role: "user",
            time: { created: Date.now() },
            agent: "zee",
            model: { providerID: "mock", modelID: "mock-model" },
          }
          await Session.updateMessage(user)

          const assistant: MessageV2.Assistant = {
            id: Identifier.ascending("message"),
            parentID: user.id,
            sessionID: session.id,
            role: "assistant",
            mode: "zee",
            agent: "zee",
            path: {
              cwd: Instance.directory,
              root: Instance.worktree,
            },
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            modelID: "mock-model",
            providerID: "mock",
            time: { created: Date.now() },
          }
          await Session.updateMessage(assistant)

          const { SessionProcessor } = await import("../../src/session/processor")
          const controller = new AbortController()
          const processor = SessionProcessor.create({
            assistantMessage: assistant,
            sessionID: session.id,
            model: { providerID: "mock", id: "mock-model", name: "mock-model" } as any,
            abort: controller.signal,
          })

          const result = await processor.process({
            user,
            sessionID: session.id,
            model: { providerID: "mock", id: "mock-model", name: "mock-model" } as any,
            agent: { name: "zee" } as any,
            system: [],
            messages: [],
            tools: {},
            abort: controller.signal,
          })

          expect(result).toBe("stop")

          const stored = await MessageV2.get({ sessionID: session.id, messageID: assistant.id })
          expect(stored.info.role).toBe("assistant")
          expect(stored.info.time.completed).toBeDefined()
          expect(stored.info.error).toBeDefined()
        },
      })
    } finally {
      ;(Flag as any).OPENCODE_EXPERIMENTAL_LLM_STREAM_START_TIMEOUT_MS = previousTimeout
    }
  })
})
