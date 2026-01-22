/**
 * MockQdrantStore - In-Memory Test Implementation
 *
 * Provides a fully functional mock of QdrantStore that operates entirely
 * in-memory without requiring an agent-core daemon or Qdrant instance.
 *
 * Use cases:
 * - Unit testing hive-mind components
 * - Integration testing without external dependencies
 * - CI/CD pipelines
 * - Development without running daemon
 */

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { debugLog } from "./test-mode";

// =============================================================================
// Types (mirroring QdrantStore types)
// =============================================================================

export const TiaraNamespaces = {
  LEARNING: "tiara:learning",
  DECISIONS: "tiara:decisions",
  PATTERNS: "tiara:patterns",
  AGENT_STATE: "tiara:agent-state",
  SWARM_HISTORY: "tiara:swarm-history",
  TRAJECTORIES: "tiara:trajectories",
  SWARMS: "tiara:swarms",
  AGENTS: "tiara:agents",
  TASKS: "tiara:tasks",
  COMMUNICATIONS: "tiara:communications",
  CONSENSUS: "tiara:consensus",
  METRICS: "tiara:metrics",
  QUEEN_DECISIONS: "tiara:queen-decisions",
} as const;

export type TiaraNamespace = (typeof TiaraNamespaces)[keyof typeof TiaraNamespaces];

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

// Alternative consensus structure for tests
export interface ConsensusProposal {
  id: string;
  swarmId: string;
  proposerId: string;
  type: string;
  description: string;
  options: string[];
  votingStrategy: string;
  deadline: number;
  status: string;
  votes: Array<{ agentId: string; vote: string; timestamp: number }>;
  result?: string;
  createdAt: number;
}

// Alternative metrics structure for tests
export interface PerformanceMetrics {
  id: string;
  swarmId: string;
  timestamp: number;
  taskCompletionRate: number;
  averageTaskTime: number;
  agentUtilization: number;
  consensusSuccessRate: number;
  messageLatency: number;
  errorRate: number;
}

// Alternative memory structure for tests
export interface MemoryEntry {
  id: string;
  swarmId: string;
  key: string;
  content: string;
  namespace: string;
  ttl?: number;
  createdAt: number;
}

export interface MemoryData {
  key: string;
  namespace: string;
  value: string;
  ttl?: number;
  createdAt: number;
}

// =============================================================================
// MockQdrantStore Implementation
// =============================================================================

/**
 * In-memory mock of QdrantStore for testing
 */
export class MockQdrantStore extends EventEmitter {
  private static instance: MockQdrantStore | null = null;

  // In-memory storage
  private swarmCache = new Map<string, SwarmData>();
  private agentCache = new Map<string, AgentData>();
  private taskCache = new Map<string, TaskData>();
  private communicationCache = new Map<string, CommunicationData>();
  private consensusCache = new Map<string, ConsensusData>();
  private metricsCache: MetricsData[] = [];
  private memoryCache = new Map<string, MemoryData>();

  // Alternative caches for test compatibility
  private consensusProposalCache = new Map<string, ConsensusProposal>();
  private performanceMetricsCache: PerformanceMetrics[] = [];
  private memoryEntryCache = new Map<string, MemoryEntry>();

  // Active swarm tracking
  private activeSwarmId: string | null = null;

  constructor() {
    super();
    debugLog("MockQdrantStore", "Initialized mock store");
  }

  /**
   * Get singleton instance
   */
  static getInstance(): MockQdrantStore {
    if (!MockQdrantStore.instance) {
      MockQdrantStore.instance = new MockQdrantStore();
    }
    return MockQdrantStore.instance;
  }

  /**
   * Reset mock store for testing
   */
  reset(): void {
    this.swarmCache.clear();
    this.agentCache.clear();
    this.taskCache.clear();
    this.communicationCache.clear();
    this.consensusCache.clear();
    this.metricsCache = [];
    this.memoryCache.clear();
    this.consensusProposalCache.clear();
    this.performanceMetricsCache = [];
    this.memoryEntryCache.clear();
    this.activeSwarmId = null;
    debugLog("MockQdrantStore", "Store reset");
  }

  /**
   * Destroy singleton instance
   */
  static destroy(): void {
    if (MockQdrantStore.instance) {
      MockQdrantStore.instance.reset();
      MockQdrantStore.instance = null;
    }
  }

  // =============================================================================
  // Swarm Operations
  // =============================================================================

  async createSwarm(data: Partial<SwarmData> & Pick<SwarmData, "name" | "topology">): Promise<SwarmData> {
    const id = data.id ?? randomUUID();
    const swarm: SwarmData = {
      id,
      name: data.name,
      topology: data.topology,
      queenMode: data.queenMode ?? false,
      maxAgents: data.maxAgents ?? 10,
      consensusThreshold: data.consensusThreshold ?? 0.66,
      memoryTTL: data.memoryTTL ?? 3600,
      config: data.config ?? {},
      isActive: data.isActive ?? false,
      createdAt: data.createdAt ?? Date.now(),
      updatedAt: data.updatedAt,
    };
    this.swarmCache.set(id, swarm);
    debugLog("MockQdrantStore", `Created swarm: ${id}`);
    this.emit("swarm:created", swarm);
    return swarm;
  }

  async getSwarm(id: string): Promise<SwarmData | null> {
    return this.swarmCache.get(id) || null;
  }

  async getActiveSwarmId(): Promise<string | null> {
    return this.activeSwarmId;
  }

  async updateSwarm(id: string, updates: Partial<SwarmData>): Promise<void> {
    const swarm = this.swarmCache.get(id);
    if (swarm) {
      Object.assign(swarm, updates, { updatedAt: Date.now() });
      if (updates.isActive) {
        this.activeSwarmId = id;
      }
      this.emit("swarm:updated", swarm);
    }
  }

  async deleteSwarm(id: string): Promise<void> {
    this.swarmCache.delete(id);
    if (this.activeSwarmId === id) {
      this.activeSwarmId = null;
    }
    this.emit("swarm:deleted", id);
  }

  async listSwarms(): Promise<SwarmData[]> {
    return Array.from(this.swarmCache.values());
  }

  async getAllSwarms(): Promise<(SwarmData & { agentCount: number })[]> {
    const swarms = Array.from(this.swarmCache.values());
    return Promise.all(
      swarms.map(async (swarm) => {
        const agents = await this.getAgents(swarm.id);
        return { ...swarm, agentCount: agents.length };
      })
    );
  }

  async setActiveSwarm(id: string): Promise<void> {
    // Deactivate all swarms first
    for (const swarm of this.swarmCache.values()) {
      swarm.isActive = swarm.id === id;
    }
    this.activeSwarmId = id;
    this.emit("swarm:activated", id);
  }

  // =============================================================================
  // Agent Operations
  // =============================================================================

  async createAgent(data: Omit<AgentData, "id" | "createdAt" | "lastHeartbeat" | "successCount" | "errorCount" | "messageCount">): Promise<AgentData> {
    const id = randomUUID();
    const agent: AgentData = {
      id,
      ...data,
      successCount: 0,
      errorCount: 0,
      messageCount: 0,
      createdAt: Date.now(),
      lastHeartbeat: Date.now(),
    };
    this.agentCache.set(id, agent);
    debugLog("MockQdrantStore", `Created agent: ${id}`);
    this.emit("agent:created", agent);
    return agent;
  }

  async registerAgent(data: Omit<AgentData, "createdAt" | "lastHeartbeat" | "successCount" | "errorCount" | "messageCount">): Promise<string> {
    const agent: AgentData = {
      ...data,
      successCount: 0,
      errorCount: 0,
      messageCount: 0,
      createdAt: Date.now(),
      lastHeartbeat: Date.now(),
    };
    this.agentCache.set(data.id, agent);
    debugLog("MockQdrantStore", `Registered agent: ${data.id}`);
    this.emit("agent:registered", agent);
    return data.id;
  }

  async getAgent(id: string): Promise<AgentData | null> {
    return this.agentCache.get(id) || null;
  }

  async updateAgent(id: string, updates: Partial<AgentData>): Promise<void> {
    const agent = this.agentCache.get(id);
    if (agent) {
      Object.assign(agent, updates);
      this.emit("agent:updated", agent);
    }
  }

  async updateAgentHeartbeat(id: string): Promise<void> {
    const agent = this.agentCache.get(id);
    if (agent) {
      agent.lastHeartbeat = Date.now();
    }
  }

  async deregisterAgent(id: string): Promise<void> {
    this.agentCache.delete(id);
    this.emit("agent:deregistered", id);
  }

  async unregisterAgent(id: string): Promise<void> {
    return this.deregisterAgent(id);
  }

  async listAgents(swarmId?: string): Promise<AgentData[]> {
    const agents = Array.from(this.agentCache.values());
    if (swarmId) {
      return agents.filter(a => a.swarmId === swarmId);
    }
    return agents;
  }

  async getAgents(swarmId: string): Promise<AgentData[]> {
    return this.listAgents(swarmId);
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

  async getAvailableAgents(swarmId: string, capabilities?: string[]): Promise<AgentData[]> {
    return Array.from(this.agentCache.values()).filter(a => {
      if (a.swarmId !== swarmId) return false;
      if (a.status !== "idle") return false;
      if (capabilities && capabilities.length > 0) {
        return capabilities.every(c => a.capabilities.includes(c));
      }
      return true;
    });
  }

  // =============================================================================
  // Task Operations
  // =============================================================================

  async createTask(data: Partial<TaskData> & Pick<TaskData, "swarmId" | "description">): Promise<TaskData> {
    const id = data.id ?? randomUUID();
    const task: TaskData = {
      id,
      swarmId: data.swarmId,
      description: data.description,
      priority: data.priority ?? "medium",
      strategy: data.strategy ?? "single",
      status: data.status ?? "pending",
      dependencies: data.dependencies ?? [],
      assignedAgents: data.assignedAgents ?? [],
      requireConsensus: data.requireConsensus ?? false,
      maxAgents: data.maxAgents ?? 1,
      requiredCapabilities: data.requiredCapabilities ?? [],
      result: data.result,
      error: data.error,
      metadata: data.metadata ?? {},
      createdAt: data.createdAt ?? Date.now(),
      completedAt: data.completedAt,
    };
    this.taskCache.set(id, task);
    debugLog("MockQdrantStore", `Created task: ${id}`);
    this.emit("task:created", task);
    return task;
  }

  async getTask(id: string): Promise<TaskData | null> {
    return this.taskCache.get(id) || null;
  }

  async getTasks(swarmId: string): Promise<TaskData[]> {
    const tasks = Array.from(this.taskCache.values())
      .filter(t => t.swarmId === swarmId)
      .sort((a, b) => b.createdAt - a.createdAt);
    return tasks;
  }

  async updateTask(id: string, updates: Partial<TaskData>): Promise<TaskData | null> {
    const task = this.taskCache.get(id);
    if (task) {
      Object.assign(task, updates);
      if (updates.status === "completed" || updates.status === "failed" || updates.status === "cancelled") {
        task.completedAt = Date.now();
      }
      this.emit("task:updated", task);
      return task;
    }
    return null;
  }

  async updateTaskStatus(id: string, status: TaskStatus): Promise<void> {
    await this.updateTask(id, { status });
  }

  async deleteTask(id: string): Promise<void> {
    this.taskCache.delete(id);
    this.emit("task:deleted", id);
  }

  async listTasks(swarmId?: string, status?: TaskStatus): Promise<TaskData[]> {
    let tasks = Array.from(this.taskCache.values());
    if (swarmId) {
      tasks = tasks.filter(t => t.swarmId === swarmId);
    }
    if (status) {
      tasks = tasks.filter(t => t.status === status);
    }
    return tasks;
  }

  async getPendingTasks(swarmId: string): Promise<TaskData[]> {
    const priorityOrder: Record<TaskPriority, number> = {
      critical: 1,
      high: 2,
      medium: 3,
      low: 4,
    };

    const tasks = Array.from(this.taskCache.values())
      .filter(t => t.swarmId === swarmId && t.status === "pending")
      .sort((a, b) => {
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.createdAt - b.createdAt;
      });
    return tasks;
  }

  async getActiveTasks(swarmId: string): Promise<TaskData[]> {
    return Array.from(this.taskCache.values())
      .filter(t => t.swarmId === swarmId && (t.status === "assigned" || t.status === "in_progress"));
  }

  // =============================================================================
  // Communication Operations
  // =============================================================================

  async createCommunication(data: Omit<CommunicationData, "id" | "timestamp">): Promise<CommunicationData> {
    const id = randomUUID();
    const comm: CommunicationData = {
      ...data,
      id,
      timestamp: Date.now(),
    };
    this.communicationCache.set(id, comm);
    this.emit("communication:created", comm);
    return comm;
  }

  async getCommunication(id: string): Promise<CommunicationData | null> {
    return this.communicationCache.get(id) || null;
  }

  async getUnreadMessages(agentId: string): Promise<CommunicationData[]> {
    return Array.from(this.communicationCache.values()).filter(c =>
      (c.toAgentId === agentId || !c.toAgentId) && !c.readAt
    );
  }

  async getPendingMessages(agentId: string): Promise<CommunicationData[]> {
    const priorityOrder: Record<MessagePriority, number> = {
      urgent: 1,
      high: 2,
      normal: 3,
      low: 4,
    };

    return Array.from(this.communicationCache.values())
      .filter(c => c.toAgentId === agentId && !c.deliveredAt)
      .sort((a, b) => {
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.timestamp - b.timestamp;
      });
  }

  async getRecentMessages(swarmId: string, timeWindowMs: number): Promise<CommunicationData[]> {
    const cutoff = Date.now() - timeWindowMs;
    return Array.from(this.communicationCache.values())
      .filter(c => c.swarmId === swarmId && c.timestamp > cutoff);
  }

  async markMessageRead(id: string): Promise<void> {
    const comm = this.communicationCache.get(id);
    if (comm) {
      comm.readAt = Date.now();
    }
  }

  async markMessageDelivered(id: string): Promise<void> {
    const comm = this.communicationCache.get(id);
    if (comm) {
      comm.deliveredAt = Date.now();
    }
  }

  async storeMessage(data: Omit<CommunicationData, "id" | "timestamp">): Promise<CommunicationData> {
    return this.createCommunication(data);
  }

  async getMessagesForAgent(agentId: string): Promise<CommunicationData[]> {
    return Array.from(this.communicationCache.values())
      .filter(c => c.toAgentId === agentId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  async getSwarmMessages(swarmId: string): Promise<CommunicationData[]> {
    return Array.from(this.communicationCache.values())
      .filter(c => c.swarmId === swarmId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  // =============================================================================
  // Consensus Operations
  // =============================================================================

  async createConsensusProposal(data: Omit<ConsensusData, "id" | "createdAt" | "votes" | "currentVotes" | "totalVoters" | "status">): Promise<ConsensusData> {
    const id = randomUUID();
    const consensus: ConsensusData = {
      ...data,
      id,
      status: "pending",
      votes: {},
      currentVotes: 0,
      totalVoters: 0,
      createdAt: Date.now(),
    };
    this.consensusCache.set(id, consensus);
    this.emit("consensus:created", consensus);
    return consensus;
  }

  async getConsensusProposal(id: string): Promise<ConsensusData | null> {
    return this.consensusCache.get(id) || null;
  }

  async submitConsensusVote(proposalId: string, agentId: string, vote: boolean, reason?: string): Promise<void> {
    const consensus = this.consensusCache.get(proposalId);
    if (consensus) {
      consensus.votes[agentId] = { vote, reason: reason ?? "", timestamp: Date.now() };
      consensus.totalVoters = Object.keys(consensus.votes).length;
      consensus.currentVotes = Object.values(consensus.votes).filter(v => v.vote).length;

      // Check if threshold is met
      const currentRatio = consensus.currentVotes / consensus.totalVoters;
      if (currentRatio >= consensus.requiredThreshold) {
        consensus.status = "achieved";
        consensus.resolvedAt = Date.now();
      }

      this.emit("consensus:voted", { proposalId, agentId, vote });
    }
  }

  async updateConsensusStatus(id: string, status: ConsensusStatus): Promise<void> {
    const consensus = this.consensusCache.get(id);
    if (consensus) {
      consensus.status = status;
      if (status !== "pending") {
        consensus.resolvedAt = Date.now();
      }
      this.emit("consensus:updated", consensus);
    }
  }

  async getRecentConsensusProposals(swarmId: string, limit: number = 10): Promise<ConsensusData[]> {
    return Array.from(this.consensusCache.values())
      .filter(c => c.swarmId === swarmId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  // Alternative consensus methods for test compatibility
  async createConsensus(data: Omit<ConsensusProposal, "id" | "createdAt">): Promise<ConsensusProposal> {
    const id = randomUUID();
    const proposal: ConsensusProposal = {
      id,
      swarmId: data.swarmId,
      proposerId: data.proposerId,
      type: data.type,
      description: data.description,
      options: data.options,
      votingStrategy: data.votingStrategy,
      deadline: data.deadline,
      status: data.status,
      votes: data.votes ?? [],
      result: data.result,
      createdAt: Date.now(),
    };
    this.consensusProposalCache.set(id, proposal);
    this.emit("consensus:created", proposal);
    return proposal;
  }

  async updateConsensus(id: string, updates: Partial<ConsensusProposal>): Promise<ConsensusProposal | null> {
    const proposal = this.consensusProposalCache.get(id);
    if (proposal) {
      Object.assign(proposal, updates);
      this.emit("consensus:updated", proposal);
      return proposal;
    }
    return null;
  }

  async getConsensus(id: string): Promise<ConsensusProposal | null> {
    return this.consensusProposalCache.get(id) || null;
  }

  // =============================================================================
  // Metrics Operations
  // =============================================================================

  async recordMetric(data: Omit<MetricsData, "id" | "timestamp">): Promise<string> {
    const id = randomUUID();
    const metric: MetricsData = {
      ...data,
      id,
      timestamp: Date.now(),
    };
    this.metricsCache.push(metric);
    this.emit("metrics:recorded", metric);
    return id;
  }

  async storePerformanceMetric(data: Omit<MetricsData, "id" | "timestamp">): Promise<MetricsData> {
    const id = randomUUID();
    const metric: MetricsData = {
      ...data,
      id,
      timestamp: Date.now(),
    };
    this.metricsCache.push(metric);
    this.emit("metrics:recorded", metric);
    return metric;
  }

  async getMetrics(swarmId: string, metricType?: string, limit: number = 100): Promise<MetricsData[]> {
    let metrics = this.metricsCache.filter(m => m.swarmId === swarmId);
    if (metricType) {
      metrics = metrics.filter(m => m.metricType === metricType);
    }
    return metrics.slice(-limit);
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

    const busyAgents = agents.filter(a => a.status === "busy").length;

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
    const tasks = Array.from(this.taskCache.values())
      .filter(t => t.swarmId === swarmId && t.completedAt != null);

    const byStrategy: Record<string, TaskData[]> = {};
    for (const task of tasks) {
      if (!byStrategy[task.strategy]) {
        byStrategy[task.strategy] = [];
      }
      byStrategy[task.strategy].push(task);
    }

    const performance: Record<string, { successRate: number; avgCompletionTime: number; totalTasks: number }> = {};

    for (const [strategy, strategyTasks] of Object.entries(byStrategy)) {
      const successful = strategyTasks.filter(t => t.status === "completed").length;
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

  // Alternative metrics methods for test compatibility
  async storeMetrics(data: Omit<PerformanceMetrics, "id">): Promise<PerformanceMetrics> {
    const id = randomUUID();
    const metrics: PerformanceMetrics = {
      id,
      swarmId: data.swarmId,
      timestamp: data.timestamp ?? Date.now(),
      taskCompletionRate: data.taskCompletionRate,
      averageTaskTime: data.averageTaskTime,
      agentUtilization: data.agentUtilization,
      consensusSuccessRate: data.consensusSuccessRate,
      messageLatency: data.messageLatency,
      errorRate: data.errorRate,
    };
    this.performanceMetricsCache.push(metrics);
    this.emit("metrics:stored", metrics);
    return metrics;
  }

  async getMetricsHistory(swarmId: string, limit: number = 100): Promise<PerformanceMetrics[]> {
    return this.performanceMetricsCache
      .filter(m => m.swarmId === swarmId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  // =============================================================================
  // Memory Operations
  // =============================================================================

  async storeMemory(data: MemoryData | Omit<MemoryEntry, "id" | "createdAt">): Promise<MemoryEntry | void> {
    // Check if this is the new format with swarmId
    if ("swarmId" in data && "content" in data) {
      const entry = data as Omit<MemoryEntry, "id" | "createdAt">;
      const id = randomUUID();
      const memoryEntry: MemoryEntry = {
        id,
        swarmId: entry.swarmId,
        key: entry.key,
        content: entry.content,
        namespace: entry.namespace,
        ttl: entry.ttl,
        createdAt: Date.now(),
      };
      const compositeKey = `${entry.swarmId}:${entry.namespace}:${entry.key}`;
      this.memoryEntryCache.set(compositeKey, memoryEntry);
      this.emit("memory:stored", memoryEntry);
      return memoryEntry;
    }

    // Old format
    const oldData = data as MemoryData;
    const compositeKey = `${oldData.namespace}:${oldData.key}`;
    this.memoryCache.set(compositeKey, { ...oldData, createdAt: oldData.createdAt ?? Date.now() });
    this.emit("memory:stored", oldData);
  }

  async getMemory(key: string, namespace: string): Promise<MemoryData | null> {
    return this.memoryCache.get(`${namespace}:${key}`) || null;
  }

  async searchMemory(options: {
    pattern?: string;
    namespace?: string;
    limit?: number;
  }): Promise<MemoryData[]> {
    const results: MemoryData[] = [];
    const namespace = options.namespace ?? "";
    const pattern = options.pattern ?? "";
    const limit = options.limit ?? 10;

    for (const [k, v] of this.memoryCache.entries()) {
      if (namespace && !k.startsWith(namespace)) continue;
      if (pattern && !v.value.includes(pattern) && !v.key.includes(pattern)) continue;
      results.push(v);
      if (results.length >= limit) break;
    }
    return results;
  }

  async listMemory(namespace: string, limit: number): Promise<MemoryData[]> {
    const results: MemoryData[] = [];
    for (const [k, v] of this.memoryCache.entries()) {
      if (k.startsWith(namespace)) {
        results.push(v);
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  async deleteMemory(key: string, namespace: string): Promise<void> {
    this.memoryCache.delete(`${namespace}:${key}`);
    this.emit("memory:deleted", { namespace, key });
  }

  async getAllMemoryEntries(namespace: string): Promise<MemoryData[]> {
    const results: MemoryData[] = [];
    for (const [k, v] of this.memoryCache.entries()) {
      if (k.startsWith(namespace)) {
        results.push(v);
      }
    }
    return results;
  }

  // Alternative memory methods for test compatibility (swarmId-based)
  async storeMemoryEntry(data: Omit<MemoryEntry, "id" | "createdAt">): Promise<MemoryEntry> {
    const id = randomUUID();
    const entry: MemoryEntry = {
      id,
      swarmId: data.swarmId,
      key: data.key,
      content: data.content,
      namespace: data.namespace,
      ttl: data.ttl,
      createdAt: Date.now(),
    };
    const compositeKey = `${data.swarmId}:${data.namespace}:${data.key}`;
    this.memoryEntryCache.set(compositeKey, entry);
    this.emit("memory:stored", entry);
    return entry;
  }

  async getMemoryByKey(swarmId: string, key: string): Promise<MemoryEntry | null> {
    // Search across all namespaces for this swarm and key
    for (const [k, v] of this.memoryEntryCache.entries()) {
      if (v.swarmId === swarmId && v.key === key) {
        // Check TTL expiration
        if (v.ttl && Date.now() > v.createdAt + v.ttl) {
          return null;
        }
        return v;
      }
    }
    return null;
  }

  async listMemoryByNamespace(swarmId: string, namespace: string): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];
    const now = Date.now();
    for (const v of this.memoryEntryCache.values()) {
      if (v.swarmId === swarmId && v.namespace === namespace) {
        // Check TTL expiration
        if (v.ttl && now > v.createdAt + v.ttl) {
          continue;
        }
        results.push(v);
      }
    }
    return results;
  }

  async cleanupExpiredMemory(): Promise<number> {
    let deletedCount = 0;
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [k, v] of this.memoryEntryCache.entries()) {
      if (v.ttl && now > v.createdAt + v.ttl) {
        keysToDelete.push(k);
      }
    }

    for (const key of keysToDelete) {
      this.memoryEntryCache.delete(key);
      deletedCount++;
    }

    this.emit("memory:cleanup", { deleted: deletedCount });
    return deletedCount;
  }

  // =============================================================================
  // Debug / Test Utilities
  // =============================================================================

  /**
   * Get current state snapshot for debugging
   */
  getSnapshot(): {
    swarms: SwarmData[];
    agents: AgentData[];
    tasks: TaskData[];
    communications: CommunicationData[];
    consensus: ConsensusData[];
    metrics: MetricsData[];
    memory: MemoryData[];
    consensusProposals: ConsensusProposal[];
    performanceMetrics: PerformanceMetrics[];
    memoryEntries: MemoryEntry[];
  } {
    return {
      swarms: Array.from(this.swarmCache.values()),
      agents: Array.from(this.agentCache.values()),
      tasks: Array.from(this.taskCache.values()),
      communications: Array.from(this.communicationCache.values()),
      consensus: Array.from(this.consensusCache.values()),
      metrics: this.metricsCache,
      memory: Array.from(this.memoryCache.values()),
      consensusProposals: Array.from(this.consensusProposalCache.values()),
      performanceMetrics: this.performanceMetricsCache,
      memoryEntries: Array.from(this.memoryEntryCache.values()),
    };
  }

  /**
   * Load state from snapshot (for test setup)
   */
  loadSnapshot(snapshot: ReturnType<typeof this.getSnapshot>): void {
    this.reset();
    snapshot.swarms.forEach(s => this.swarmCache.set(s.id, s));
    snapshot.agents.forEach(a => this.agentCache.set(a.id, a));
    snapshot.tasks.forEach(t => this.taskCache.set(t.id, t));
    snapshot.communications.forEach(c => this.communicationCache.set(c.id, c));
    snapshot.consensus.forEach(c => this.consensusCache.set(c.id, c));
    this.metricsCache = [...snapshot.metrics];
    snapshot.memory.forEach(m => this.memoryCache.set(`${m.namespace}:${m.key}`, m));
    if (snapshot.consensusProposals) {
      snapshot.consensusProposals.forEach(c => this.consensusProposalCache.set(c.id, c));
    }
    if (snapshot.performanceMetrics) {
      this.performanceMetricsCache = [...snapshot.performanceMetrics];
    }
    if (snapshot.memoryEntries) {
      snapshot.memoryEntries.forEach(m => this.memoryEntryCache.set(`${m.swarmId}:${m.namespace}:${m.key}`, m));
    }
    debugLog("MockQdrantStore", "Loaded snapshot");
  }
}

/**
 * Get mock store instance (singleton)
 */
export async function getMockQdrantStore(): Promise<MockQdrantStore> {
  return MockQdrantStore.getInstance();
}

export default MockQdrantStore;
