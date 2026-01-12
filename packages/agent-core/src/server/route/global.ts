import { describeRoute, resolver, validator } from "hono-openapi"
import { Hono } from "hono"
import { z } from "zod"
import { streamSSE } from "hono/streaming"
import { GlobalBus } from "@/bus/global"
import { Instance } from "../../project/instance"
import { Log } from "../../util/log"
import { Agent } from "../../agent/agent"
import { errors } from "../error"

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
  .post(
    "/log",
    describeRoute({
      summary: "Write log",
      description: "Write a log entry to the server logs with specified level and metadata.",
      operationId: "app.log",
      responses: {
        200: {
          description: "Log entry written successfully",
          content: {
            "application/json": {
              schema: resolver(z.boolean()),
            },
          },
        },
        ...errors(400),
      },
    }),
    validator(
      "json",
      z.object({
        service: z.string().meta({ description: "Service name for the log entry" }),
        level: z.enum(["debug", "info", "error", "warn"]).meta({ description: "Log level" }),
        message: z.string().meta({ description: "Log message" }),
        extra: z
          .record(z.string(), z.any())
          .optional()
          .meta({ description: "Additional metadata for the log entry" }),
      }),
    ),
    async (c) => {
      const { service, level, message, extra } = c.req.valid("json")
      const logger = Log.create({ service })

      switch (level) {
        case "debug":
          logger.debug(message, extra)
          break
        case "info":
          logger.info(message, extra)
          break
        case "error":
          logger.error(message, extra)
          break
        case "warn":
          logger.warn(message, extra)
          break
      }

      return c.json(true)
    },
  )
  .get(
    "/agent",
    describeRoute({
      summary: "List agents",
      description: "Get a list of all available AI agents in the OpenCode system.",
      operationId: "app.agents",
      responses: {
        200: {
          description: "List of agents",
          content: {
            "application/json": {
              schema: resolver(Agent.Info.array()),
            },
          },
        },
      },
    }),
    async (c) => {
      const modes = await Agent.list()
      return c.json(modes)
    },
  )
