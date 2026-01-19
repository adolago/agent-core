/**
 * Personas Bootstrap
 *
 * Initializes persona-specific hooks and services.
 * Called by daemon on startup to enable cross-session memory and fact extraction.
 */

import { LifecycleHooks } from "../hooks/lifecycle"
import { Persistence } from "../session/persistence"
import { Session } from "../session"
import { Log } from "../util/log"

const log = Log.create({ service: "personas-bootstrap" })

// Track initialized state
let initialized = false

// Memory instance (lazy loaded to avoid import issues)
let memoryPromise: Promise<any> | null = null

/**
 * Get the unified Memory instance (lazy load)
 */
async function getMemoryInstance(): Promise<any | null> {
  if (!memoryPromise) {
    memoryPromise = (async () => {
      try {
        // Dynamic import to avoid build-time dependency on src/memory
        const memoryPath = "../../../../src/memory/unified.js"
        const memoryModule = await import(memoryPath)
        return memoryModule.getMemory()
      } catch (e) {
        log.debug("Unified Memory not available", {
          error: e instanceof Error ? e.message : String(e),
        })
        return null
      }
    })()
  }
  return memoryPromise
}

/**
 * Initialize persona hooks and services
 */
export async function initPersonas(): Promise<void> {
  if (initialized) {
    log.debug("Personas already initialized")
    return
  }

  log.info("Initializing persona hooks")

  // Pre-initialize unified Memory
  const memory = await getMemoryInstance()
  if (memory) {
    log.info("Unified Memory connected for cross-session context")
  }

  // Register session start hook for memory injection
  LifecycleHooks.on<LifecycleHooks.SessionLifecycle.StartPayload>(
    LifecycleHooks.SessionLifecycle.Start,
    async (payload) => {
      await injectCrossSessionMemory(payload.sessionId, payload.persona)
    },
  )

  // Register session restore hook for memory injection
  LifecycleHooks.on<LifecycleHooks.SessionLifecycle.RestorePayload>(
    LifecycleHooks.SessionLifecycle.Restore,
    async (payload) => {
      await injectCrossSessionMemory(payload.sessionId, payload.persona)
    },
  )

  // Try to initialize external persona hooks (fact extraction, etc.)
  // These are in src/personas/hooks/ which may not be available in all builds
  try {
    // Dynamic import to avoid build-time dependency
    const hooksPath = "../../../../src/personas/hooks/index.js"
    const hooks = await import(hooksPath)
    if (hooks.initFactExtractionHook) {
      hooks.initFactExtractionHook()
      log.info("Fact extraction hook initialized")
    }
  } catch (e) {
    log.debug("External persona hooks not available", {
      error: e instanceof Error ? e.message : String(e),
    })
  }

  initialized = true
  log.info("Personas initialized")
}

/**
 * Inject relevant memories from previous sessions
 */
async function injectCrossSessionMemory(sessionId: string, persona: "zee" | "stanley" | "johny"): Promise<void> {
  try {
    const memory = await getMemoryInstance()
    const memories: string[] = []

    // 1. Get yesterday's session for recent context
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdaySession = await Persistence.getDailySession(persona, yesterday)

    if (yesterdaySession) {
      const previousSession = await Session.get(yesterdaySession.sessionId)
      if (previousSession) {
        log.info("Found previous session for context", {
          persona,
          previousSessionId: yesterdaySession.sessionId,
          previousDate: yesterday.toISOString().split("T")[0],
        })
        memories.push(`[Previous session from ${yesterday.toISOString().split("T")[0]}]`)
      }
    }

    // 2. Search for relevant memories from Qdrant (semantic search)
    if (memory) {
      try {
        // Search for recent facts and important information using unified Memory API
        const personaContext = getPersonaSearchContext(persona)
        const searchResults = await memory.searchPersonaMemories(personaContext, persona, {
          limit: 5,
          categories: ["fact", "preference", "decision"],
        })

        if (searchResults.length > 0) {
          log.info("Found relevant memories", {
            persona,
            count: searchResults.length,
          })

          for (const result of searchResults) {
            const entry = result.entry
            const score = result.score.toFixed(2)
            memories.push(`[Memory (${entry.category}, relevance: ${score})]: ${entry.content}`)
          }
        }
      } catch (memoryError) {
        log.debug("Memory search failed", {
          error: memoryError instanceof Error ? memoryError.message : String(memoryError),
        })
      }
    }

    // 3. Store context for session (to be used by prompt injection)
    if (memories.length > 0) {
      // Store the memory context in session metadata for prompt injection
      // This will be picked up by the prompt builder
      await storeSessionContext(sessionId, memories)
      log.info("Injected cross-session context", {
        sessionId: sessionId.slice(0, 8),
        memoriesCount: memories.length,
      })
    }
  } catch (error) {
    log.debug("Could not inject cross-session memory", {
      sessionId: sessionId.slice(0, 8),
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Get persona-specific search context for memory retrieval
 */
function getPersonaSearchContext(persona: "zee" | "stanley" | "johny"): string {
  switch (persona) {
    case "zee":
      return "personal assistant tasks reminders calendar schedule preferences contacts"
    case "stanley":
      return "portfolio investments stocks markets trading analysis positions"
    case "johny":
      return "learning study knowledge practice concepts understanding progress"
  }
}

/**
 * Store cross-session context for prompt injection
 * Saved as a special system message in the session
 */
async function storeSessionContext(sessionId: string, memories: string[]): Promise<void> {
  // Store as session metadata for prompt injection
  // The prompt builder will look for this and inject it
  try {
    const contextKey = `persona_context_${sessionId}`
    const context = {
      timestamp: Date.now(),
      memories,
    }

    // Store in persistence for retrieval by prompt builder
    await Persistence.setSessionContext(sessionId, context)
  } catch (error) {
    log.debug("Could not store session context", {
      sessionId: sessionId.slice(0, 8),
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Cleanup persona hooks
 */
export function cleanupPersonas(): void {
  // Currently hooks clean up automatically via garbage collection
  initialized = false
  log.info("Personas cleanup complete")
}
