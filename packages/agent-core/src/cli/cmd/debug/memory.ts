import { cmd } from "../cmd"
import { bootstrap } from "../../bootstrap"

export const MemoryCommand = cmd({
  command: "memory",
  describe: "show memory and vector database stats",
  builder: (yargs) =>
    yargs
      .command(StatsMemoryCommand)
      .command(SearchMemoryCommand)
      .demandCommand(),
  async handler() {},
})

const StatsMemoryCommand = cmd({
  command: "stats",
  describe: "show memory statistics",
  builder: (yargs) =>
    yargs.option("json", {
      type: "boolean",
      default: false,
      describe: "output as JSON",
    }),
  async handler(args) {
    await bootstrap(process.cwd(), async () => {
      // Try to import Qdrant client
      let qdrantStats: Record<string, unknown> | null = null

      try {
        // Dynamic import to avoid hard dependency
        const { QdrantClient } = await import("@qdrant/js-client-rest")
        const client = new QdrantClient({ url: "http://localhost:6333" })

        // Get collections
        const collections = await client.getCollections()
        const collectionStats = []

        for (const collection of collections.collections) {
          try {
            const info = await client.getCollection(collection.name)
            collectionStats.push({
              name: collection.name,
              vectors: info.indexed_vectors_count ?? 0,
              points: info.points_count ?? 0,
              status: info.status,
            })
          } catch {
            collectionStats.push({
              name: collection.name,
              error: "Failed to get details",
            })
          }
        }

        qdrantStats = {
          connected: true,
          collections: collectionStats,
          totalCollections: collections.collections.length,
        }
      } catch (e) {
        qdrantStats = {
          connected: false,
          error: e instanceof Error ? e.message : String(e),
        }
      }

      // Get Node.js memory stats
      const nodeMemory = process.memoryUsage()

      const stats = {
        node: {
          heapUsed: formatBytes(nodeMemory.heapUsed),
          heapTotal: formatBytes(nodeMemory.heapTotal),
          external: formatBytes(nodeMemory.external),
          rss: formatBytes(nodeMemory.rss),
        },
        qdrant: qdrantStats,
      }

      if (args.json) {
        console.log(JSON.stringify(stats, null, 2))
        return
      }

      console.log("Node.js Memory:")
      console.log(`  Heap Used:  ${stats.node.heapUsed}`)
      console.log(`  Heap Total: ${stats.node.heapTotal}`)
      console.log(`  External:   ${stats.node.external}`)
      console.log(`  RSS:        ${stats.node.rss}`)
      console.log("")

      console.log("Qdrant Vector Database:")
      if (qdrantStats?.connected) {
        const collections = qdrantStats.collections as Array<{
          name: string
          vectors?: number
          points?: number
          status?: string
          error?: string
        }>
        console.log(`  Status: Connected`)
        console.log(`  Collections: ${qdrantStats.totalCollections}`)
        if (collections.length > 0) {
          console.log("")
          for (const col of collections) {
            if (col.error) {
              console.log(`    ${col.name}: ${col.error}`)
            } else {
              console.log(`    ${col.name}:`)
              console.log(`      Vectors: ${col.vectors}`)
              console.log(`      Points:  ${col.points}`)
              console.log(`      Status:  ${col.status}`)
            }
          }
        }
      } else {
        console.log(`  Status: Not connected`)
        console.log(`  Error: ${(qdrantStats as { error?: string })?.error || "Unknown"}`)
        console.log("")
        console.log("  To start Qdrant: docker run -p 6333:6333 qdrant/qdrant")
      }
    })
  },
})

const SearchMemoryCommand = cmd({
  command: "search <query>",
  describe: "search vector memory using semantic similarity",
  builder: (yargs) =>
    yargs
      .positional("query", {
        type: "string",
        demandOption: true,
        describe: "search query",
      })
      .option("collection", {
        alias: "c",
        type: "string",
        default: "agent_memory",
        describe: "collection to search",
      })
      .option("limit", {
        alias: "n",
        type: "number",
        default: 5,
        describe: "number of results",
      })
      .option("category", {
        type: "string",
        describe: "filter by category (fact, preference, decision, note)",
      })
      .option("json", {
        type: "boolean",
        default: false,
        describe: "output as JSON",
      }),
  async handler(args) {
    await bootstrap(process.cwd(), async () => {
      try {
        // Try to get the memory store from src/memory (root of monorepo)
        const { getMemoryStore } = await import("../../../../../../src/memory/store")
        const store = getMemoryStore()

        // Search using the memory store
        const results = await store.search({
          query: args.query,
          limit: args.limit,
          category: args.category as any,
        })

        if (args.json) {
          console.log(JSON.stringify(results, null, 2))
          return
        }

        if (results.length === 0) {
          console.log("No results found.")
          return
        }

        console.log(`Found ${results.length} results for: "${args.query}"`)
        console.log("")

        for (let i = 0; i < results.length; i++) {
          const result = results[i]
          const entry = result.entry
          console.log(`${i + 1}. [${entry.category || "unknown"}] (score: ${result.score?.toFixed(3) || "N/A"})`)
          console.log(`   ${entry.content}`)
          if (entry.metadata) {
            const meta = entry.metadata as Record<string, unknown>
            if (meta.source) console.log(`   Source: ${meta.source}`)
            if (meta.extractedAt) console.log(`   Extracted: ${new Date(meta.extractedAt as number).toLocaleString()}`)
          }
          console.log("")
        }
      } catch (e) {
        // Fallback to direct Qdrant query
        console.log("Note: Memory store not available, falling back to Qdrant info.")
        console.log("")

        try {
          const { QdrantClient } = await import("@qdrant/js-client-rest")
          const client = new QdrantClient({ url: "http://localhost:6333" })

          const info = await client.getCollection(args.collection)
          console.log(`Collection: ${args.collection}`)
          console.log(`  Points: ${info.points_count ?? 0}`)
          console.log(`  Vectors: ${info.indexed_vectors_count ?? 0}`)
          console.log("")
          console.log("To enable semantic search, ensure the embedding model is configured.")
        } catch (qdrantError) {
          console.error(`Error: ${e instanceof Error ? e.message : String(e)}`)
          console.log("")
          console.log("Make sure Qdrant is running (docker run -p 6333:6333 qdrant/qdrant)")
        }
      }
    })
  },
})

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
}
