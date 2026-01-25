/**
 * Ephemeral Agent
 *
 * Short-lived agent with federated memory access.
 *
 * Features:
 * - Automatic lifecycle management (spawn → execute → learn → destroy)
 * - Federated memory sync via hub
 * - Tenant isolation with JWT authentication
 * - Memory persistence after agent destruction
 *
 * Ported from claude-flow v3 @agentic-flow/federation
 *
 * @module tiara/federation/ephemeral-agent
 */

import { EventEmitter } from "events";
import type {
  EphemeralAgentConfig,
  AgentContext,
  LearningEpisode,
  AgentDatabase,
  PatternResult,
} from "./types.js";
import { FederationEventTypes } from "./types.js";
import { FederationHub } from "./hub.js";
import { SecurityManager } from "./security.js";

// =============================================================================
// Simple In-Memory Database
// =============================================================================

/**
 * Simple in-memory database for ephemeral agents
 */
class InMemoryDatabase implements AgentDatabase {
  private patterns: PatternResult[] = [];
  private closed = false;

  async patternStore(data: {
    sessionId: string;
    task: string;
    input: string;
    output: string;
    reward: number;
    critique: string;
    success: boolean;
    tokensUsed: number;
    latencyMs: number;
    tenantId: string;
  }): Promise<void> {
    if (this.closed) {
      throw new Error("Database is closed");
    }

    this.patterns.push({
      id: `${data.sessionId}-${Date.now()}`,
      task: data.task,
      input: data.input,
      output: data.output,
      reward: data.reward,
    });
  }

  async patternSearch(params: {
    task: string;
    k: number;
    tenantId: string;
  }): Promise<PatternResult[]> {
    if (this.closed) {
      throw new Error("Database is closed");
    }

    // Simple text matching (production would use vector similarity)
    const taskLower = params.task.toLowerCase();
    const matches = this.patterns.filter((p) =>
      p.task.toLowerCase().includes(taskLower)
    );

    return matches.slice(-params.k);
  }

  close(): void {
    this.closed = true;
    this.patterns = [];
  }

  isClosed(): boolean {
    return this.closed;
  }
}

// =============================================================================
// Ephemeral Agent
// =============================================================================

/**
 * Ephemeral Agent
 *
 * Short-lived agent with automatic lifecycle management and federated memory.
 *
 * @example
 * // Spawn agent
 * const agent = await EphemeralAgent.spawn({
 *   tenantId: 'my-tenant',
 *   lifetime: 300, // 5 minutes
 *   hubEndpoint: 'quic://hub.example.com:4433'
 * });
 *
 * // Execute task
 * const result = await agent.execute(async (db, context) => {
 *   // Query relevant memories
 *   const memories = await db.patternSearch({ task: 'my task', k: 5, tenantId: context.tenantId });
 *
 *   // Do work with memories...
 *   return 'task result';
 * });
 *
 * // Store learning episode
 * await agent.storeEpisode({
 *   task: 'my task',
 *   input: 'input data',
 *   output: 'output result',
 *   reward: 0.9
 * });
 *
 * // Check remaining lifetime
 * console.log(`${agent.getRemainingLifetime()} seconds remaining`);
 *
 * // Destroy when done (or let it auto-destroy at expiration)
 * await agent.destroy();
 */
export class EphemeralAgent extends EventEmitter {
  private config: Required<EphemeralAgentConfig>;
  private context?: AgentContext;
  private hub?: FederationHub;
  private security: SecurityManager;
  private cleanupTimer?: ReturnType<typeof setTimeout>;
  private syncTimer?: ReturnType<typeof setInterval>;

  constructor(config: EphemeralAgentConfig) {
    super();
    this.config = {
      lifetime: 300, // 5 minutes default
      syncInterval: 5000, // 5 seconds default
      enableEncryption: true,
      hubEndpoint: "",
      memoryPath: ":memory:",
      ...config,
    };
    this.security = new SecurityManager();
  }

  /**
   * Spawn a new ephemeral agent with federated memory access
   */
  static async spawn(config: EphemeralAgentConfig): Promise<EphemeralAgent> {
    const agent = new EphemeralAgent(config);
    await agent.initialize();
    return agent;
  }

  /**
   * Initialize agent: setup DB, connect to hub, start lifecycle timers
   */
  private async initialize(): Promise<void> {
    const agentId = `eph-${this.config.tenantId}-${Date.now()}`;
    const spawnTime = Date.now();
    const expiresAt = spawnTime + this.config.lifetime * 1000;

    // Initialize local database instance
    const db = new InMemoryDatabase();

    // Create JWT token for authentication
    const token = await this.security.createAgentToken({
      agentId,
      tenantId: this.config.tenantId,
      expiresAt,
    });

    // Connect to federation hub if endpoint provided
    if (this.config.hubEndpoint) {
      this.hub = new FederationHub({
        endpoint: this.config.hubEndpoint,
        agentId,
        tenantId: this.config.tenantId,
        token,
      });
      await this.hub.connect();

      // Start periodic sync
      if (this.config.syncInterval > 0) {
        this.syncTimer = setInterval(async () => {
          await this.syncWithHub();
        }, this.config.syncInterval);
      }
    }

    // Store context
    this.context = {
      agentId,
      tenantId: this.config.tenantId,
      db,
      spawnTime,
      expiresAt,
    };

    // Schedule automatic cleanup at expiration
    const timeUntilExpiry = expiresAt - Date.now();
    this.cleanupTimer = setTimeout(async () => {
      this.emit(FederationEventTypes.AGENT_EXPIRED, {
        agentId,
        tenantId: this.config.tenantId,
        timestamp: Date.now(),
      });
      await this.destroy();
    }, timeUntilExpiry);

    this.emit(FederationEventTypes.AGENT_SPAWNED, {
      agentId,
      tenantId: this.config.tenantId,
      timestamp: Date.now(),
      details: {
        hubConnected: !!this.hub,
        lifetime: this.config.lifetime,
        expiresAt,
      },
    });
  }

  /**
   * Execute a task within the agent context
   * Automatically syncs memory before and after execution
   */
  async execute<T>(
    task: (db: AgentDatabase, context: AgentContext) => Promise<T>
  ): Promise<T> {
    if (!this.context) {
      throw new Error("Agent not initialized. Call spawn() first.");
    }

    const { agentId, db } = this.context;

    // Check if agent has expired
    if (Date.now() >= this.context.expiresAt) {
      throw new Error(
        `Agent ${agentId} has expired and cannot execute tasks`
      );
    }

    try {
      // Pre-execution sync: pull latest memories from hub
      if (this.hub) {
        await this.syncWithHub();
      }

      // Execute user task
      const result = await task(db, this.context);

      // Post-execution sync: push new memories to hub
      if (this.hub) {
        await this.syncWithHub();
      }

      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Query memories from federated database
   */
  async queryMemories(task: string, k = 5): Promise<PatternResult[]> {
    if (!this.context) {
      throw new Error("Agent not initialized");
    }

    const { db, tenantId } = this.context;

    // Query using pattern search
    const patterns = await db.patternSearch?.({
      task,
      k,
      tenantId, // Apply tenant isolation
    });

    return patterns || [];
  }

  /**
   * Store a learning episode to persistent memory
   */
  async storeEpisode(episode: LearningEpisode): Promise<void> {
    if (!this.context) {
      throw new Error("Agent not initialized");
    }

    const { db, agentId, tenantId } = this.context;

    // Store episode with tenant isolation
    await db.patternStore?.({
      sessionId: agentId,
      task: episode.task,
      input: episode.input,
      output: episode.output,
      reward: episode.reward,
      critique: episode.critique || "",
      success: episode.reward >= 0.7,
      tokensUsed: 0,
      latencyMs: 0,
      tenantId, // Ensure tenant isolation
    });
  }

  /**
   * Sync local memory with federation hub
   */
  private async syncWithHub(): Promise<void> {
    if (!this.hub || !this.context) {
      return;
    }

    try {
      await this.hub.sync(this.context.db);
    } catch (_error) {
      // Sync failure is non-fatal for agent operation
    }
  }

  /**
   * Get remaining lifetime in seconds
   */
  getRemainingLifetime(): number {
    if (!this.context) {
      return 0;
    }
    return Math.max(
      0,
      Math.floor((this.context.expiresAt - Date.now()) / 1000)
    );
  }

  /**
   * Destroy agent and cleanup resources
   * Memory persists in federation hub
   */
  async destroy(): Promise<void> {
    if (!this.context) {
      return;
    }

    const { agentId, db, tenantId } = this.context;

    // Clear timers
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
    }
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    // Final sync to persist any pending changes
    if (this.hub) {
      try {
        await this.syncWithHub();
        await this.hub.disconnect();
      } catch (_error) {
        // Ignore final sync errors
      }
    }

    // Close local database
    try {
      await db.close?.();
    } catch (_error) {
      // Ignore close errors for in-memory databases
    }

    // Clear context
    this.context = undefined;

    this.emit(FederationEventTypes.AGENT_DESTROYED, {
      agentId,
      tenantId,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if agent is still alive
   */
  isAlive(): boolean {
    if (!this.context) {
      return false;
    }
    return Date.now() < this.context.expiresAt;
  }

  /**
   * Get agent info
   */
  getInfo(): AgentContext | null {
    return this.context || null;
  }

  /**
   * Get agent ID
   */
  getAgentId(): string | null {
    return this.context?.agentId || null;
  }

  /**
   * Get tenant ID
   */
  getTenantId(): string {
    return this.config.tenantId;
  }

  /**
   * Check if connected to hub
   */
  isHubConnected(): boolean {
    return this.hub?.isConnected() ?? false;
  }
}

/**
 * Spawn an ephemeral agent
 */
export async function spawnEphemeralAgent(
  config: EphemeralAgentConfig
): Promise<EphemeralAgent> {
  return EphemeralAgent.spawn(config);
}
