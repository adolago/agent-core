/**
 * Fact Extraction Hook
 *
 * Automatically extracts key facts from conversations when sessions end.
 * Stores facts in the memory system for future retrieval.
 */

import { LifecycleHooks } from "../../../packages/agent-core/src/hooks/lifecycle";
import { Session } from "../../../packages/agent-core/src/session";
import type { MessageV2 } from "../../../packages/agent-core/src/session/message-v2";
import { getMemory } from "../../memory/unified";
import { createFactExtractor, type ExtractedFact } from "../fact-extractor";
import type { MemoryCategory } from "../../memory/types";
import { Log } from "../../../packages/agent-core/src/util/log";

const log = Log.create({ service: "fact-extraction-hook" });

// Configuration
const FACT_EXTRACTION_CONFIG = {
  /** Minimum session duration (ms) before extracting facts */
  minSessionDuration: 60000, // 1 minute
  /** Maximum number of facts to extract per session */
  maxFactsPerSession: 15,
  /** Minimum confidence score to store a fact */
  minConfidence: 0.5,
  /** Whether to use LLM for extraction (set to false for heuristic-only) */
  useLLM: false, // Start with heuristics, enable LLM later
};

// Map fact categories to memory categories
function mapCategory(factCategory: ExtractedFact["category"]): MemoryCategory {
  switch (factCategory) {
    case "personal":
      return "fact";
    case "preference":
      return "preference";
    case "decision":
      return "decision";
    case "technical":
      return "fact";
    case "context":
    default:
      return "note";
  }
}

// Track sessions we've already processed
const processedSessions = new Set<string>();

/**
 * Initialize the fact extraction hook
 */
export function initFactExtractionHook(): () => void {
  const extractor = createFactExtractor({
    useLLM: FACT_EXTRACTION_CONFIG.useLLM,
    maxFacts: FACT_EXTRACTION_CONFIG.maxFactsPerSession,
  });

  // Register hook for session end
  const unsubscribe = LifecycleHooks.on(
    LifecycleHooks.SessionLifecycle.End,
    async (payload) => {
      // Skip if session too short or already processed
      if (payload.duration < FACT_EXTRACTION_CONFIG.minSessionDuration) {
        return;
      }

      if (processedSessions.has(payload.sessionId)) {
        return;
      }
      processedSessions.add(payload.sessionId);

      // Limit the set size to prevent memory leaks
      if (processedSessions.size > 1000) {
        const oldest = processedSessions.values().next().value;
        if (oldest) processedSessions.delete(oldest);
      }

      try {
        await extractAndStoreFacts(payload.sessionId, extractor);
      } catch (error) {
        log.error("Fact extraction hook failed", {
          sessionId: payload.sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  log.info("Initialized and listening for session.end events");

  return unsubscribe;
}

/**
 * Extract facts from a session and store them
 */
async function extractAndStoreFacts(
  sessionId: string,
  extractor: ReturnType<typeof createFactExtractor>
): Promise<void> {
  // Get the memory store
  const store = getMemory();

  // Try to get conversation content from the session
  // For now, we'll use a placeholder - in production this would
  // fetch actual messages from the session
  const conversationContent = await getSessionContent(sessionId);

  if (!conversationContent || conversationContent.length < 100) {
    return; // Not enough content to extract facts
  }

  // Extract facts
  const facts = await extractor.extract(conversationContent);

  // Filter by confidence
  const validFacts = facts.filter(
    (f) => f.confidence >= FACT_EXTRACTION_CONFIG.minConfidence
  );

  if (validFacts.length === 0) {
    return;
  }

  // Store each fact
  for (const fact of validFacts) {
    try {
      await store.save({
        category: mapCategory(fact.category),
        content: fact.content,
        metadata: {
          source: "auto-extraction",
          sessionId,
          factCategory: fact.category,
          confidence: fact.confidence,
          extractedAt: Date.now(),
        },
      });
    } catch (error) {
      log.error("Failed to store fact", {
        sessionId,
        factCategory: fact.category,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  log.info("Extracted and stored facts from session", {
    factCount: validFacts.length,
    sessionId: sessionId.slice(0, 8),
  });
}

/**
 * Get conversation content from a session
 * Retrieves user and assistant messages and formats them for fact extraction.
 */
async function getSessionContent(sessionId: string): Promise<string> {
  try {
    // Load messages from the session
    const messages = await Session.messages({ sessionID: sessionId });

    if (!messages || messages.length === 0) {
      return "";
    }

    // Format messages for extraction
    const conversationParts: string[] = [];

    for (const message of messages) {
      const role = message.info.role;

      // Skip system messages
      if (role !== "user" && role !== "assistant") {
        continue;
      }

      // Extract text content from parts
      const textParts = message.parts
        .filter((part): part is MessageV2.TextPart => part.type === "text")
        .map((part) => part.text);

      if (textParts.length > 0) {
        const roleLabel = role === "user" ? "User" : "Assistant";
        conversationParts.push(`${roleLabel}: ${textParts.join("\n")}`);
      }
    }

    return conversationParts.join("\n\n");
  } catch (error) {
    log.debug("Failed to get session content", {
      sessionId: sessionId.slice(0, 8),
      error: error instanceof Error ? error.message : String(error),
    });
    return "";
  }
}

/**
 * Manually extract facts from provided content
 * Useful for testing or on-demand extraction
 */
export async function extractFactsManually(
  content: string,
  sessionId?: string
): Promise<ExtractedFact[]> {
  const extractor = createFactExtractor({
    useLLM: FACT_EXTRACTION_CONFIG.useLLM,
    maxFacts: FACT_EXTRACTION_CONFIG.maxFactsPerSession,
  });

  const facts = await extractor.extract(content);

  // Optionally store if sessionId provided
  if (sessionId) {
    const store = getMemory();
    for (const fact of facts) {
      if (fact.confidence >= FACT_EXTRACTION_CONFIG.minConfidence) {
        await store.save({
          category: mapCategory(fact.category),
          content: fact.content,
          metadata: {
            source: "manual-extraction",
            sessionId,
            factCategory: fact.category,
            confidence: fact.confidence,
            extractedAt: Date.now(),
          },
        });
      }
    }
  }

  return facts;
}

// Export config for external modification
export { FACT_EXTRACTION_CONFIG };
