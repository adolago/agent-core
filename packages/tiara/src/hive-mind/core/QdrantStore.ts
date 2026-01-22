/**
 * QdrantStore - Qdrant-Only Persistence Layer
 *
 * Replaces DatabaseManager with a pure Qdrant implementation via agent-core.
 * All data is stored in Qdrant with namespace isolation:
 * - tiara:swarms - Swarm configurations
 * - tiara:agents - Agent registry
 * - tiara:tasks - Task queue
 * - tiara:communications - Message queue
 * - tiara:consensus - Voting state
 * - tiara:metrics - Performance metrics
 * - tiara:learning - Learning patterns
 * - tiara:decisions - Queen decisions
 */

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import {
  AgentCoreClient,
  getAgentCoreClient,
  type AgentCoreClientConfig,
  type MemoryEntry,
  type MemorySearchResult,
} from "../integration/AgentCoreClient";

// =============================================================================
// Tiara Namespace Constants
// =============================================================================

export const TiaraNamespaces = {
  // Semantic/Learning Namespaces
  LEARNING: "tiara:learning",
  DECISIONS: "tiara:decisions",
  PATTERNS: "tiara:patterns",
  AGENT_STATE: "tiara:agent-state",
  SWARM_HISTORY: "tiara:swarm-history",
  TRAJECTORIES: "tiara:trajectories",

  // Operational Namespaces
  SWARMS: "tiara:swarms",
  AGENTS: "tiara:agents",
  TASKS: "tiara:tasks",
  COMMUNICATIONS: "tiara:communications",
  CONSENSUS: "tiara:consensus",
  METRICS: "tiara:metrics",
  QUEEN_DECISIONS: "tiara:queen-decisions",
} as const;

export type TiaraNamespace = (typeof TiaraNamespaces)[keyof typeof TiaraNamespaces];

// =============================================================================
// Type Definitions
// =============================================================================

export type SwarmTopology = "mesh" | "hierarchical" | "ring" | "star" | "hybrid";
export type AgentStatusType = "idle" | "busy" | "error" | "offline" | "starting";
export type TaskPriority = "critical" | "high" | "medium" | "low";
export type TaskStatus = "pending" | "assigned" | "in_progress" | "completed" | "failed" | "cancelled";
export type TaskStrategy = "single" | "parallel" | "sequential" | "consensus" | "competitive";
export type MessagePriority = "urgent" | "high" | "normal" | "low";
export type MessageType = "task_assignment" | "status_update" | "data_sharing" | "coordination" | "error_report" | "consensus_vote" | "heartbeat" | "broadcast";
export type ConsensusStatus = "pending" | "achieved" | "rejected" | "expired" | "cancelled";

export interface SwarmData {
  id: string;
  name: string;
  topology: SwarmTopology;
  queenMode: boolean;
  maxAgents: number;
  consensusThreshold: number;
  memoryTTL: number;
  config: Record<string, unknown>;
  isActive: boolean;
  createdAt: number;
  updatedAt?: number;
}

export interface AgentData {
  id: string;
  swarmId: string;
  name: string;
  type: string;
  status: AgentStatusType;
  capabilities: string[];
  currentTaskId?: string;
  successCount: number;
  errorCount: number;
  messageCount: number;
  metadata: Record<string, unknown>;
  createdAt: number;
  lastHeartbeat: number;
}

export interface TaskData {
  id: string;
  swarmId: string;
  description: string;
  priority: TaskPriority;
  strategy: TaskStrategy;
  status: TaskStatus;
  dependencies: string[];
  assignedAgents: string[];
  requireConsensus: boolean;
  maxAgents: number;
  requiredCapabilities: string[];
  result?: unknown;
  error?: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  completedAt?: number;
}

export interface CommunicationData {
  id: string;
  fromAgentId: string;
  toAgentId?: string;
  swarmId: string;
  messageType: MessageType;
  content: string;
  priority: MessagePriority;
  requiresResponse: boolean;
  deliveredAt?: number;
  readAt?: number;
  timestamp: number;
}

export interface ConsensusData {
  id: string;
  swarmId: string;
  taskId?: string;
  proposal: Record<string, unknown>;
  requiredThreshold: number;
  status: ConsensusStatus;
  votes: Record<string, { vote: boolean; reason?: string; timestamp: number }>;
  currentVotes: number;
  totalVoters: number;
  deadline: number;
  createdAt: number;
  resolvedAt?: number;
}

export interface MetricsData {
  id: string;
  swarmId: string;
  agentId?: string;
  metricType: string;
  metricValue: number;
  metadata: Record<string, unknown>;
  timestamp: number;
}

export interface MemoryData {
  key: string;
  namespace: string;
  value: string;
  ttl?: number;
  metadata?: Record<string, unknown>;
  accessCount?: number;
  lastAccessedAt?: number;
  createdAt?: number;
}

// =============================================================================
// QdrantStore Class
// =============================================================================

/**
 * QdrantStore replaces DatabaseManager with a pure Qdrant implementation.
 *
 * All operations go through the agent-core daemon's memory API.
 * No SQLite dependency required.
 */
export class QdrantStore extends EventEmitter {
  private static instance: QdrantStore;
  private client: AgentCoreClient;
  private initialized = false;

  // Local cache for frequently accessed items (LRU-style)
  private swarmCache = new Map<string, SwarmData>();
  private agentCache = new Map<string, AgentData>();
  private taskCache = new Map<string, TaskData>();

  private constructor(config?: AgentCoreClientConfig) {
    super();
    this.client = getAgentCoreClient(config);
  }

  /**
   * Get singleton instance
   */
  static async getInstance(config?: AgentCoreClientConfig): Promise<QdrantStore> {
    if (!QdrantStore.instance) {
      QdrantStore.instance = new QdrantStore(config);
      await QdrantStore.instance.initialize();
    }
    return QdrantStore.instance;
  }

  /**
   * Initialize the store
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Check if agent-core daemon is available
      const health = await this.client.checkMemoryHealth();
      if (!health.available) {
        console.warn("Agent-core daemon not available, some operations may fail");
      }

      this.initialized = true;
      this.emit("initialized");
    } catch (error) {
      console.warn("Failed to connect to agent-core daemon:", error);
      // Allow initialization to proceed - operations will fail gracefully
      this.initialized = true;
      this.emit("initialized");
    }
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private generateId(): string {
    return randomUUID();
  }

  private extractData<T>(entry: MemoryEntry): T | null {
    try {
      const extra = entry.metadata?.extra as Record<string, unknown>;
      if (extra) {
        return extra as T;
      }
      // Try parsing content as JSON
      return JSON.parse(entry.content) as T;
    } catch {
      return null;
    }
  }

  private async storeEntity<T extends { id: string }>(
    namespace: TiaraNamespace,
    data: T,
    category: "custom" | "task" | "decision" | "pattern" = "custom"
  ): Promise<void> {
    const content = JSON.stringify(data);
    await this.client.storeMemory({
      category,
      content,
      namespace,
      metadata: {
        extra: data,
      },
    });
  }

  private async getEntity<T extends { id: string }>(
    namespace: TiaraNamespace,
    id: string
  ): Promise<T | null> {
    const results = await this.client.searchMemory({
      query: `"id":"${id}"`,
      namespace,
      limit: 1,
    });

    if (results.length === 0) return null;

    const data = this.extractData<T>(results[0].entry);
    if (data && data.id === id) {
      return data;
    }

    return null;
  }

  private async listEntities<T>(
    namespace: TiaraNamespace,
    filter?: (item: T) => boolean,
    limit = 100
  ): Promise<T[]> {
    const results = await this.client.listMemoriesByNamespace(namespace, { limit });

    const entities: T[] = [];
    for (const entry of results) {
      const data = this.extractData<T>(entry);
      if (data) {
        if (!filter || filter(data)) {
          entities.push(data);
        }
      }
    }

    return entities;
  }

  private async updateEntity<T extends { id: string }>(
    namespace: TiaraNamespace,
    id: string,
    updates: Partial<T>
  ): Promise<T | null> {
    const existing = await this.getEntity<T>(namespace, id);
    if (!existing) return null;

    const updated = { ...existing, ...updates };
    await this.storeEntity(namespace, updated);
    return updated;
  }

  private async deleteEntity(namespace: TiaraNamespace, id: string): Promise<boolean> {
    const results = await this.client.searchMemory({
      query: `"id":"${id}"`,
      namespace,
      limit: 1,
    });

    if (results.length === 0) return false;

    return this.client.deleteMemory(results[0].entry.id);
  }

  // ===========================================================================
  // Swarm Operations
  // ===========================================================================

  async createSwarm(data: Omit<SwarmData, "id" | "createdAt" | "isActive">): Promise<SwarmData> {
    const swarm: SwarmData = {
      id: this.generateId(),
      ...data,
      isActive: false,
      createdAt: Date.now(),
    };

    await this.storeEntity(TiaraNamespaces.SWARMS, swarm);
    this.swarmCache.set(swarm.id, swarm);
    return swarm;
  }

  async getSwarm(id: string): Promise<SwarmData | null> {
    // Check cache first
    const cached = this.swarmCache.get(id);
    if (cached) return cached;

    const swarm = await this.getEntity<SwarmData>(TiaraNamespaces.SWARMS, id);
    if (swarm) {
      this.swarmCache.set(id, swarm);
    }
    return swarm;
  }

  async getAllSwarms(): Promise<(SwarmData & { agentCount: number })[]> {
    const swarms = await this.listEntities<SwarmData>(TiaraNamespaces.SWARMS);

    // Get agent counts for each swarm
    const swarmsWithCounts = await Promise.all(
      swarms.map(async (swarm) => {
        const agents = await this.getAgents(swarm.id);
        return { ...swarm, agentCount: agents.length };
      })
    );

    return swarmsWithCounts;
  }

  async getActiveSwarmId(): Promise<string | null> {
    const swarms = await this.listEntities<SwarmData>(
      TiaraNamespaces.SWARMS,
      (s) => s.isActive
    );
    return swarms.length > 0 ? swarms[0].id : null;
  }

  async setActiveSwarm(id: string): Promise<void> {
    // Deactivate all swarms
    const swarms = await this.listEntities<SwarmData>(TiaraNamespaces.SWARMS);
    for (const swarm of swarms) {
      if (swarm.isActive || swarm.id === id) {
        const updated = { ...swarm, isActive: swarm.id === id };
        await this.storeEntity(TiaraNamespaces.SWARMS, updated);
        this.swarmCache.set(swarm.id, updated);
      }
    }
  }

  // ===========================================================================
  // Agent Operations
  // ===========================================================================

  async createAgent(data: Omit<AgentData, "id" | "createdAt" | "lastHeartbeat" | "successCount" | "errorCount" | "messageCount">): Promise<AgentData> {
    const agent: AgentData = {
      id: this.generateId(),
      ...data,
      successCount: 0,
      errorCount: 0,
      messageCount: 0,
      createdAt: Date.now(),
      lastHeartbeat: Date.now(),
    };

    await this.storeEntity(TiaraNamespaces.AGENTS, agent);
    this.agentCache.set(agent.id, agent);
    return agent;
  }

  async getAgent(id: string): Promise<AgentData | null> {
    const cached = this.agentCache.get(id);
    if (cached) return cached;

    const agent = await this.getEntity<AgentData>(TiaraNamespaces.AGENTS, id);
    if (agent) {
      this.agentCache.set(id, agent);
    }
    return agent;
  }

  async getAgents(swarmId: string): Promise<AgentData[]> {
    return this.listEntities<AgentData>(
      TiaraNamespaces.AGENTS,
      (a) => a.swarmId === swarmId
    );
  }

  async updateAgent(id: string, updates: Partial<AgentData>): Promise<AgentData | null> {
    const updated = await this.updateEntity<AgentData>(TiaraNamespaces.AGENTS, id, updates);
    if (updated) {
      this.agentCache.set(id, updated);
    }
    return updated;
  }

  async updateAgentStatus(id: string, status: AgentStatusType): Promise<void> {
    await this.updateAgent(id, { status });
  }

  async getAgentPerformance(agentId: string): Promise<{
    successRate: number;
    totalTasks: number;
    messageCount: number;
  } | null> {
    const agent = await this.getAgent(agentId);
    if (!agent) return null;

    const total = agent.successCount + agent.errorCount;
    return {
      successRate: total > 0 ? agent.successCount / total : 0,
      totalTasks: total,
      messageCount: agent.messageCount,
    };
  }

  // ===========================================================================
  // Task Operations
  // ===========================================================================

  async createTask(data: Omit<TaskData, "id" | "createdAt">): Promise<TaskData> {
    const task: TaskData = {
      id: this.generateId(),
      ...data,
      createdAt: Date.now(),
    };

    await this.storeEntity(TiaraNamespaces.TASKS, task, "task");
    this.taskCache.set(task.id, task);
    return task;
  }

  async getTask(id: string): Promise<TaskData | null> {
    const cached = this.taskCache.get(id);
    if (cached) return cached;

    const task = await this.getEntity<TaskData>(TiaraNamespaces.TASKS, id);
    if (task) {
      this.taskCache.set(id, task);
    }
    return task;
  }

  async getTasks(swarmId: string): Promise<TaskData[]> {
    const tasks = await this.listEntities<TaskData>(
      TiaraNamespaces.TASKS,
      (t) => t.swarmId === swarmId
    );
    // Sort by creation time descending
    return tasks.sort((a, b) => b.createdAt - a.createdAt);
  }

  async updateTask(id: string, updates: Partial<TaskData>): Promise<TaskData | null> {
    const updated = await this.updateEntity<TaskData>(TiaraNamespaces.TASKS, id, updates);
    if (updated) {
      this.taskCache.set(id, updated);
    }
    return updated;
  }

  async updateTaskStatus(id: string, status: TaskStatus): Promise<void> {
    const updates: Partial<TaskData> = { status };
    if (status === "completed" || status === "failed" || status === "cancelled") {
      updates.completedAt = Date.now();
    }
    await this.updateTask(id, updates);
  }

  async getPendingTasks(swarmId: string): Promise<TaskData[]> {
    const tasks = await this.listEntities<TaskData>(
      TiaraNamespaces.TASKS,
      (t) => t.swarmId === swarmId && t.status === "pending"
    );

    // Sort by priority (critical > high > medium > low), then by creation time
    const priorityOrder: Record<TaskPriority, number> = {
      critical: 1,
      high: 2,
      medium: 3,
      low: 4,
    };

    return tasks.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.createdAt - b.createdAt;
    });
  }

  async getActiveTasks(swarmId: string): Promise<TaskData[]> {
    return this.listEntities<TaskData>(
      TiaraNamespaces.TASKS,
      (t) => t.swarmId === swarmId && (t.status === "assigned" || t.status === "in_progress")
    );
  }

  async reassignTask(taskId: string, newAgentId: string): Promise<void> {
    const task = await this.getTask(taskId);
    if (!task) return;

    const assignedAgents = [...task.assignedAgents];
    if (!assignedAgents.includes(newAgentId)) {
      assignedAgents.push(newAgentId);
    }

    await this.updateTask(taskId, { assignedAgents });
  }

  // ===========================================================================
  // Memory Operations (Semantic)
  // ===========================================================================

  async storeMemory(data: MemoryData): Promise<void> {
    await this.client.storeMemory({
      category: "custom",
      content: data.value,
      namespace: data.namespace,
      ttl: data.ttl,
      metadata: {
        extra: {
          key: data.key,
          accessCount: data.accessCount ?? 0,
          lastAccessedAt: data.lastAccessedAt ?? Date.now(),
          createdAt: data.createdAt ?? Date.now(),
          ...data.metadata,
        },
      },
    });
  }

  async getMemory(key: string, namespace: string): Promise<MemoryData | null> {
    const results = await this.client.searchMemory({
      query: `"key":"${key}"`,
      namespace,
      limit: 1,
    });

    if (results.length === 0) return null;

    const entry = results[0].entry;
    const extra = entry.metadata?.extra as Record<string, unknown>;

    if (extra?.key !== key) return null;

    return {
      key: extra.key as string,
      namespace,
      value: entry.content,
      ttl: entry.ttl,
      metadata: extra.metadata as Record<string, unknown>,
      accessCount: extra.accessCount as number,
      lastAccessedAt: extra.lastAccessedAt as number,
      createdAt: extra.createdAt as number,
    };
  }

  async updateMemoryAccess(key: string, namespace: string): Promise<void> {
    const memory = await this.getMemory(key, namespace);
    if (!memory) return;

    await this.storeMemory({
      ...memory,
      accessCount: (memory.accessCount ?? 0) + 1,
      lastAccessedAt: Date.now(),
    });
  }

  async searchMemory(options: {
    pattern?: string;
    namespace?: string;
    limit?: number;
  }): Promise<MemoryData[]> {
    const results = await this.client.searchMemory({
      query: options.pattern ?? "",
      namespace: options.namespace ?? "default",
      limit: options.limit ?? 10,
    });

    return results.map((r) => {
      const extra = r.entry.metadata?.extra as Record<string, unknown>;
      return {
        key: (extra?.key as string) ?? r.entry.id,
        namespace: r.entry.namespace ?? "default",
        value: r.entry.content,
        ttl: r.entry.ttl,
        metadata: extra?.metadata as Record<string, unknown>,
        accessCount: extra?.accessCount as number,
        lastAccessedAt: extra?.lastAccessedAt as number,
        createdAt: extra?.createdAt as number,
      };
    });
  }

  async deleteMemory(key: string, namespace: string): Promise<void> {
    const results = await this.client.searchMemory({
      query: `"key":"${key}"`,
      namespace,
      limit: 1,
    });

    if (results.length > 0) {
      await this.client.deleteMemory(results[0].entry.id);
    }
  }

  async listMemory(namespace: string, limit: number): Promise<MemoryData[]> {
    const entries = await this.client.listMemoriesByNamespace(namespace, { limit });

    return entries.map((entry) => {
      const extra = entry.metadata?.extra as Record<string, unknown>;
      return {
        key: (extra?.key as string) ?? entry.id,
        namespace: entry.namespace ?? namespace,
        value: entry.content,
        ttl: entry.ttl,
        metadata: extra?.metadata as Record<string, unknown>,
        accessCount: extra?.accessCount as number,
        lastAccessedAt: extra?.lastAccessedAt as number,
        createdAt: extra?.createdAt as number,
      };
    });
  }

  async getMemoryStats(): Promise<{ totalEntries: number; totalSize: number }> {
    const stats = await this.client.getMemoryStats();
    return {
      totalEntries: stats.total,
      totalSize: 0, // Not available from Qdrant
    };
  }

  async getNamespaceStats(namespace: string): Promise<{ entries: number; size: number; avgTTL: number }> {
    const entries = await this.client.listMemoriesByNamespace(namespace, { limit: 500 });
    let totalTTL = 0;
    let ttlCount = 0;

    for (const entry of entries) {
      if (entry.ttl) {
        totalTTL += entry.ttl;
        ttlCount++;
      }
    }

    return {
      entries: entries.length,
      size: 0, // Not available from Qdrant
      avgTTL: ttlCount > 0 ? totalTTL / ttlCount : 0,
    };
  }

  async getAllMemoryEntries(): Promise<MemoryData[]> {
    // Get entries from all namespaces (limit per namespace to API max of 500)
    const namespaces = Object.values(TiaraNamespaces);
    const allEntries: MemoryData[] = [];

    for (const ns of namespaces) {
      const entries = await this.listMemory(ns, 500);
      allEntries.push(...entries);
    }

    return allEntries;
  }

  async getRecentMemoryEntries(limit: number): Promise<MemoryData[]> {
    const allEntries = await this.getAllMemoryEntries();
    return allEntries
      .sort((a, b) => (b.lastAccessedAt ?? 0) - (a.lastAccessedAt ?? 0))
      .slice(0, limit);
  }

  async getOldMemoryEntries(daysOld: number): Promise<MemoryData[]> {
    const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000;
    const allEntries = await this.getAllMemoryEntries();
    return allEntries.filter((e) => (e.createdAt ?? 0) < cutoff);
  }

  async updateMemoryEntry(entry: MemoryData): Promise<void> {
    await this.storeMemory(entry);
  }

  async clearMemory(swarmId: string): Promise<void> {
    await this.client.deleteMemoriesWhere({
      namespace: TiaraNamespaces.SWARM_HISTORY,
    });
  }

  async deleteOldEntries(namespace: string, ttlSeconds: number): Promise<void> {
    const cutoff = Date.now() - ttlSeconds * 1000;
    await this.client.deleteMemoriesWhere({
      namespace,
      olderThan: cutoff,
    });
  }

  async trimNamespace(namespace: string, maxEntries: number): Promise<void> {
    const entries = await this.listMemory(namespace, maxEntries + 100);
    if (entries.length <= maxEntries) return;

    // Sort by access time and delete oldest
    entries.sort((a, b) => (b.lastAccessedAt ?? 0) - (a.lastAccessedAt ?? 0));
    const toDelete = entries.slice(maxEntries);

    for (const entry of toDelete) {
      await this.deleteMemory(entry.key, namespace);
    }
  }

  // ===========================================================================
  // Communication Operations
  // ===========================================================================

  async createCommunication(data: Omit<CommunicationData, "id" | "timestamp">): Promise<CommunicationData> {
    const comm: CommunicationData = {
      id: this.generateId(),
      ...data,
      timestamp: Date.now(),
    };

    await this.storeEntity(TiaraNamespaces.COMMUNICATIONS, comm);
    return comm;
  }

  async getPendingMessages(agentId: string): Promise<CommunicationData[]> {
    const messages = await this.listEntities<CommunicationData>(
      TiaraNamespaces.COMMUNICATIONS,
      (m) => m.toAgentId === agentId && !m.deliveredAt
    );

    // Sort by priority and timestamp
    const priorityOrder: Record<MessagePriority, number> = {
      urgent: 1,
      high: 2,
      normal: 3,
      low: 4,
    };

    return messages.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.timestamp - b.timestamp;
    });
  }

  async markMessageDelivered(messageId: string): Promise<void> {
    await this.updateEntity<CommunicationData>(TiaraNamespaces.COMMUNICATIONS, messageId, {
      deliveredAt: Date.now(),
    });
  }

  async markMessageRead(messageId: string): Promise<void> {
    await this.updateEntity<CommunicationData>(TiaraNamespaces.COMMUNICATIONS, messageId, {
      readAt: Date.now(),
    });
  }

  async getRecentMessages(swarmId: string, timeWindowMs: number): Promise<CommunicationData[]> {
    const cutoff = Date.now() - timeWindowMs;
    return this.listEntities<CommunicationData>(
      TiaraNamespaces.COMMUNICATIONS,
      (m) => m.swarmId === swarmId && m.timestamp > cutoff
    );
  }

  // ===========================================================================
  // Consensus Operations
  // ===========================================================================

  async createConsensusProposal(proposal: Omit<ConsensusData, "id" | "createdAt" | "votes" | "currentVotes" | "totalVoters" | "status">): Promise<ConsensusData> {
    const consensus: ConsensusData = {
      id: this.generateId(),
      ...proposal,
      status: "pending",
      votes: {},
      currentVotes: 0,
      totalVoters: 0,
      createdAt: Date.now(),
    };

    await this.storeEntity(TiaraNamespaces.CONSENSUS, consensus, "decision");
    return consensus;
  }

  async getConsensusProposal(id: string): Promise<ConsensusData | null> {
    return this.getEntity<ConsensusData>(TiaraNamespaces.CONSENSUS, id);
  }

  async submitConsensusVote(
    proposalId: string,
    agentId: string,
    vote: boolean,
    reason?: string
  ): Promise<void> {
    const proposal = await this.getConsensusProposal(proposalId);
    if (!proposal) return;

    const votes = { ...proposal.votes };
    votes[agentId] = { vote, reason: reason ?? "", timestamp: Date.now() };

    const totalVoters = Object.keys(votes).length;
    const positiveVotes = Object.values(votes).filter((v) => v.vote).length;
    const currentRatio = positiveVotes / totalVoters;

    const status: ConsensusStatus =
      currentRatio >= proposal.requiredThreshold ? "achieved" : "pending";

    await this.updateEntity<ConsensusData>(TiaraNamespaces.CONSENSUS, proposalId, {
      votes,
      currentVotes: positiveVotes,
      totalVoters,
      status,
      resolvedAt: status === "achieved" ? Date.now() : undefined,
    });
  }

  async updateConsensusStatus(proposalId: string, status: ConsensusStatus): Promise<void> {
    await this.updateEntity<ConsensusData>(TiaraNamespaces.CONSENSUS, proposalId, {
      status,
      resolvedAt: status !== "pending" ? Date.now() : undefined,
    });
  }

  async getRecentConsensusProposals(swarmId: string, limit = 10): Promise<ConsensusData[]> {
    const proposals = await this.listEntities<ConsensusData>(
      TiaraNamespaces.CONSENSUS,
      (p) => p.swarmId === swarmId
    );

    return proposals
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  // ===========================================================================
  // Performance Metrics Operations
  // ===========================================================================

  async storePerformanceMetric(data: Omit<MetricsData, "id" | "timestamp">): Promise<MetricsData> {
    const metric: MetricsData = {
      id: this.generateId(),
      ...data,
      timestamp: Date.now(),
    };

    await this.storeEntity(TiaraNamespaces.METRICS, metric);
    return metric;
  }

  async getSwarmStats(swarmId: string): Promise<{
    agentCount: number;
    busyAgents: number;
    agentUtilization: number;
    taskBacklog: number;
  }> {
    const agents = await this.getAgents(swarmId);
    const pendingTasks = await this.getPendingTasks(swarmId);
    const activeTasks = await this.getActiveTasks(swarmId);

    const busyAgents = agents.filter((a) => a.status === "busy").length;

    return {
      agentCount: agents.length,
      busyAgents,
      agentUtilization: agents.length > 0 ? busyAgents / agents.length : 0,
      taskBacklog: pendingTasks.length + activeTasks.length,
    };
  }

  async getStrategyPerformance(swarmId: string): Promise<Record<string, {
    successRate: number;
    avgCompletionTime: number;
    totalTasks: number;
  }>> {
    const tasks = await this.listEntities<TaskData>(
      TiaraNamespaces.TASKS,
      (t) => t.swarmId === swarmId && t.completedAt != null
    );

    const byStrategy: Record<string, TaskData[]> = {};
    for (const task of tasks) {
      if (!byStrategy[task.strategy]) {
        byStrategy[task.strategy] = [];
      }
      byStrategy[task.strategy].push(task);
    }

    const performance: Record<string, { successRate: number; avgCompletionTime: number; totalTasks: number }> = {};

    for (const [strategy, strategyTasks] of Object.entries(byStrategy)) {
      const successful = strategyTasks.filter((t) => t.status === "completed").length;
      let totalTime = 0;
      let timeCount = 0;

      for (const task of strategyTasks) {
        if (task.completedAt) {
          totalTime += task.completedAt - task.createdAt;
          timeCount++;
        }
      }

      performance[strategy] = {
        successRate: strategyTasks.length > 0 ? successful / strategyTasks.length : 0,
        avgCompletionTime: timeCount > 0 ? totalTime / timeCount : 0,
        totalTasks: strategyTasks.length,
      };
    }

    return performance;
  }

  async getSuccessfulDecisions(swarmId: string): Promise<MemorySearchResult[]> {
    return this.client.searchMemory({
      query: `Swarm: ${swarmId}`,
      namespace: TiaraNamespaces.QUEEN_DECISIONS,
      limit: 100,
    });
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  raw(sql: string): { _raw: string } {
    // Not supported in Qdrant - return a marker
    return { _raw: sql };
  }

  getDatabaseAnalytics(): {
    fragmentation: number;
    tableCount: number;
    schemaVersion: string;
  } {
    return {
      fragmentation: 0,
      tableCount: Object.keys(TiaraNamespaces).length,
      schemaVersion: "qdrant-1.0.0",
    };
  }

  close(): void {
    this.client.dispose();
    this.swarmCache.clear();
    this.agentCache.clear();
    this.taskCache.clear();
  }
}

// =============================================================================
// Singleton Helpers
// =============================================================================

let _storeInstance: QdrantStore | null = null;
let _mockStoreInstance: any | null = null;

/**
 * Check if running in test mode
 */
function isTestMode(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.TIARA_TEST_MODE === "true" ||
    process.env.TIARA_MOCK_QDRANT === "true" ||
    process.env.VITEST === "true" ||
    process.env.JEST_WORKER_ID !== undefined
  );
}

/**
 * Get the shared QdrantStore instance.
 * Returns MockQdrantStore when in test mode.
 */
export async function getQdrantStore(config?: AgentCoreClientConfig): Promise<QdrantStore> {
  // In test mode, return mock store
  if (isTestMode()) {
    if (!_mockStoreInstance) {
      try {
        // Dynamic import to avoid circular dependencies
        const { getMockQdrantStore } = await import("../../test/MockQdrantStore");
        _mockStoreInstance = await getMockQdrantStore();
        if (process.env.TIARA_DEBUG === "true") {
          console.log("[DEBUG] [QdrantStore] Using MockQdrantStore in test mode");
        }
      } catch (error) {
        // Fallback to real store if mock not available
        if (process.env.TIARA_DEBUG === "true") {
          console.log("[DEBUG] [QdrantStore] MockQdrantStore not available, using real store");
        }
      }
    }
    if (_mockStoreInstance) {
      return _mockStoreInstance as unknown as QdrantStore;
    }
  }

  // Production mode: use real QdrantStore
  if (!_storeInstance) {
    _storeInstance = await QdrantStore.getInstance(config);
  }
  return _storeInstance;
}

/**
 * Reset the shared instance (for testing).
 */
export function resetQdrantStore(): void {
  if (_storeInstance) {
    _storeInstance.close();
    _storeInstance = null;
  }
  if (_mockStoreInstance) {
    _mockStoreInstance.reset?.();
    _mockStoreInstance = null;
  }
}
