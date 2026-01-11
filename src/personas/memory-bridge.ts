/**
 * Memory Bridge
 *
 * Connects the Personas system to Qdrant for persistent state and semantic memory.
 * Handles state persistence, memory storage, and context retrieval.
 */

import type {
  PersonasState,
  PersonasConfig,
  ConversationState,
  MemoryBridge,
} from "./types";
import {
  QdrantVectorStorage,
  QdrantMemoryStore,
  createEmbeddingProvider,
  type EmbeddingProvider,
} from "../memory";
import {
  QDRANT_URL,
  QDRANT_COLLECTION_PERSONAS_STATE,
  QDRANT_COLLECTION_PERSONAS_MEMORY,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  MOCK_EMBEDDING_DIMENSIONS,
} from "../config/constants";

/**
 * Mock embedding provider for testing when no API key is available.
 * Generates deterministic embeddings based on text hash.
 */
class MockEmbeddingProvider implements EmbeddingProvider {
  readonly id = "mock";
  readonly model = "mock-embedding";
  readonly dimension = MOCK_EMBEDDING_DIMENSIONS;

  async embed(text: string): Promise<number[]> {
    // Generate a deterministic embedding based on text
    const vector: number[] = new Array(this.dimension).fill(0);
    for (let i = 0; i < text.length && i < this.dimension; i++) {
      vector[i] = (text.charCodeAt(i) % 100) / 100;
    }
    // Normalize
    const mag = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
    return vector.map((v) => v / (mag || 1));
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}

/**
 * Generate a deterministic UUID from a string (for consistent point IDs)
 */
function stringToUUID(str: string): string {
  // Create a simple hash
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Format as UUID-like string
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `${hex.slice(0, 8)}-${hex.slice(0, 4)}-4${hex.slice(1, 4)}-8${hex.slice(0, 3)}-${hex.padEnd(12, '0').slice(0, 12)}`;
}

/**
 * Qdrant-backed memory bridge for the Personas system.
 */
export class QdrantMemoryBridge implements MemoryBridge {
  private storage: QdrantVectorStorage;
  private memoryStore: QdrantMemoryStore;
  private embedder: EmbeddingProvider;
  private config: PersonasConfig["qdrant"];
  private initialized = false;
  private instanceId: string;

  constructor(config: PersonasConfig["qdrant"], options?: { useMockEmbeddings?: boolean; instanceId?: string }) {
    this.config = config;
    // Generate a stable instance ID based on machine identity or use provided one
    // This prevents state collision when multiple orchestrators run
    this.instanceId = options?.instanceId ?? this.generateInstanceId();

    // Initialize embedding provider
    // Use mock if no API key or explicitly requested
    const usesMock = options?.useMockEmbeddings || !process.env.OPENAI_API_KEY;
    if (usesMock) {
      this.embedder = new MockEmbeddingProvider();
    } else {
      this.embedder = createEmbeddingProvider({
        provider: "openai",
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
      });
    }

    // Initialize Qdrant storage
    this.storage = new QdrantVectorStorage({
      url: config.url,
      apiKey: config.apiKey,
      collection: config.stateCollection,
    });

    // Initialize memory store for semantic search
    this.memoryStore = new QdrantMemoryStore(
      {
        url: config.url,
        apiKey: config.apiKey,
        collection: config.memoryCollection,
      },
      this.embedder
    );
  }

  /**
   * Initialize the memory bridge
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Create collections with correct dimensions for the embedder
    await this.storage.createCollection(this.config.stateCollection, this.embedder.dimension);
    await this.memoryStore.init();

    this.initialized = true;
  }

  /**
   * Generate a stable instance ID for this machine/user
   */
  private generateInstanceId(): string {
    // Use hostname + username for a stable per-machine ID
    const os = require("os");
    const hostname = os.hostname() || "unknown";
    const username = os.userInfo().username || "user";
    return stringToUUID(`personas-${hostname}-${username}`);
  }

  /**
   * Get the state ID for this instance
   */
  private getStateId(): string {
    return stringToUUID(`state-${this.instanceId}`);
  }

  /**
   * Save Personas state to Qdrant
   */
  async saveState(state: PersonasState): Promise<void> {
    await this.init();

    const stateJson = JSON.stringify(state);
    // Use instance-specific UUID for state (prevents multi-instance collision)
    const stateId = this.getStateId();

    // Generate embedding for the state summary
    const stateSummary = this.generateStateSummary(state);
    const embedding = await this.embedder.embed(stateSummary);

    // Upsert the state
    await this.storage.insert([
      {
        id: stateId,
        vector: embedding,
        payload: {
          type: "personas_state",
          state: stateJson,
          summary: stateSummary,
          version: state.version,
          updatedAt: Date.now(),
        },
      },
    ]);

    // Also save conversation state separately if it exists
    if (state.conversation) {
      await this.saveConversationState(state.conversation);
    }
  }

  /**
   * Load Personas state from Qdrant
   */
  async loadState(): Promise<PersonasState | null> {
    await this.init();

    const stateId = this.getStateId();
    const results = await this.storage.get([stateId]);
    const result = results[0];

    if (!result?.payload?.state) {
      return null;
    }

    try {
      return JSON.parse(result.payload.state as string) as PersonasState;
    } catch {
      return null;
    }
  }

  /**
   * Save conversation state for continuity
   */
  async saveConversationState(state: ConversationState): Promise<void> {
    await this.init();

    const conversationId = stringToUUID(`conversation-${state.sessionId}`);

    // Create a rich summary for embedding
    const summaryParts = [
      state.summary,
      `Plan: ${state.plan}`,
      `Objectives: ${state.objectives.join(", ")}`,
      `Key facts: ${state.keyFacts.join("; ")}`,
    ];
    const fullSummary = summaryParts.filter(Boolean).join("\n");

    const embedding = await this.embedder.embed(fullSummary);

    await this.storage.insert([
      {
        id: conversationId,
        vector: embedding,
        payload: {
          type: "conversation_state",
          sessionId: state.sessionId,
          leadPersona: state.leadPersona,
          summary: state.summary,
          plan: state.plan,
          objectives: state.objectives,
          keyFacts: state.keyFacts,
          sessionChain: state.sessionChain,
          updatedAt: state.updatedAt,
        },
      },
    ]);

    // Add to session chain index
    const chainId = stringToUUID(`session-chain-${state.sessionId}`);
    await this.storage.insert([
      {
        id: chainId,
        vector: embedding,
        payload: {
          type: "session_chain",
          sessionId: state.sessionId,
          previousSessions: state.sessionChain,
          updatedAt: state.updatedAt,
        },
      },
    ]);
  }

  /**
   * Load conversation state by session ID
   */
  async loadConversationState(sessionId: string): Promise<ConversationState | null> {
    await this.init();

    const conversationId = stringToUUID(`conversation-${sessionId}`);
    const results = await this.storage.get([conversationId]);
    const result = results[0];

    if (!result?.payload) {
      return null;
    }

    const payload = result.payload as Record<string, unknown>;
    return {
      sessionId: payload.sessionId as string,
      leadPersona: payload.leadPersona as "zee" | "stanley" | "johny",
      summary: payload.summary as string,
      plan: (payload.plan as string) ?? "",
      objectives: (payload.objectives as string[]) ?? [],
      keyFacts: (payload.keyFacts as string[]) ?? [],
      sessionChain: (payload.sessionChain as string[]) ?? [],
      updatedAt: payload.updatedAt as number,
    };
  }

  /**
   * Find the most recent conversation state
   */
  async findRecentConversation(
    persona?: "zee" | "stanley" | "johny"
  ): Promise<ConversationState | null> {
    await this.init();

    // Search for conversation states
    const query = persona
      ? `Recent conversation with ${persona}`
      : "Recent conversation state";

    const embedding = await this.embedder.embed(query);
    const filter: Record<string, unknown> = { type: "conversation_state" };
    if (persona) {
      filter.leadPersona = persona;
    }

    const results = await this.storage.search(embedding, {
      limit: 1,
      filter,
    });

    if (results.length === 0) {
      return null;
    }

    const payload = results[0].payload as Record<string, unknown>;
    return {
      sessionId: payload.sessionId as string,
      leadPersona: payload.leadPersona as "zee" | "stanley" | "johny",
      summary: payload.summary as string,
      plan: (payload.plan as string) ?? "",
      objectives: (payload.objectives as string[]) ?? [],
      keyFacts: (payload.keyFacts as string[]) ?? [],
      sessionChain: (payload.sessionChain as string[]) ?? [],
      updatedAt: payload.updatedAt as number,
    };
  }

  /**
   * Store a memory entry for semantic retrieval
   * Memories are isolated by persona namespace for privacy
   */
  async storeMemory(
    content: string,
    metadata: Record<string, unknown>
  ): Promise<string> {
    await this.init();

    // Require persona for proper isolation
    const persona = metadata.persona as string;
    if (!persona) {
      throw new Error("Memory storage requires persona in metadata for isolation");
    }

    // Use persona-specific namespace for isolation
    const namespace = `personas:${persona}`;

    const memory = await this.memoryStore.save({
      content,
      category: "context",
      source: "agent",
      senderId: persona,
      namespace,
      metadata,
    });

    return memory.id;
  }

  /**
   * Search memories by semantic similarity
   * Can search within a specific persona's namespace or across all personas
   */
  async searchMemories(
    query: string,
    limit = 10,
    options?: { persona?: string; includeShared?: boolean }
  ): Promise<Array<{ id: string; content: string; score: number }>> {
    await this.init();

    // If persona specified, search only that persona's namespace
    // Otherwise search the shared namespace
    const namespace = options?.persona
      ? `personas:${options.persona}`
      : "personas:shared";

    const results = await this.memoryStore.search(query, {
      limit,
      namespace,
    });

    return results.map((r) => ({
      id: r.id,
      content: r.content,
      score: r.score,
    }));
  }

  /**
   * Search memories across all personas (for cross-persona context)
   */
  async searchAllPersonaMemories(
    query: string,
    limit = 10
  ): Promise<Array<{ id: string; content: string; score: number; persona?: string }>> {
    await this.init();

    // Search without namespace filter to get all memories
    const results = await this.memoryStore.search(query, {
      limit,
    });

    return results.map((r) => ({
      id: r.id,
      content: r.content,
      score: r.score,
      persona: r.senderId,
    }));
  }

  /**
   * Get memories by IDs
   */
  async getMemories(ids: string[]): Promise<Array<{ id: string; content: string }>> {
    await this.init();

    const memories: Array<{ id: string; content: string }> = [];
    for (const id of ids) {
      const memory = await this.memoryStore.get(id);
      if (memory) {
        memories.push({ id: memory.id, content: memory.content });
      }
    }

    return memories;
  }

  /**
   * Store key facts extracted from conversation
   */
  async storeKeyFacts(facts: string[], sessionId: string, persona: string): Promise<void> {
    await this.init();

    for (const fact of facts) {
      await this.storeMemory(fact, {
        type: "key_fact",
        sessionId,
        persona,
        extractedAt: Date.now(),
      });
    }
  }

  /**
   * Get relevant context for a new task
   */
  async getTaskContext(
    taskDescription: string,
    options?: {
      limit?: number;
      includeKeyFacts?: boolean;
      sessionId?: string;
      persona?: string;
    }
  ): Promise<{
    relevantMemories: Array<{ content: string; score: number }>;
    conversationState?: ConversationState;
  }> {
    await this.init();

    const limit = options?.limit ?? 5;

    // Search for relevant memories (persona-specific if provided)
    const memories = await this.searchMemories(taskDescription, limit, {
      persona: options?.persona,
    });

    // Load conversation state if session ID provided
    let conversationState: ConversationState | undefined;
    if (options?.sessionId) {
      const state = await this.loadConversationState(options.sessionId);
      if (state) {
        conversationState = state;
      }
    } else {
      // Try to find the most recent conversation
      const recent = await this.findRecentConversation();
      if (recent) {
        conversationState = recent;
      }
    }

    return {
      relevantMemories: memories.map((m) => ({ content: m.content, score: m.score })),
      conversationState,
    };
  }

  /**
   * Generate a summary of the state for embedding
   */
  private generateStateSummary(state: PersonasState): string {
    const parts: string[] = [];

    parts.push(`Personas state v${state.version}`);

    if (state.workers.length > 0) {
      const workersByPersona = state.workers.reduce(
        (acc, w) => {
          acc[w.persona] = (acc[w.persona] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );
      parts.push(`Workers: ${JSON.stringify(workersByPersona)}`);
    }

    if (state.tasks.length > 0) {
      const pendingTasks = state.tasks.filter((t) => t.status === "pending").length;
      const runningTasks = state.tasks.filter((t) => t.status === "running").length;
      parts.push(`Tasks: ${pendingTasks} pending, ${runningTasks} running`);
    }

    if (state.conversation) {
      parts.push(`Lead: ${state.conversation.leadPersona}`);
      parts.push(`Summary: ${state.conversation.summary.slice(0, 200)}`);
    }

    parts.push(`Stats: ${state.stats.totalTasksCompleted} tasks completed`);

    return parts.join("\n");
  }

  /**
   * Clean up old memories and states
   */
  async cleanup(): Promise<number> {
    await this.init();

    // Delete expired memories
    const deleted = await this.memoryStore.deleteExpired();

    return deleted;
  }
}

/**
 * Create a memory bridge with default configuration
 */
export function createMemoryBridge(
  config?: Partial<PersonasConfig["qdrant"]>,
  options?: { useMockEmbeddings?: boolean }
): QdrantMemoryBridge {
  const fullConfig: PersonasConfig["qdrant"] = {
    url: config?.url ?? QDRANT_URL,
    stateCollection: config?.stateCollection ?? QDRANT_COLLECTION_PERSONAS_STATE,
    memoryCollection: config?.memoryCollection ?? QDRANT_COLLECTION_PERSONAS_MEMORY,
    apiKey: config?.apiKey,
  };

  return new QdrantMemoryBridge(fullConfig, options);
}
