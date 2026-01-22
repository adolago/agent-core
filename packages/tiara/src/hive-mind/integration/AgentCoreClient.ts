/**
 * Agent-Core Client
 *
 * HTTP client for Tiara's hive-mind to communicate with agent-core's
 * centralized process registry and memory APIs.
 *
 * This enables agent-core to be the single source of truth for:
 * - Process registry (agents, swarms, workers, daemons)
 * - Memory storage (learning patterns, decisions, agent state)
 */

import type { AgentStatus, AgentType, AgentCapability } from '../types';

// =============================================================================
// Types
// =============================================================================

/** Process types that can be registered with agent-core */
export type ProcessType = 'agent' | 'swarm' | 'worker' | 'daemon' | 'queen';

/** Process status in agent-core */
export type ProcessStatus = 'active' | 'busy' | 'idle' | 'offline' | 'error';

/** Process information from agent-core */
export interface ProcessInfo {
  id: string;
  type: ProcessType;
  name: string;
  swarmId?: string;
  parentId?: string;
  capabilities: string[];
  status: ProcessStatus;
  currentTask?: string;
  metadata: Record<string, any>;
  lastHeartbeat: number;
  registeredAt: number;
  host?: string;
}

/** Input for registering a process */
export interface ProcessRegisterInput {
  id?: string;
  type: ProcessType;
  name: string;
  swarmId?: string;
  parentId?: string;
  capabilities?: string[];
  metadata?: Record<string, any>;
  host?: string;
}

/** Input for updating a process */
export interface ProcessUpdateInput {
  status?: ProcessStatus;
  currentTask?: string | null;
  capabilities?: string[];
  metadata?: Record<string, any>;
}

/** Process statistics from agent-core */
export interface ProcessStats {
  total: number;
  byType: Record<ProcessType, number>;
  byStatus: Record<ProcessStatus, number>;
  swarms: number;
  activeAgents: number;
}

/** Memory category for agent-core */
export type MemoryCategory =
  | 'conversation'
  | 'fact'
  | 'preference'
  | 'task'
  | 'decision'
  | 'relationship'
  | 'note'
  | 'pattern'
  | 'custom';

/** Memory entry from agent-core */
export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  content: string;
  summary?: string;
  metadata: Record<string, any>;
  createdAt: number;
  accessedAt: number;
  ttl?: number;
  namespace?: string;
}

/** Input for storing memory */
export interface MemoryStoreInput {
  category: MemoryCategory;
  content: string;
  summary?: string;
  metadata?: Record<string, any>;
  ttl?: number;
  namespace?: string;
}

/** Memory search parameters */
export interface MemorySearchParams {
  query: string;
  limit?: number;
  threshold?: number;
  category?: MemoryCategory | MemoryCategory[];
  namespace?: string | null;
  tags?: string[];
}

/** Memory search result */
export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
}

/** Memory statistics */
export interface MemoryStats {
  total: number;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
}

/** Client configuration */
export interface AgentCoreClientConfig {
  /** Base URL for agent-core daemon (default: http://127.0.0.1:3210) */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

// =============================================================================
// Tiara Namespace Constants
// =============================================================================

/** Tiara-specific namespaces for memory isolation */
export const TiaraNamespaces = {
  /** Learning patterns from agent execution */
  LEARNING: 'tiara:learning',
  /** Queen decision records and rationale */
  DECISIONS: 'tiara:decisions',
  /** Neural patterns for intelligent task routing */
  PATTERNS: 'tiara:patterns',
  /** Agent context snapshots for continuity */
  AGENT_STATE: 'tiara:agent-state',
  /** Swarm execution history */
  SWARM_HISTORY: 'tiara:swarm-history',
  /** Consensus records for distributed decisions */
  CONSENSUS: 'tiara:consensus',
  /** Task trajectories for learning */
  TRAJECTORIES: 'tiara:trajectories',
} as const;

export type TiaraNamespace = (typeof TiaraNamespaces)[keyof typeof TiaraNamespaces];

// =============================================================================
// Agent-Core Client
// =============================================================================

/**
 * HTTP client for communicating with agent-core's centralized services.
 *
 * Usage:
 * ```ts
 * const client = new AgentCoreClient();
 *
 * // Register a process
 * const process = await client.registerProcess({
 *   type: 'agent',
 *   name: 'worker-1',
 *   swarmId: 'swarm-123',
 *   capabilities: ['code_generation', 'debugging'],
 * });
 *
 * // Start heartbeat
 * client.startHeartbeat(process.id);
 *
 * // Store learning pattern
 * await client.storeMemory({
 *   category: 'pattern',
 *   content: 'Agent X performs well on TypeScript tasks',
 *   namespace: TiaraNamespaces.LEARNING,
 * });
 *
 * // Search for similar decisions
 * const results = await client.searchMemory({
 *   query: 'task allocation for code review',
 *   namespace: TiaraNamespaces.DECISIONS,
 * });
 * ```
 */
export class AgentCoreClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly debug: boolean;
  private heartbeatIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor(config: AgentCoreClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? 'http://127.0.0.1:3210';
    this.timeout = config.timeout ?? 30000;
    this.debug = config.debug ?? false;
  }

  // ===========================================================================
  // HTTP Helpers
  // ===========================================================================

  private log(message: string, data?: any): void {
    if (this.debug) {
      console.log(`[AgentCoreClient] ${message}`, data ?? '');
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: any
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      this.log(`${method} ${path}`, body);

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));

        // Handle different error response formats
        let errorMessage: string;
        if (typeof errorData.error === 'string') {
          errorMessage = errorData.error;
        } else if (Array.isArray(errorData.error)) {
          // Validation errors from hono-openapi return an array
          errorMessage = errorData.error.map((e: any) => e.message || JSON.stringify(e)).join('; ');
        } else if (errorData.error) {
          errorMessage = JSON.stringify(errorData.error);
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else {
          errorMessage = JSON.stringify(errorData);
        }

        throw new Error(`HTTP ${response.status}: ${errorMessage}`);
      }

      const result = await response.json();
      this.log(`Response:`, result);
      return result as T;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Request timeout: ${method} ${path}`);
      }
      throw err;
    }
  }

  // ===========================================================================
  // Process Registry API
  // ===========================================================================

  /**
   * Register a new process with agent-core.
   */
  async registerProcess(input: ProcessRegisterInput): Promise<ProcessInfo> {
    return this.request<ProcessInfo>('POST', '/process/register', input);
  }

  /**
   * Get a specific process by ID.
   */
  async getProcess(id: string): Promise<ProcessInfo | null> {
    try {
      return await this.request<ProcessInfo>('GET', `/process/${id}`);
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) {
        return null;
      }
      throw err;
    }
  }

  /**
   * List all registered processes with optional filters.
   */
  async listProcesses(filter?: {
    type?: ProcessType;
    swarmId?: string;
    status?: ProcessStatus;
    parentId?: string;
  }): Promise<ProcessInfo[]> {
    const params = new URLSearchParams();
    if (filter?.type) params.set('type', filter.type);
    if (filter?.swarmId) params.set('swarmId', filter.swarmId);
    if (filter?.status) params.set('status', filter.status);
    if (filter?.parentId) params.set('parentId', filter.parentId);

    const query = params.toString();
    const path = query ? `/process?${query}` : '/process';
    return this.request<ProcessInfo[]>('GET', path);
  }

  /**
   * Get all processes in a specific swarm.
   */
  async getSwarmProcesses(swarmId: string): Promise<ProcessInfo[]> {
    return this.request<ProcessInfo[]>('GET', `/process/swarm/${swarmId}`);
  }

  /**
   * Find available agents with specific capabilities.
   */
  async findAvailableAgents(capabilities?: string[]): Promise<ProcessInfo[]> {
    return this.request<ProcessInfo[]>('POST', '/process/find-available', {
      capabilities: capabilities ?? [],
    });
  }

  /**
   * Get process statistics.
   */
  async getProcessStats(): Promise<ProcessStats> {
    return this.request<ProcessStats>('GET', '/process/stats');
  }

  /**
   * Send heartbeat for a process.
   */
  async heartbeat(id: string): Promise<ProcessInfo | null> {
    try {
      return await this.request<ProcessInfo>('POST', `/process/${id}/heartbeat`);
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Update process status or metadata.
   */
  async updateProcess(id: string, input: ProcessUpdateInput): Promise<ProcessInfo | null> {
    try {
      return await this.request<ProcessInfo>('PATCH', `/process/${id}`, input);
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Deregister a process.
   */
  async deregisterProcess(id: string): Promise<boolean> {
    try {
      await this.request<boolean>('DELETE', `/process/${id}`);
      return true;
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) {
        return false;
      }
      throw err;
    }
  }

  // ===========================================================================
  // Heartbeat Management
  // ===========================================================================

  /**
   * Start automatic heartbeat for a process.
   * Sends heartbeat every 30 seconds by default.
   */
  startHeartbeat(processId: string, intervalMs = 30000): void {
    // Stop existing heartbeat if any
    this.stopHeartbeat(processId);

    const interval = setInterval(async () => {
      try {
        const result = await this.heartbeat(processId);
        if (!result) {
          // Process no longer exists, stop heartbeat
          this.stopHeartbeat(processId);
        }
      } catch (err) {
        this.log(`Heartbeat failed for ${processId}:`, err);
      }
    }, intervalMs);

    this.heartbeatIntervals.set(processId, interval);
    this.log(`Started heartbeat for ${processId}`);
  }

  /**
   * Stop automatic heartbeat for a process.
   */
  stopHeartbeat(processId: string): void {
    const interval = this.heartbeatIntervals.get(processId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(processId);
      this.log(`Stopped heartbeat for ${processId}`);
    }
  }

  /**
   * Stop all automatic heartbeats.
   */
  stopAllHeartbeats(): void {
    for (const [processId] of this.heartbeatIntervals) {
      this.stopHeartbeat(processId);
    }
  }

  // ===========================================================================
  // Memory API
  // ===========================================================================

  /**
   * Store a memory entry.
   */
  async storeMemory(input: MemoryStoreInput): Promise<MemoryEntry> {
    return this.request<MemoryEntry>('POST', '/memory/store', input);
  }

  /**
   * Store multiple memory entries.
   */
  async storeMemoryBatch(entries: MemoryStoreInput[]): Promise<MemoryEntry[]> {
    return this.request<MemoryEntry[]>('POST', '/memory/batch', { entries });
  }

  /**
   * Search memories semantically.
   */
  async searchMemory(params: MemorySearchParams): Promise<MemorySearchResult[]> {
    return this.request<MemorySearchResult[]>('POST', '/memory/search', params);
  }

  /**
   * Get a specific memory by ID.
   */
  async getMemory(id: string): Promise<MemoryEntry | null> {
    try {
      return await this.request<MemoryEntry>('GET', `/memory/${id}`);
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) {
        return null;
      }
      throw err;
    }
  }

  /**
   * List memories by namespace.
   */
  async listMemoriesByNamespace(
    namespace: string,
    options?: { category?: MemoryCategory; limit?: number }
  ): Promise<MemoryEntry[]> {
    const params = new URLSearchParams();
    if (options?.category) params.set('category', options.category);
    if (options?.limit) params.set('limit', String(options.limit));

    const query = params.toString();
    const path = query
      ? `/memory/namespace/${encodeURIComponent(namespace)}?${query}`
      : `/memory/namespace/${encodeURIComponent(namespace)}`;
    return this.request<MemoryEntry[]>('GET', path);
  }

  /**
   * Delete a memory by ID.
   */
  async deleteMemory(id: string): Promise<boolean> {
    try {
      await this.request<{ success: boolean }>('DELETE', `/memory/${id}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete memories matching filter.
   */
  async deleteMemoriesWhere(filter: {
    category?: MemoryCategory;
    namespace?: string;
    olderThan?: number;
  }): Promise<number> {
    const result = await this.request<{ deleted: number }>('POST', '/memory/delete-where', filter);
    return result.deleted;
  }

  /**
   * Get memory statistics.
   */
  async getMemoryStats(): Promise<MemoryStats> {
    return this.request<MemoryStats>('GET', '/memory/stats');
  }

  /**
   * Cleanup expired memories.
   */
  async cleanupMemory(): Promise<number> {
    const result = await this.request<{ deleted: number }>('POST', '/memory/cleanup');
    return result.deleted;
  }

  /**
   * Check memory service health.
   */
  async checkMemoryHealth(): Promise<{ available: boolean; initialized: boolean }> {
    return this.request<{ available: boolean; initialized: boolean }>('GET', '/memory/health');
  }

  // ===========================================================================
  // Tiara-Specific Helpers
  // ===========================================================================

  /**
   * Store a learning pattern.
   */
  async storeLearningPattern(
    description: string,
    data: Record<string, any>,
    confidence = 0.5
  ): Promise<MemoryEntry> {
    return this.storeMemory({
      category: 'pattern',
      content: description,
      namespace: TiaraNamespaces.LEARNING,
      metadata: {
        importance: confidence,
        extra: {
          source: 'tiara',
          type: 'learning_pattern',
          ...data,
        },
      },
    });
  }

  /**
   * Store a Queen decision for future reference.
   */
  async storeDecision(
    decision: {
      decisionType: 'task_assignment' | 'consensus' | 'resource_allocation' | 'swarm_topology';
      context: string;
      decision: string;
      rationale: string;
      outcome?: 'success' | 'partial' | 'failure' | 'pending';
      swarmId?: string;
      agentIds?: string[];
    }
  ): Promise<MemoryEntry> {
    const content = `
Decision: ${decision.decisionType}
Context: ${decision.context}
Decision: ${decision.decision}
Rationale: ${decision.rationale}
Outcome: ${decision.outcome ?? 'pending'}
    `.trim();

    return this.storeMemory({
      category: 'decision',
      content,
      namespace: TiaraNamespaces.DECISIONS,
      metadata: {
        extra: {
          source: 'tiara',
          ...decision,
          timestamp: Date.now(),
        },
      },
    });
  }

  /**
   * Search for similar past decisions.
   */
  async searchSimilarDecisions(
    query: string,
    limit = 5
  ): Promise<MemorySearchResult[]> {
    return this.searchMemory({
      query,
      namespace: TiaraNamespaces.DECISIONS,
      limit,
      category: 'decision',
    });
  }

  /**
   * Store agent state snapshot for continuity.
   */
  async storeAgentState(
    agentId: string,
    state: {
      context: string;
      currentTask?: string;
      learnings?: string[];
      metadata?: Record<string, any>;
    }
  ): Promise<MemoryEntry> {
    const content = `
Agent: ${agentId}
Task: ${state.currentTask ?? 'none'}
Context: ${state.context}
Learnings: ${state.learnings?.join('; ') ?? 'none'}
    `.trim();

    return this.storeMemory({
      category: 'note',
      content,
      namespace: TiaraNamespaces.AGENT_STATE,
      metadata: {
        agent: agentId,
        extra: {
          source: 'tiara',
          ...state,
          timestamp: Date.now(),
        },
      },
    });
  }

  /**
   * Retrieve agent state snapshot.
   */
  async getAgentState(agentId: string): Promise<MemorySearchResult[]> {
    return this.searchMemory({
      query: `Agent: ${agentId}`,
      namespace: TiaraNamespaces.AGENT_STATE,
      limit: 1,
    });
  }

  /**
   * Store swarm execution history.
   */
  async storeSwarmHistory(
    swarmId: string,
    event: {
      type: 'started' | 'task_completed' | 'agent_spawned' | 'consensus_reached' | 'shutdown';
      description: string;
      metadata?: Record<string, any>;
    }
  ): Promise<MemoryEntry> {
    const content = `
Swarm: ${swarmId}
Event: ${event.type}
Description: ${event.description}
    `.trim();

    return this.storeMemory({
      category: 'note',
      content,
      namespace: TiaraNamespaces.SWARM_HISTORY,
      metadata: {
        extra: {
          source: 'tiara',
          swarmId,
          ...event,
          timestamp: Date.now(),
        },
      },
    });
  }

  /**
   * Search swarm history.
   */
  async searchSwarmHistory(
    swarmId: string,
    query?: string,
    limit = 10
  ): Promise<MemorySearchResult[]> {
    return this.searchMemory({
      query: query ?? `Swarm: ${swarmId}`,
      namespace: TiaraNamespaces.SWARM_HISTORY,
      limit,
    });
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Cleanup resources (stop all heartbeats).
   */
  dispose(): void {
    this.stopAllHeartbeats();
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let _instance: AgentCoreClient | null = null;

/**
 * Get the shared AgentCoreClient instance.
 */
export function getAgentCoreClient(config?: AgentCoreClientConfig): AgentCoreClient {
  if (!_instance) {
    _instance = new AgentCoreClient(config);
  }
  return _instance;
}

/**
 * Reset the shared instance (for testing).
 */
export function resetAgentCoreClient(): void {
  if (_instance) {
    _instance.dispose();
    _instance = null;
  }
}
