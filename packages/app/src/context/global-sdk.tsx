import { createOpencodeClient as createEventClient } from "@opencode-ai/sdk"
import { createOpencodeClient as createApiClient } from "@opencode-ai/sdk/v2/client"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { createGlobalEmitter } from "@solid-primitives/event-bus"
import { batch, onCleanup } from "solid-js"
import { usePlatform } from "./platform"
import { useServer } from "./server"

export type AppEvent = {
  type: string
  properties: any
}

type ResolvedEvent = {
  directory?: string
  payload: AppEvent
}

const resolveEvent = (data: unknown): ResolvedEvent | undefined => {
  if (!data || typeof data !== "object") return
  const record = data as Record<string, any>
  if (record.payload && typeof record.payload === "object") {
    const payload = record.payload as Record<string, any>
    if (typeof payload.type === "string" && "properties" in payload) {
      const directory = typeof record.directory === "string" ? record.directory : undefined
      return { directory, payload: { type: payload.type, properties: payload.properties } }
    }
  }
  if (typeof record.type === "string" && "properties" in record) {
    const directory = typeof record.directory === "string" ? record.directory : undefined
    return { directory, payload: { type: record.type, properties: record.properties } }
  }
}

export const { use: useGlobalSDK, provider: GlobalSDKProvider } = createSimpleContext({
  name: "GlobalSDK",
  init: () => {
    const server = useServer()
    const platform = usePlatform()
    const abort = new AbortController()

    const eventSdk = createEventClient({
      baseUrl: server.url,
      signal: abort.signal,
      fetch: platform.fetch,
    })
    const emitter = createGlobalEmitter<{
      [key: string]: AppEvent
    }>()

    type Queued = { directory: string; payload: AppEvent }

    let queue: Array<Queued | undefined> = []
    const coalesced = new Map<string, number>()
    let timer: ReturnType<typeof setTimeout> | undefined
    let last = 0

    const key = (directory: string, payload: AppEvent) => {
      if (payload.type === "session.status") return `session.status:${directory}:${payload.properties.sessionID}`
      if (payload.type === "lsp.updated") return `lsp.updated:${directory}`
      if (payload.type === "message.part.updated") {
        const part = payload.properties.part
        return `message.part.updated:${directory}:${part.messageID}:${part.id}`
      }
    }

    const flush = () => {
      if (timer) clearTimeout(timer)
      timer = undefined

      const events = queue
      queue = []
      coalesced.clear()
      if (events.length === 0) return

      last = Date.now()
      batch(() => {
        for (const event of events) {
          if (!event) continue
          emitter.emit(event.directory, event.payload)
        }
      })
    }

    const schedule = () => {
      if (timer) return
      const elapsed = Date.now() - last
      timer = setTimeout(flush, Math.max(0, 16 - elapsed))
    }

    const stop = () => {
      flush()
    }

    void (async () => {
      const events = await eventSdk.event.subscribe({ signal: abort.signal })
      let yielded = Date.now()
      for await (const event of events.stream) {
        const resolved = resolveEvent(event)
        if (!resolved) continue
        const payload = resolved.payload
        const props = payload.properties as Record<string, any>
        const directory =
          resolved.directory ??
          (typeof props?.directory === "string" ? props.directory : undefined) ??
          (typeof props?.info?.directory === "string" ? props.info.directory : undefined) ??
          "global"
        const k = key(directory, payload)
        if (k) {
          const i = coalesced.get(k)
          if (i !== undefined) {
            queue[i] = undefined
          }
          coalesced.set(k, queue.length)
        }
        queue.push({ directory, payload })
        schedule()

        if (Date.now() - yielded < 8) continue
        yielded = Date.now()
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
    })()
      .finally(stop)
      .catch(() => undefined)

    onCleanup(() => {
      abort.abort()
      stop()
    })

    const sdk = createApiClient({
      baseUrl: server.url,
      fetch: platform.fetch,
      throwOnError: true,
    })

    return { url: server.url, client: sdk, event: emitter }
  },
})
