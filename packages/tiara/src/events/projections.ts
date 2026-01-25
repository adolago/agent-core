/**
 * Event Projections
 *
 * Read models built from event streams.
 * Provides queryable state from domain events.
 *
 * Ported from claude-flow v3 @claude-flow/shared/events
 *
 * @module tiara/events/projections
 */

import { EventEmitter } from "events";
import type { DomainEvent, IEventStore, IProjection } from "./types.js";
import { SystemEventTypes } from "./types.js";
import type {
  AgentSpawnedPayload,
  AgentStartedPayload,
  AgentStoppedPayload,
  AgentFailedPayload,
  AgentStatusChangedPayload,
  AgentTaskAssignedPayload,
  AgentTaskCompletedPayload,
  TaskCreatedPayload,
  TaskStartedPayload,
  TaskCompletedPayload,
  TaskFailedPayload,
  TaskBlockedPayload,
  MemoryStoredPayload,
  MemoryRetrievedPayload,
  MemoryDeletedPayload,
} from "./domain-events.js";

// =============================================================================
// Agent State Projection
// =============================================================================

/**
 * Agent state in projection
 */
export interface AgentProjectionState {
  id: string;
  role: string;
  domain: string;
  capabilities: string[];
  status: "idle" | "active" | "busy" | "error" | "completed";
  currentTask: string | null;
  completedTasks: string[];
  failedTasks: string[];
  totalTaskDuration: number;
  taskCount: number;
  errorCount: number;
  spawnedAt: number;
  startedAt: number | null;
  stoppedAt: number | null;
  lastActivityAt: number;
}

/**
 * Agent State Projection
 *
 * Builds and maintains current agent state from events.
 *
 * @example
 * const projection = new AgentStateProjection(eventStore);
 * await projection.initialize();
 *
 * const agent = projection.getAgent('agent-1');
 * const activeAgents = projection.getAgentsByStatus('active');
 */
export class AgentStateProjection extends EventEmitter implements IProjection {
  private readonly eventStore: IEventStore;
  private readonly agents = new Map<string, AgentProjectionState>();
  private _initialized = false;

  constructor(eventStore: IEventStore) {
    super();
    this.eventStore = eventStore;
  }

  get initialized(): boolean {
    return this._initialized;
  }

  /**
   * Initialize by replaying all events
   */
  async initialize(): Promise<void> {
    for await (const event of this.eventStore.replay()) {
      await this.handle(event);
    }
    this._initialized = true;
    this.emit("initialized");
  }

  /**
   * Handle a single event
   */
  async handle(event: DomainEvent): Promise<void> {
    switch (event.type) {
      case SystemEventTypes.AGENT_SPAWNED:
        this.handleAgentSpawned(event as DomainEvent<AgentSpawnedPayload>);
        break;
      case SystemEventTypes.AGENT_STARTED:
        this.handleAgentStarted(event as DomainEvent<AgentStartedPayload>);
        break;
      case SystemEventTypes.AGENT_STOPPED:
        this.handleAgentStopped(event as DomainEvent<AgentStoppedPayload>);
        break;
      case SystemEventTypes.AGENT_FAILED:
        this.handleAgentFailed(event as DomainEvent<AgentFailedPayload>);
        break;
      case SystemEventTypes.AGENT_STATUS_CHANGED:
        this.handleAgentStatusChanged(event as DomainEvent<AgentStatusChangedPayload>);
        break;
      case SystemEventTypes.AGENT_TASK_ASSIGNED:
        this.handleAgentTaskAssigned(event as DomainEvent<AgentTaskAssignedPayload>);
        break;
      case SystemEventTypes.AGENT_TASK_COMPLETED:
        this.handleAgentTaskCompleted(event as DomainEvent<AgentTaskCompletedPayload>);
        break;
    }
  }

  /**
   * Reset projection state
   */
  reset(): void {
    this.agents.clear();
    this._initialized = false;
  }

  // Query methods

  getAgent(agentId: string): AgentProjectionState | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): AgentProjectionState[] {
    return Array.from(this.agents.values());
  }

  getAgentsByStatus(status: AgentProjectionState["status"]): AgentProjectionState[] {
    return this.getAllAgents().filter((a) => a.status === status);
  }

  getAgentsByDomain(domain: string): AgentProjectionState[] {
    return this.getAllAgents().filter((a) => a.domain === domain);
  }

  getActiveAgentCount(): number {
    return this.getAgentsByStatus("active").length + this.getAgentsByStatus("busy").length;
  }

  // Event handlers

  private handleAgentSpawned(event: DomainEvent<AgentSpawnedPayload>): void {
    const { agentId, role, domain, capabilities } = event.payload;

    this.agents.set(agentId, {
      id: agentId,
      role,
      domain,
      capabilities,
      status: "idle",
      currentTask: null,
      completedTasks: [],
      failedTasks: [],
      totalTaskDuration: 0,
      taskCount: 0,
      errorCount: 0,
      spawnedAt: event.timestamp.getTime(),
      startedAt: null,
      stoppedAt: null,
      lastActivityAt: event.timestamp.getTime(),
    });
  }

  private handleAgentStarted(event: DomainEvent<AgentStartedPayload>): void {
    const agent = this.agents.get(event.payload.agentId);
    if (agent) {
      agent.status = "active";
      agent.startedAt = event.timestamp.getTime();
      agent.lastActivityAt = event.timestamp.getTime();
    }
  }

  private handleAgentStopped(event: DomainEvent<AgentStoppedPayload>): void {
    const agent = this.agents.get(event.payload.agentId);
    if (agent) {
      agent.status = "completed";
      agent.stoppedAt = event.timestamp.getTime();
      agent.lastActivityAt = event.timestamp.getTime();
    }
  }

  private handleAgentFailed(event: DomainEvent<AgentFailedPayload>): void {
    const agent = this.agents.get(event.payload.agentId);
    if (agent) {
      agent.status = "error";
      agent.errorCount++;
      agent.lastActivityAt = event.timestamp.getTime();
    }
  }

  private handleAgentStatusChanged(event: DomainEvent<AgentStatusChangedPayload>): void {
    const agent = this.agents.get(event.payload.agentId);
    if (agent) {
      agent.status = event.payload.newStatus as AgentProjectionState["status"];
      agent.lastActivityAt = event.timestamp.getTime();
    }
  }

  private handleAgentTaskAssigned(event: DomainEvent<AgentTaskAssignedPayload>): void {
    const agent = this.agents.get(event.payload.agentId);
    if (agent) {
      agent.currentTask = event.payload.taskId;
      agent.status = "busy";
      agent.lastActivityAt = event.timestamp.getTime();
    }
  }

  private handleAgentTaskCompleted(event: DomainEvent<AgentTaskCompletedPayload>): void {
    const agent = this.agents.get(event.payload.agentId);
    if (agent) {
      agent.completedTasks.push(event.payload.taskId);
      agent.taskCount++;
      agent.totalTaskDuration += event.payload.duration;
      agent.currentTask = null;
      agent.status = "active";
      agent.lastActivityAt = event.timestamp.getTime();
    }
  }
}

// =============================================================================
// Task History Projection
// =============================================================================

/**
 * Task state in projection
 */
export interface TaskProjectionState {
  id: string;
  type: string;
  title: string;
  status: "pending" | "queued" | "in-progress" | "completed" | "failed" | "blocked" | "cancelled";
  priority: string;
  assignedAgent: string | null;
  dependencies: string[];
  blockedBy: string[];
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  failedAt: number | null;
  duration: number | null;
  result: unknown;
  error: string | null;
  retryCount: number;
}

/**
 * Task History Projection
 *
 * Tracks complete task execution history.
 */
export class TaskHistoryProjection extends EventEmitter implements IProjection {
  private readonly eventStore: IEventStore;
  private readonly tasks = new Map<string, TaskProjectionState>();
  private _initialized = false;

  constructor(eventStore: IEventStore) {
    super();
    this.eventStore = eventStore;
  }

  get initialized(): boolean {
    return this._initialized;
  }

  async initialize(): Promise<void> {
    for await (const event of this.eventStore.replay()) {
      await this.handle(event);
    }
    this._initialized = true;
    this.emit("initialized");
  }

  async handle(event: DomainEvent): Promise<void> {
    switch (event.type) {
      case SystemEventTypes.TASK_CREATED:
        this.handleTaskCreated(event as DomainEvent<TaskCreatedPayload>);
        break;
      case SystemEventTypes.TASK_STARTED:
        this.handleTaskStarted(event as DomainEvent<TaskStartedPayload>);
        break;
      case SystemEventTypes.TASK_COMPLETED:
        this.handleTaskCompleted(event as DomainEvent<TaskCompletedPayload>);
        break;
      case SystemEventTypes.TASK_FAILED:
        this.handleTaskFailed(event as DomainEvent<TaskFailedPayload>);
        break;
      case SystemEventTypes.TASK_BLOCKED:
        this.handleTaskBlocked(event as DomainEvent<TaskBlockedPayload>);
        break;
    }
  }

  reset(): void {
    this.tasks.clear();
    this._initialized = false;
  }

  // Query methods

  getTask(taskId: string): TaskProjectionState | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): TaskProjectionState[] {
    return Array.from(this.tasks.values());
  }

  getTasksByStatus(status: TaskProjectionState["status"]): TaskProjectionState[] {
    return this.getAllTasks().filter((t) => t.status === status);
  }

  getTasksByAgent(agentId: string): TaskProjectionState[] {
    return this.getAllTasks().filter((t) => t.assignedAgent === agentId);
  }

  getCompletedTaskCount(): number {
    return this.getTasksByStatus("completed").length;
  }

  getAverageTaskDuration(): number {
    const completed = this.getTasksByStatus("completed").filter((t) => t.duration !== null);
    if (completed.length === 0) return 0;
    return completed.reduce((sum, t) => sum + t.duration!, 0) / completed.length;
  }

  // Event handlers

  private handleTaskCreated(event: DomainEvent<TaskCreatedPayload>): void {
    const { taskId, type, title, priority, dependencies } = event.payload;

    this.tasks.set(taskId, {
      id: taskId,
      type,
      title,
      status: "pending",
      priority,
      assignedAgent: null,
      dependencies: dependencies || [],
      blockedBy: [],
      createdAt: event.timestamp.getTime(),
      startedAt: null,
      completedAt: null,
      failedAt: null,
      duration: null,
      result: null,
      error: null,
      retryCount: 0,
    });
  }

  private handleTaskStarted(event: DomainEvent<TaskStartedPayload>): void {
    const task = this.tasks.get(event.payload.taskId);
    if (task) {
      task.status = "in-progress";
      task.assignedAgent = event.payload.agentId;
      task.startedAt = event.timestamp.getTime();
    }
  }

  private handleTaskCompleted(event: DomainEvent<TaskCompletedPayload>): void {
    const task = this.tasks.get(event.payload.taskId);
    if (task) {
      task.status = "completed";
      task.completedAt = event.timestamp.getTime();
      task.duration = event.payload.duration;
      task.result = event.payload.result;
    }
  }

  private handleTaskFailed(event: DomainEvent<TaskFailedPayload>): void {
    const task = this.tasks.get(event.payload.taskId);
    if (task) {
      task.status = "failed";
      task.failedAt = event.timestamp.getTime();
      task.error = event.payload.error;
      task.retryCount = event.payload.retryCount;
    }
  }

  private handleTaskBlocked(event: DomainEvent<TaskBlockedPayload>): void {
    const task = this.tasks.get(event.payload.taskId);
    if (task) {
      task.status = "blocked";
      task.blockedBy = event.payload.blockedBy;
    }
  }
}

// =============================================================================
// Memory Index Projection
// =============================================================================

/**
 * Memory state in projection
 */
export interface MemoryProjectionState {
  id: string;
  namespace: string;
  key: string;
  type: string;
  size: number;
  accessCount: number;
  storedAt: number;
  lastAccessedAt: number;
  deletedAt: number | null;
  isDeleted: boolean;
}

/**
 * Memory Index Projection
 *
 * Tracks memory operations and access patterns.
 */
export class MemoryIndexProjection extends EventEmitter implements IProjection {
  private readonly eventStore: IEventStore;
  private readonly memories = new Map<string, MemoryProjectionState>();
  private _initialized = false;

  constructor(eventStore: IEventStore) {
    super();
    this.eventStore = eventStore;
  }

  get initialized(): boolean {
    return this._initialized;
  }

  async initialize(): Promise<void> {
    for await (const event of this.eventStore.replay()) {
      await this.handle(event);
    }
    this._initialized = true;
    this.emit("initialized");
  }

  async handle(event: DomainEvent): Promise<void> {
    switch (event.type) {
      case SystemEventTypes.MEMORY_STORED:
        this.handleMemoryStored(event as DomainEvent<MemoryStoredPayload>);
        break;
      case SystemEventTypes.MEMORY_RETRIEVED:
        this.handleMemoryRetrieved(event as DomainEvent<MemoryRetrievedPayload>);
        break;
      case SystemEventTypes.MEMORY_DELETED:
        this.handleMemoryDeleted(event as DomainEvent<MemoryDeletedPayload>);
        break;
    }
  }

  reset(): void {
    this.memories.clear();
    this._initialized = false;
  }

  // Query methods

  getMemory(memoryId: string): MemoryProjectionState | undefined {
    return this.memories.get(memoryId);
  }

  getActiveMemories(): MemoryProjectionState[] {
    return Array.from(this.memories.values()).filter((m) => !m.isDeleted);
  }

  getMemoriesByNamespace(namespace: string): MemoryProjectionState[] {
    return this.getActiveMemories().filter((m) => m.namespace === namespace);
  }

  getMostAccessedMemories(limit: number): MemoryProjectionState[] {
    return this.getActiveMemories()
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit);
  }

  getTotalSizeByNamespace(namespace: string): number {
    return this.getMemoriesByNamespace(namespace).reduce((sum, m) => sum + m.size, 0);
  }

  // Event handlers

  private handleMemoryStored(event: DomainEvent<MemoryStoredPayload>): void {
    const { memoryId, namespace, key, type, size } = event.payload;

    this.memories.set(memoryId, {
      id: memoryId,
      namespace,
      key,
      type,
      size,
      accessCount: 0,
      storedAt: event.timestamp.getTime(),
      lastAccessedAt: event.timestamp.getTime(),
      deletedAt: null,
      isDeleted: false,
    });
  }

  private handleMemoryRetrieved(event: DomainEvent<MemoryRetrievedPayload>): void {
    const memory = this.memories.get(event.payload.memoryId);
    if (memory) {
      memory.accessCount++;
      memory.lastAccessedAt = event.timestamp.getTime();
    }
  }

  private handleMemoryDeleted(event: DomainEvent<MemoryDeletedPayload>): void {
    const memory = this.memories.get(event.payload.memoryId);
    if (memory) {
      memory.isDeleted = true;
      memory.deletedAt = event.timestamp.getTime();
    }
  }
}
