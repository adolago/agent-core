/**
 * Memory API Routes
 *
 * HTTP API for centralized memory operations via Qdrant.
 * Provides semantic search, storage, and namespace-based isolation.
 */

import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { z } from "zod"
import { errors } from "../error"
import { Log } from "../../util/log"

const log = Log.create({ service: "server:memory" })

// =============================================================================
// Schemas
// =============================================================================

const MemoryCategorySchema = z.enum([
  "conversation",
  "fact",
  "preference",
  "task",
  "decision",
  "relationship",
  "note",
  "pattern",
  "custom",
])

const MemoryMetadataSchema = z.object({
  surface: z.string().optional(),
  sessionId: z.string().optional(),
  agent: z.string().optional(),
  importance: z.number().min(0).max(1).optional(),
  entities: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  extra: z.record(z.string(), z.any()).optional(),
})

const MemoryEntrySchema = z.object({
  id: z.string(),
  category: MemoryCategorySchema,
  content: z.string(),
  summary: z.string().optional(),
  metadata: MemoryMetadataSchema,
  createdAt: z.number(),
  accessedAt: z.number(),
  updatedAt: z.number().optional(),
  ttl: z.number().optional(),
  namespace: z.string().optional(),
})

const MemoryInputSchema = z.object({
  category: MemoryCategorySchema,
  content: z.string().min(1),
  summary: z.string().optional(),
  metadata: MemoryMetadataSchema.optional(),
  ttl: z.number().optional(),
  namespace: z.string().optional(),
})

const MemorySearchParamsSchema = z.object({
  query: z.string().min(1),
  limit: z.number().min(1).max(100).optional().default(10),
  threshold: z.number().min(0).max(1).optional().default(0.5),
  category: z.union([MemoryCategorySchema, z.array(MemoryCategorySchema)]).optional(),
  namespace: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  timeRange: z
    .object({
      start: z.number().optional(),
      end: z.number().optional(),
    })
    .optional(),
})

const MemorySearchResultSchema = z.object({
  entry: MemoryEntrySchema,
  score: z.number(),
  highlights: z.array(z.string()).optional(),
})

const MemoryStatsSchema = z.object({
  total: z.number(),
  byType: z.record(z.string(), z.number()),
  byCategory: z.record(z.string(), z.number()),
})

// =============================================================================
// Memory Service (lazy import to avoid circular deps)
// =============================================================================

let memoryInstance: any = null

async function getMemoryService() {
  if (!memoryInstance) {
    // Dynamic import to avoid bundling issues and circular dependencies
    const { getMemory } = await import("../../../../../src/memory/unified")
    memoryInstance = getMemory()
    await memoryInstance.init()
  }
  return memoryInstance
}

// =============================================================================
// Routes
// =============================================================================

export const MemoryRoute = new Hono()
  // Store a new memory
  .post(
    "/memory/store",
    describeRoute({
      summary: "Store memory",
      description: "Store a new memory entry with semantic embedding.",
      operationId: "memory.store",
      tags: ["Memory"],
      responses: {
        200: {
          description: "Memory stored successfully",
          content: {
            "application/json": {
              schema: resolver(MemoryEntrySchema),
            },
          },
        },
        ...errors(400, 500),
      },
    }),
    validator("json", MemoryInputSchema),
    async (c) => {
      try {
        const input = c.req.valid("json")
        const memory = await getMemoryService()
        const entry = await memory.save(input)
        log.info("Memory stored", { id: entry.id, category: input.category, namespace: input.namespace })
        return c.json(entry)
      } catch (err) {
        log.error("Memory store failed", { error: err })
        return c.json({ error: "Failed to store memory" }, 500)
      }
    }
  )

  // Batch store memories
  .post(
    "/memory/batch",
    describeRoute({
      summary: "Batch store memories",
      description: "Store multiple memory entries at once.",
      operationId: "memory.batch",
      tags: ["Memory"],
      responses: {
        200: {
          description: "Memories stored successfully",
          content: {
            "application/json": {
              schema: resolver(z.array(MemoryEntrySchema)),
            },
          },
        },
        ...errors(400, 500),
      },
    }),
    validator("json", z.object({ entries: z.array(MemoryInputSchema).min(1).max(100) })),
    async (c) => {
      try {
        const { entries } = c.req.valid("json")
        const memory = await getMemoryService()

        const results = []
        for (const input of entries) {
          const entry = await memory.save(input)
          results.push(entry)
        }

        log.info("Batch memory store", { count: results.length })
        return c.json(results)
      } catch (err) {
        log.error("Batch memory store failed", { error: err })
        return c.json({ error: "Failed to batch store memories" }, 500)
      }
    }
  )

  // Semantic search
  .post(
    "/memory/search",
    describeRoute({
      summary: "Search memories",
      description: "Semantic search across memory entries.",
      operationId: "memory.search",
      tags: ["Memory"],
      responses: {
        200: {
          description: "Search results",
          content: {
            "application/json": {
              schema: resolver(z.array(MemorySearchResultSchema)),
            },
          },
        },
        ...errors(400, 500),
      },
    }),
    validator("json", MemorySearchParamsSchema),
    async (c) => {
      try {
        const params = c.req.valid("json")
        const memory = await getMemoryService()
        const results = await memory.search(params)
        log.debug("Memory search", { query: params.query.slice(0, 50), results: results.length })
        return c.json(results)
      } catch (err) {
        log.error("Memory search failed", { error: err })
        return c.json({ error: "Failed to search memories" }, 500)
      }
    }
  )

  // Get memory by ID
  .get(
    "/memory/:id",
    describeRoute({
      summary: "Get memory",
      description: "Get a specific memory entry by ID.",
      operationId: "memory.get",
      tags: ["Memory"],
      responses: {
        200: {
          description: "Memory entry",
          content: {
            "application/json": {
              schema: resolver(MemoryEntrySchema),
            },
          },
        },
        ...errors(404, 500),
      },
    }),
    validator("param", z.object({ id: z.string() })),
    async (c) => {
      try {
        const { id } = c.req.valid("param")
        const memory = await getMemoryService()
        const entry = await memory.get(id)

        if (!entry) {
          return c.json({ error: "Memory not found" }, 404)
        }

        return c.json(entry)
      } catch (err) {
        log.error("Memory get failed", { error: err })
        return c.json({ error: "Failed to get memory" }, 500)
      }
    }
  )

  // List memories by namespace
  .get(
    "/memory/namespace/:namespace",
    describeRoute({
      summary: "List memories by namespace",
      description: "Get all memories in a specific namespace.",
      operationId: "memory.byNamespace",
      tags: ["Memory"],
      responses: {
        200: {
          description: "List of memories",
          content: {
            "application/json": {
              schema: resolver(z.array(MemoryEntrySchema)),
            },
          },
        },
        ...errors(500),
      },
    }),
    validator("param", z.object({ namespace: z.string() })),
    validator(
      "query",
      z.object({
        category: MemoryCategorySchema.optional(),
        limit: z.coerce.number().min(1).max(500).optional().default(100),
      })
    ),
    async (c) => {
      try {
        const { namespace } = c.req.valid("param")
        const { category, limit } = c.req.valid("query")
        const memory = await getMemoryService()
        const entries = await memory.list({ namespace, category, limit })
        return c.json(entries)
      } catch (err) {
        log.error("Memory list failed", { error: err })
        return c.json({ error: "Failed to list memories" }, 500)
      }
    }
  )

  // Delete memory by ID
  .delete(
    "/memory/:id",
    describeRoute({
      summary: "Delete memory",
      description: "Delete a specific memory entry.",
      operationId: "memory.delete",
      tags: ["Memory"],
      responses: {
        200: {
          description: "Memory deleted",
          content: {
            "application/json": {
              schema: resolver(z.object({ success: z.boolean() })),
            },
          },
        },
        ...errors(500),
      },
    }),
    validator("param", z.object({ id: z.string() })),
    async (c) => {
      try {
        const { id } = c.req.valid("param")
        const memory = await getMemoryService()
        await memory.delete(id)
        log.info("Memory deleted", { id })
        return c.json({ success: true })
      } catch (err) {
        log.error("Memory delete failed", { error: err })
        return c.json({ error: "Failed to delete memory" }, 500)
      }
    }
  )

  // Delete memories by filter
  .post(
    "/memory/delete-where",
    describeRoute({
      summary: "Delete memories by filter",
      description: "Delete memories matching the specified criteria.",
      operationId: "memory.deleteWhere",
      tags: ["Memory"],
      responses: {
        200: {
          description: "Deletion result",
          content: {
            "application/json": {
              schema: resolver(z.object({ deleted: z.number() })),
            },
          },
        },
        ...errors(400, 500),
      },
    }),
    validator(
      "json",
      z.object({
        category: MemoryCategorySchema.optional(),
        namespace: z.string().optional(),
        olderThan: z.number().optional(),
      })
    ),
    async (c) => {
      try {
        const filter = c.req.valid("json")
        const memory = await getMemoryService()
        const deleted = await memory.deleteWhere(filter)
        log.info("Memories deleted by filter", { filter, deleted })
        return c.json({ deleted })
      } catch (err) {
        log.error("Memory deleteWhere failed", { error: err })
        return c.json({ error: "Failed to delete memories" }, 500)
      }
    }
  )

  // Get memory statistics
  .get(
    "/memory/stats",
    describeRoute({
      summary: "Get memory statistics",
      description: "Get statistics about stored memories.",
      operationId: "memory.stats",
      tags: ["Memory"],
      responses: {
        200: {
          description: "Memory statistics",
          content: {
            "application/json": {
              schema: resolver(MemoryStatsSchema),
            },
          },
        },
        ...errors(500),
      },
    }),
    async (c) => {
      try {
        const memory = await getMemoryService()
        const stats = await memory.stats()
        return c.json(stats)
      } catch (err) {
        log.error("Memory stats failed", { error: err })
        return c.json({ error: "Failed to get memory statistics" }, 500)
      }
    }
  )

  // Cleanup expired memories
  .post(
    "/memory/cleanup",
    describeRoute({
      summary: "Cleanup expired memories",
      description: "Delete all expired memory entries based on TTL.",
      operationId: "memory.cleanup",
      tags: ["Memory"],
      responses: {
        200: {
          description: "Cleanup result",
          content: {
            "application/json": {
              schema: resolver(z.object({ deleted: z.number() })),
            },
          },
        },
        ...errors(500),
      },
    }),
    async (c) => {
      try {
        const memory = await getMemoryService()
        const deleted = await memory.cleanup()
        log.info("Memory cleanup completed", { deleted })
        return c.json({ deleted })
      } catch (err) {
        log.error("Memory cleanup failed", { error: err })
        return c.json({ error: "Failed to cleanup memories" }, 500)
      }
    }
  )

  // Health check for memory service
  .get(
    "/memory/health",
    describeRoute({
      summary: "Memory health check",
      description: "Check if the memory service is available and connected.",
      operationId: "memory.health",
      tags: ["Memory"],
      responses: {
        200: {
          description: "Health status",
          content: {
            "application/json": {
              schema: resolver(
                z.object({
                  available: z.boolean(),
                  initialized: z.boolean(),
                })
              ),
            },
          },
        },
      },
    }),
    async (c) => {
      try {
        const memory = await getMemoryService()
        return c.json({
          available: memory.isAvailable(),
          initialized: true,
        })
      } catch (err) {
        return c.json({
          available: false,
          initialized: false,
        })
      }
    }
  )
