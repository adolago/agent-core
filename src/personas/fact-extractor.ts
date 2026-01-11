/**
 * LLM-Based Key Facts Extraction
 *
 * Extracts important facts from conversations using an LLM for better accuracy.
 * Falls back to heuristic extraction when LLM is unavailable.
 */

import { generateText } from "ai";
import { extractKeyFacts as heuristicExtract } from "./continuity";
import { Log } from "../../packages/agent-core/src/util/log";

const log = Log.create({ service: "fact-extractor" });

// Extraction prompt for the LLM
const EXTRACTION_PROMPT = `You are a key facts extractor. Analyze the conversation and extract important facts that should be remembered for future interactions.

Focus on:
1. **Personal facts**: Names, relationships, preferences, habits
2. **Decisions made**: Agreements, choices, plans decided upon
3. **Important context**: Project details, deadlines, constraints
4. **User preferences**: How they like things done, communication style
5. **Technical facts**: Stack used, architecture decisions, patterns

Rules:
- Return ONLY a JSON array of strings, each being a single fact
- Keep facts concise (1-2 sentences max)
- Be specific, not generic
- Skip obvious or trivial information
- Maximum 10 most important facts
- If no significant facts, return empty array []

Example output:
["User prefers TypeScript over JavaScript", "The project deadline is March 15", "User's email is example@email.com"]

Conversation to analyze:
---
{CONVERSATION}
---

Extract key facts (JSON array only):`;

export interface FactExtractorConfig {
  /** Model to use for extraction (default: fast/cheap model) */
  model?: ReturnType<typeof import("ai").languageModel>;
  /** Maximum facts to extract per call */
  maxFacts?: number;
  /** Whether to use LLM or fallback to heuristics */
  useLLM?: boolean;
  /** Timeout in ms for LLM call */
  timeout?: number;
}

export interface ExtractedFact {
  content: string;
  confidence: number;
  category: "personal" | "decision" | "context" | "preference" | "technical";
}

/**
 * Extract key facts from conversation text using LLM
 */
export async function extractFactsWithLLM(
  conversation: string,
  model: ReturnType<typeof import("ai").languageModel>,
  config?: { maxFacts?: number; timeout?: number }
): Promise<string[]> {
  const maxFacts = config?.maxFacts ?? 10;
  const timeout = config?.timeout ?? 30000;

  try {
    const prompt = EXTRACTION_PROMPT.replace("{CONVERSATION}", conversation);

    const result = await generateText({
      model,
      prompt,
      maxTokens: 1000,
      temperature: 0.3, // Low temp for more consistent extraction
      abortSignal: AbortSignal.timeout(timeout),
    });

    // Parse the JSON response
    const text = result.text.trim();

    // Handle various response formats
    let facts: string[] = [];

    // Try to find JSON array in response
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      try {
        facts = JSON.parse(jsonMatch[0]);
      } catch {
        // Failed to parse, try line-by-line
        facts = text
          .split("\n")
          .map((line) => line.replace(/^[-*•]\s*/, "").trim())
          .filter((line) => line.length > 10 && line.length < 500);
      }
    }

    // Validate and clean
    return facts
      .filter((f): f is string => typeof f === "string" && f.length > 5)
      .map((f) => f.trim())
      .slice(0, maxFacts);
  } catch (error) {
    log.warn("LLM fact extraction failed, using heuristics", {
      error: error instanceof Error ? error.message : String(error),
    });
    return heuristicExtract(conversation);
  }
}

/**
 * Categorize an extracted fact
 */
export function categorizeFact(fact: string): ExtractedFact["category"] {
  const lower = fact.toLowerCase();

  if (
    lower.includes("prefer") ||
    lower.includes("like") ||
    lower.includes("want") ||
    lower.includes("style")
  ) {
    return "preference";
  }

  if (
    lower.includes("decided") ||
    lower.includes("agreed") ||
    lower.includes("will ") ||
    lower.includes("plan ")
  ) {
    return "decision";
  }

  if (
    lower.includes("name is") ||
    lower.includes("birthday") ||
    lower.includes("email") ||
    lower.includes("phone") ||
    lower.includes("lives in")
  ) {
    return "personal";
  }

  if (
    lower.includes("using") ||
    lower.includes("stack") ||
    lower.includes("framework") ||
    lower.includes("database") ||
    lower.includes("api")
  ) {
    return "technical";
  }

  return "context";
}

/**
 * Smart fact extractor that chooses between LLM and heuristics
 */
export class FactExtractor {
  private model?: ReturnType<typeof import("ai").languageModel>;
  private config: Required<Omit<FactExtractorConfig, "model">>;

  constructor(config?: FactExtractorConfig) {
    this.model = config?.model;
    this.config = {
      maxFacts: config?.maxFacts ?? 10,
      useLLM: config?.useLLM ?? true,
      timeout: config?.timeout ?? 30000,
    };
  }

  /**
   * Set the model to use for extraction
   */
  setModel(model: ReturnType<typeof import("ai").languageModel>): void {
    this.model = model;
  }

  /**
   * Extract facts from conversation
   */
  async extract(conversation: string): Promise<ExtractedFact[]> {
    let rawFacts: string[];

    if (this.config.useLLM && this.model) {
      rawFacts = await extractFactsWithLLM(conversation, this.model, {
        maxFacts: this.config.maxFacts,
        timeout: this.config.timeout,
      });
    } else {
      rawFacts = heuristicExtract(conversation);
    }

    // Convert to ExtractedFact with categories
    return rawFacts.map((content) => ({
      content,
      confidence: this.config.useLLM && this.model ? 0.9 : 0.6,
      category: categorizeFact(content),
    }));
  }

  /**
   * Extract facts from multiple messages
   */
  async extractFromMessages(messages: string[]): Promise<ExtractedFact[]> {
    // Combine messages into a conversation
    const conversation = messages.join("\n\n");
    return this.extract(conversation);
  }

  /**
   * Merge and deduplicate facts
   */
  mergeFacts(
    existing: ExtractedFact[],
    newFacts: ExtractedFact[],
    maxFacts: number
  ): ExtractedFact[] {
    const all = [...existing, ...newFacts];
    const seen = new Set<string>();
    const unique: ExtractedFact[] = [];

    for (const fact of all) {
      const normalized = fact.content.toLowerCase().trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        unique.push(fact);
      }
    }

    // Sort by confidence, keep most recent/confident
    return unique
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxFacts);
  }
}

/**
 * Create a fact extractor instance
 */
export function createFactExtractor(config?: FactExtractorConfig): FactExtractor {
  return new FactExtractor(config);
}

// Export types
export type { FactExtractorConfig };
