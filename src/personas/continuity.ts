/**
 * Conversation Continuity
 *
 * Handles conversation state persistence across compacting events.
 * Extracts key facts, maintains summaries, and restores context.
 */

import type { ConversationState, PersonaId } from "./types";
import { QdrantMemoryBridge } from "./memory-bridge";

/**
 * Extract key facts from a conversation message.
 * In production, this would use an LLM. For now, simple heuristics.
 */
export function extractKeyFacts(message: string): string[] {
  const facts: string[] = [];

  // Split into sentences
  const sentences = message.split(/[.!?]+/).filter((s) => s.trim().length > 20);

  for (const sentence of sentences) {
    const s = sentence.trim().toLowerCase();

    // Look for fact-like patterns
    if (
      s.includes("is ") ||
      s.includes("are ") ||
      s.includes("was ") ||
      s.includes("were ") ||
      s.includes("has ") ||
      s.includes("have ") ||
      s.includes("prefers ") ||
      s.includes("wants ") ||
      s.includes("needs ") ||
      s.includes("decided ") ||
      s.includes("agreed ")
    ) {
      facts.push(sentence.trim());
    }

    // Look for preferences
    if (
      s.includes("i like ") ||
      s.includes("i prefer ") ||
      s.includes("i want ") ||
      s.includes("i need ")
    ) {
      facts.push(sentence.trim());
    }

    // Look for decisions
    if (
      s.includes("we should ") ||
      s.includes("we will ") ||
      s.includes("let's ") ||
      s.includes("the plan is ")
    ) {
      facts.push(sentence.trim());
    }
  }

  // Deduplicate and limit
  return Array.from(new Set(facts)).slice(0, 20);
}

/**
 * Generate a summary of messages.
 * In production, this would use an LLM.
 */
export function generateSummary(messages: string[]): string {
  if (messages.length === 0) return "";

  // For now, take the last few messages and create a simple summary
  const recentMessages = messages.slice(-10);

  const parts = [
    "## Conversation Summary",
    "",
    `**Messages:** ${messages.length} total`,
    "",
    "### Recent Exchange:",
    "",
  ];

  for (const msg of recentMessages) {
    // Truncate long messages
    const truncated = msg.length > 200 ? msg.slice(0, 200) + "..." : msg;
    parts.push(`- ${truncated}`);
  }

  return parts.join("\n");
}

/**
 * Merge new facts with existing ones, removing duplicates and old info.
 */
export function mergeFacts(
  existingFacts: string[],
  newFacts: string[],
  maxFacts: number
): string[] {
  // Combine and deduplicate
  const allFacts = [...existingFacts, ...newFacts];
  const seen: Record<string, boolean> = {};
  const unique: string[] = [];

  for (const fact of allFacts) {
    const normalized = fact.toLowerCase().trim();
    if (!seen[normalized]) {
      seen[normalized] = true;
      unique.push(fact);
    }
  }

  // Keep most recent (assuming they're in order)
  return unique.slice(-maxFacts);
}

/**
 * Create a new conversation state
 */
export function createConversationState(
  sessionId: string,
  leadPersona: PersonaId,
  previousSessionId?: string
): ConversationState {
  const sessionChain = previousSessionId ? [previousSessionId] : [];

  return {
    sessionId,
    leadPersona,
    summary: "",
    plan: "",
    objectives: [],
    keyFacts: [],
    sessionChain,
    updatedAt: Date.now(),
  };
}

/**
 * Update conversation state with new information
 */
export function updateConversationState(
  state: ConversationState,
  updates: {
    messages?: string[];
    newFacts?: string[];
    plan?: string;
    objectives?: string[];
  },
  config: { maxKeyFacts: number }
): ConversationState {
  const newState = { ...state };

  // Update summary if messages provided
  if (updates.messages) {
    newState.summary = generateSummary(updates.messages);
  }

  // Merge facts
  if (updates.newFacts) {
    newState.keyFacts = mergeFacts(
      state.keyFacts,
      updates.newFacts,
      config.maxKeyFacts
    );
  }

  // Update plan if provided
  if (updates.plan !== undefined) {
    newState.plan = updates.plan;
  }

  // Update objectives if provided
  if (updates.objectives !== undefined) {
    newState.objectives = updates.objectives;
  }

  newState.updatedAt = Date.now();

  return newState;
}

/**
 * Format conversation state for injection into a prompt
 */
export function formatContextForPrompt(state: ConversationState): string {
  const parts: string[] = [];

  parts.push("# Conversation Context (Restored)");
  parts.push("");

  if (state.summary) {
    parts.push("## Previous Conversation Summary");
    parts.push(state.summary);
    parts.push("");
  }

  if (state.plan) {
    parts.push("## Current Plan");
    parts.push(state.plan);
    parts.push("");
  }

  if (state.objectives.length > 0) {
    parts.push("## Active Objectives");
    state.objectives.forEach((obj, i) => {
      parts.push(`${i + 1}. ${obj}`);
    });
    parts.push("");
  }

  if (state.keyFacts.length > 0) {
    parts.push("## Key Facts");
    state.keyFacts.forEach((fact) => {
      parts.push(`- ${fact}`);
    });
    parts.push("");
  }

  if (state.sessionChain.length > 0) {
    parts.push(`_This is session ${state.sessionChain.length + 1} in a continuing conversation._`);
  }

  return parts.join("\n");
}

/**
 * Continuity Manager - handles all conversation persistence
 */
export class ContinuityManager {
  private memoryBridge: QdrantMemoryBridge;
  private config: { maxKeyFacts: number; autoSummarize: boolean };
  private currentState?: ConversationState;

  constructor(
    memoryBridge: QdrantMemoryBridge,
    config?: { maxKeyFacts?: number; autoSummarize?: boolean }
  ) {
    this.memoryBridge = memoryBridge;
    this.config = {
      maxKeyFacts: config?.maxKeyFacts ?? 50,
      autoSummarize: config?.autoSummarize ?? true,
    };
  }

  /**
   * Start a new conversation session
   */
  async startSession(
    sessionId: string,
    leadPersona: PersonaId,
    previousSessionId?: string
  ): Promise<ConversationState> {
    // Try to load previous session if specified
    let previousState: ConversationState | null = null;
    if (previousSessionId) {
      previousState = await this.memoryBridge.loadConversationState(previousSessionId);
    } else {
      // Try to find the most recent conversation for this persona
      previousState = await this.memoryBridge.findRecentConversation(leadPersona);
    }

    // Create new state
    this.currentState = createConversationState(sessionId, leadPersona);

    // Carry over context from previous session
    if (previousState) {
      this.currentState.sessionChain = [
        ...previousState.sessionChain,
        previousState.sessionId,
      ];
      this.currentState.keyFacts = previousState.keyFacts.slice(
        -this.config.maxKeyFacts
      );
      this.currentState.plan = previousState.plan;
      this.currentState.objectives = previousState.objectives;
    }

    // Save initial state
    await this.memoryBridge.saveConversationState(this.currentState);

    return this.currentState;
  }

  /**
   * Get current state
   */
  getState(): ConversationState | undefined {
    return this.currentState;
  }

  /**
   * Process new messages and update state
   */
  async processMessages(messages: string[]): Promise<ConversationState> {
    if (!this.currentState) {
      throw new Error("No active session. Call startSession first.");
    }

    // Extract facts from new messages
    const newFacts: string[] = [];
    for (const msg of messages) {
      newFacts.push(...extractKeyFacts(msg));
    }

    // Update state
    this.currentState = updateConversationState(
      this.currentState,
      {
        messages,
        newFacts,
      },
      this.config
    );

    // Save to memory
    await this.memoryBridge.saveConversationState(this.currentState);

    // Store individual facts as memories for semantic search
    if (newFacts.length > 0) {
      await this.memoryBridge.storeKeyFacts(newFacts, this.currentState.sessionId);
    }

    return this.currentState;
  }

  /**
   * Update plan
   */
  async updatePlan(plan: string): Promise<void> {
    if (!this.currentState) {
      throw new Error("No active session");
    }

    this.currentState.plan = plan;
    this.currentState.updatedAt = Date.now();
    await this.memoryBridge.saveConversationState(this.currentState);
  }

  /**
   * Add objective
   */
  async addObjective(objective: string): Promise<void> {
    if (!this.currentState) {
      throw new Error("No active session");
    }

    this.currentState.objectives.push(objective);
    this.currentState.updatedAt = Date.now();
    await this.memoryBridge.saveConversationState(this.currentState);
  }

  /**
   * Remove objective
   */
  async removeObjective(index: number): Promise<void> {
    if (!this.currentState) {
      throw new Error("No active session");
    }

    if (index >= 0 && index < this.currentState.objectives.length) {
      this.currentState.objectives.splice(index, 1);
      this.currentState.updatedAt = Date.now();
      await this.memoryBridge.saveConversationState(this.currentState);
    }
  }

  /**
   * Get context formatted for prompt injection
   */
  getContextForPrompt(): string {
    if (!this.currentState) {
      return "";
    }
    return formatContextForPrompt(this.currentState);
  }

  /**
   * End session and finalize state
   */
  async endSession(): Promise<void> {
    if (!this.currentState) return;

    await this.memoryBridge.saveConversationState(this.currentState);
    this.currentState = undefined;
  }

  /**
   * Restore a previous session
   */
  async restoreSession(sessionId: string): Promise<ConversationState | null> {
    const state = await this.memoryBridge.loadConversationState(sessionId);
    if (state) {
      this.currentState = state;
    }
    return state;
  }

  /**
   * Search related context from memory
   */
  async searchRelatedContext(query: string, limit = 5): Promise<string[]> {
    const results = await this.memoryBridge.searchMemories(query, limit);
    return results.map((r) => r.content);
  }
}

/**
 * Create a continuity manager
 */
export function createContinuityManager(
  memoryBridge: QdrantMemoryBridge,
  config?: { maxKeyFacts?: number; autoSummarize?: boolean }
): ContinuityManager {
  return new ContinuityManager(memoryBridge, config);
}
