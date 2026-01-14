import { describeRoute, resolver, validator } from "hono-openapi"
import { Hono } from "hono"
import { z } from "zod"
import { streamSSE } from "hono/streaming"
import { GlobalBus } from "@/bus/global"
import { Instance } from "../../project/instance"

export const GlobalRoute = new Hono()
  .get(
    "/health",
    describeRoute({
      summary: "Health check",
      description: "Check if the server is running and healthy.",
      operationId: "health.check",
      responses: {
        200: {
          description: "Health check passed",
          content: {
            "application/json": {
              schema: resolver(z.boolean()),
            },
          },
        },
      },
    }),
    async (c) => {
      return c.json(true)
    },
  )
  .get(
    "/event",
    describeRoute({
      summary: "Global event stream (SSE)",
      description:
        "Subscribe to all global events via Server-Sent Events. Useful for dashboards and cross-platform monitoring.",
      operationId: "event.global",
      responses: {
        200: {
          description: "Event stream (text/event-stream)",
        },
      },
    }),
    async (c) => {
      return streamSSE(c, async (stream) => {
        const subscriptions: (() => void)[] = []

        // Pass through all events from the bus
        const handler = async (event: { directory?: string; payload: any }) => {
          await stream.writeSSE({
            event: event.payload.type,
            data: JSON.stringify(event.payload.properties),
          })
        }
        GlobalBus.on("event", handler)
        subscriptions.push(() => GlobalBus.off("event", handler))

        // Send initial state
        await stream.writeSSE({
          event: "connected",
          data: JSON.stringify({ timestamp: Date.now() }),
        })

        // Keepalive every 30 seconds
        const keepalive = setInterval(async () => {
          try {
            await stream.writeSSE({
              event: "keepalive",
              data: JSON.stringify({ timestamp: Date.now() }),
            })
          } catch {
            clearInterval(keepalive)
          }
        }, 30000)

        stream.onAbort(() => {
          clearInterval(keepalive)
          subscriptions.forEach((unsub) => unsub())
        })

        await new Promise(() => {})
      })
    },
  )
  .post(
    "/dispose",
    describeRoute({
      summary: "Dispose instance",
      description: "Clean up and dispose the current OpenCode instance, releasing all resources.",
      operationId: "instance.dispose",
      responses: {
        200: {
          description: "Instance disposed",
          content: {
            "application/json": {
              schema: resolver(z.boolean()),
            },
          },
        },
      },
    }),
    async (c) => {
      await Instance.dispose()
      return c.json(true)
    },
  )
