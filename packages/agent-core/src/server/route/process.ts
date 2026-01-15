/**
 * Process Registry API Routes
 *
 * HTTP API for managing the centralized process registry.
 */

import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { z } from "zod"
import { streamSSE } from "hono/streaming"
import {
  ProcessInfo,
  ProcessRegisterInput,
  ProcessUpdateInput,
  ProcessQueryFilter,
  ProcessType,
  ProcessStatus,
} from "../../process/types"
import { getProcessRegistry, ProcessRegistryEvents } from "../../process/registry"
import { errors } from "../error"
import { Log } from "../../util/log"

const log = Log.create({ service: "server:process" })

export const ProcessRoute = new Hono()
  // Register a new process
  .post(
    "/process/register",
    describeRoute({
      summary: "Register process",
      description: "Register a new agent, swarm, worker, or daemon process with the central registry.",
      operationId: "process.register",
      tags: ["Process"],
      responses: {
        200: {
          description: "Successfully registered process",
          content: {
            "application/json": {
              schema: resolver(ProcessInfo),
            },
          },
        },
        ...errors(400),
      },
    }),
    validator("json", ProcessRegisterInput),
    async (c) => {
      const input = c.req.valid("json")
      const registry = getProcessRegistry()
      const process = registry.register(input)
      return c.json(process)
    }
  )

  // List all processes
  .get(
    "/process",
    describeRoute({
      summary: "List processes",
      description: "Get a list of all registered processes with optional filters.",
      operationId: "process.list",
      tags: ["Process"],
      responses: {
        200: {
          description: "List of processes",
          content: {
            "application/json": {
              schema: resolver(ProcessInfo.array()),
            },
          },
        },
      },
    }),
    validator(
      "query",
      z.object({
        type: ProcessType.optional(),
        swarmId: z.string().optional(),
        status: ProcessStatus.optional(),
        parentId: z.string().optional(),
      })
    ),
    async (c) => {
      const filter = c.req.valid("query")
      const registry = getProcessRegistry()
      const processes = registry.list(filter as ProcessQueryFilter)
      return c.json(processes)
    }
  )

  // Get process statistics
  .get(
    "/process/stats",
    describeRoute({
      summary: "Get process statistics",
      description: "Get statistics about registered processes by type and status.",
      operationId: "process.stats",
      tags: ["Process"],
      responses: {
        200: {
          description: "Process statistics",
          content: {
            "application/json": {
              schema: resolver(
                z.object({
                  total: z.number(),
                  byType: z.record(ProcessType, z.number()),
                  byStatus: z.record(ProcessStatus, z.number()),
                  swarms: z.number(),
                  activeAgents: z.number(),
                })
              ),
            },
          },
        },
      },
    }),
    async (c) => {
      const registry = getProcessRegistry()
      const stats = registry.getStats()
      return c.json(stats)
    }
  )

  // SSE stream for process events
  .get(
    "/process/events",
    describeRoute({
      summary: "Process events stream (SSE)",
      description: "Subscribe to real-time process events via Server-Sent Events.",
      operationId: "process.events",
      tags: ["Process"],
      responses: {
        200: {
          description: "Event stream (text/event-stream)",
        },
      },
    }),
    async (c) => {
      return streamSSE(c, async (stream) => {
        const registry = getProcessRegistry()

        const handler = async (event: any) => {
          try {
            await stream.writeSSE({
              event: event.type,
              data: JSON.stringify(event),
            })
          } catch (err) {
            log.error("SSE write error", { error: err })
          }
        }

        // Subscribe to all events
        registry.on("event", handler)

        // Send initial connected event with current stats
        await stream.writeSSE({
          event: "connected",
          data: JSON.stringify({
            timestamp: Date.now(),
            stats: registry.getStats(),
          }),
        })

        // Keepalive
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
          registry.off("event", handler)
        })

        // Keep stream open
        await new Promise(() => {})
      })
    }
  )

  // Get processes by swarm
  .get(
    "/process/swarm/:swarmId",
    describeRoute({
      summary: "Get swarm processes",
      description: "Get all processes belonging to a specific swarm.",
      operationId: "process.bySwarm",
      tags: ["Process"],
      responses: {
        200: {
          description: "List of processes in swarm",
          content: {
            "application/json": {
              schema: resolver(ProcessInfo.array()),
            },
          },
        },
      },
    }),
    validator("param", z.object({ swarmId: z.string() })),
    async (c) => {
      const { swarmId } = c.req.valid("param")
      const registry = getProcessRegistry()
      const processes = registry.getBySwarm(swarmId)
      return c.json(processes)
    }
  )

  // Find available agents with capabilities
  .post(
    "/process/find-available",
    describeRoute({
      summary: "Find available agents",
      description: "Find idle agents with specific capabilities.",
      operationId: "process.findAvailable",
      tags: ["Process"],
      responses: {
        200: {
          description: "List of available agents",
          content: {
            "application/json": {
              schema: resolver(ProcessInfo.array()),
            },
          },
        },
      },
    }),
    validator(
      "json",
      z.object({
        capabilities: z.array(z.string()).optional(),
      })
    ),
    async (c) => {
      const { capabilities } = c.req.valid("json")
      const registry = getProcessRegistry()
      const agents = registry.findAvailable(capabilities)
      return c.json(agents)
    }
  )

  // Get specific process
  .get(
    "/process/:id",
    describeRoute({
      summary: "Get process",
      description: "Get detailed information about a specific process.",
      operationId: "process.get",
      tags: ["Process"],
      responses: {
        200: {
          description: "Process information",
          content: {
            "application/json": {
              schema: resolver(ProcessInfo),
            },
          },
        },
        ...errors(404),
      },
    }),
    validator("param", z.object({ id: z.string() })),
    async (c) => {
      const { id } = c.req.valid("param")
      const registry = getProcessRegistry()
      const process = registry.get(id)

      if (!process) {
        return c.json({ error: "Process not found" }, 404)
      }

      return c.json(process)
    }
  )

  // Update process heartbeat
  .post(
    "/process/:id/heartbeat",
    describeRoute({
      summary: "Process heartbeat",
      description: "Update the heartbeat timestamp for a process to indicate it's still alive.",
      operationId: "process.heartbeat",
      tags: ["Process"],
      responses: {
        200: {
          description: "Heartbeat updated",
          content: {
            "application/json": {
              schema: resolver(ProcessInfo),
            },
          },
        },
        ...errors(404),
      },
    }),
    validator("param", z.object({ id: z.string() })),
    async (c) => {
      const { id } = c.req.valid("param")
      const registry = getProcessRegistry()
      const process = registry.heartbeat(id)

      if (!process) {
        return c.json({ error: "Process not found" }, 404)
      }

      return c.json(process)
    }
  )

  // Update process status/info
  .patch(
    "/process/:id",
    describeRoute({
      summary: "Update process",
      description: "Update process status, current task, or other information.",
      operationId: "process.update",
      tags: ["Process"],
      responses: {
        200: {
          description: "Process updated",
          content: {
            "application/json": {
              schema: resolver(ProcessInfo),
            },
          },
        },
        ...errors(400, 404),
      },
    }),
    validator("param", z.object({ id: z.string() })),
    validator("json", ProcessUpdateInput),
    async (c) => {
      const { id } = c.req.valid("param")
      const input = c.req.valid("json")
      const registry = getProcessRegistry()
      const process = registry.update(id, input)

      if (!process) {
        return c.json({ error: "Process not found" }, 404)
      }

      return c.json(process)
    }
  )

  // Deregister process
  .delete(
    "/process/:id",
    describeRoute({
      summary: "Deregister process",
      description: "Remove a process from the registry.",
      operationId: "process.deregister",
      tags: ["Process"],
      responses: {
        200: {
          description: "Process deregistered",
          content: {
            "application/json": {
              schema: resolver(z.boolean()),
            },
          },
        },
        ...errors(404),
      },
    }),
    validator("param", z.object({ id: z.string() })),
    async (c) => {
      const { id } = c.req.valid("param")
      const registry = getProcessRegistry()
      const success = registry.deregister(id)

      if (!success) {
        return c.json({ error: "Process not found" }, 404)
      }

      return c.json(true)
    }
  )
