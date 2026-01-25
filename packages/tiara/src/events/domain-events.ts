/**
 * Domain Events
 *
 * Typed domain events for agents, tasks, memory, and swarm.
 * Includes factory functions for creating events.
 *
 * Ported from claude-flow v3 @claude-flow/shared/events
 *
 * @module tiara/events/domain-events
 */

import { randomBytes } from "crypto";
import type { DomainEvent, AggregateType, EventPriority } from "./types.js";
import { SystemEventTypes } from "./types.js";

/**
 * Counter for event IDs (ensures uniqueness within same millisecond)
 */
let eventCounter = 0;

/**
 * Generate a unique domain event ID
 */
function generateDomainEventId(): string {
  const timestamp = Date.now().toString(36);
  const counter = (++eventCounter % 1000).toString().padStart(3, "0");
  const random = randomBytes(4).toString("hex");
  return `evt_${timestamp}_${counter}_${random}`;
}

/**
 * Create a base domain event
 */
function createDomainEvent<T>(
  type: string,
  aggregateId: string,
  aggregateType: AggregateType,
  payload: T,
  options?: {
    source?: string;
    priority?: EventPriority;
    correlationId?: string;
    causationId?: string;
  }
): DomainEvent<T> {
  return {
    id: generateDomainEventId(),
    type,
    timestamp: new Date(),
    source: options?.source ?? "system",
    aggregateId,
    aggregateType,
    version: 0, // Will be set by event store
    payload,
    priority: options?.priority,
    correlationId: options?.correlationId,
    causationId: options?.causationId,
  };
}

// =============================================================================
// Agent Events
// =============================================================================

/**
 * Agent spawned event payload
 */
export interface AgentSpawnedPayload {
  agentId: string;
  role: string;
  domain: string;
  capabilities: string[];
  model?: string;
}

/**
 * Create agent spawned event
 */
export function createAgentSpawnedEvent(
  agentId: string,
  role: string,
  domain: string,
  capabilities: string[],
  options?: { source?: string; model?: string }
): DomainEvent<AgentSpawnedPayload> {
  return createDomainEvent(
    SystemEventTypes.AGENT_SPAWNED,
    agentId,
    "agent",
    { agentId, role, domain, capabilities, model: options?.model },
    { source: options?.source }
  );
}

/**
 * Agent started event payload
 */
export interface AgentStartedPayload {
  agentId: string;
}

/**
 * Create agent started event
 */
export function createAgentStartedEvent(
  agentId: string,
  options?: { source?: string }
): DomainEvent<AgentStartedPayload> {
  return createDomainEvent(SystemEventTypes.AGENT_STARTED, agentId, "agent", { agentId }, options);
}

/**
 * Agent stopped event payload
 */
export interface AgentStoppedPayload {
  agentId: string;
  reason: string;
  metrics?: {
    tasksCompleted: number;
    totalDuration: number;
  };
}

/**
 * Create agent stopped event
 */
export function createAgentStoppedEvent(
  agentId: string,
  reason: string,
  metrics?: { tasksCompleted: number; totalDuration: number },
  options?: { source?: string }
): DomainEvent<AgentStoppedPayload> {
  return createDomainEvent(
    SystemEventTypes.AGENT_STOPPED,
    agentId,
    "agent",
    { agentId, reason, metrics },
    options
  );
}

/**
 * Agent failed event payload
 */
export interface AgentFailedPayload {
  agentId: string;
  error: string;
  stack?: string;
}

/**
 * Create agent failed event
 */
export function createAgentFailedEvent(
  agentId: string,
  error: string,
  stack?: string,
  options?: { source?: string }
): DomainEvent<AgentFailedPayload> {
  return createDomainEvent(
    SystemEventTypes.AGENT_FAILED,
    agentId,
    "agent",
    { agentId, error, stack },
    options
  );
}

/**
 * Agent status changed event payload
 */
export interface AgentStatusChangedPayload {
  agentId: string;
  previousStatus: string;
  newStatus: string;
}

/**
 * Create agent status changed event
 */
export function createAgentStatusChangedEvent(
  agentId: string,
  previousStatus: string,
  newStatus: string,
  options?: { source?: string }
): DomainEvent<AgentStatusChangedPayload> {
  return createDomainEvent(
    SystemEventTypes.AGENT_STATUS_CHANGED,
    agentId,
    "agent",
    { agentId, previousStatus, newStatus },
    options
  );
}

/**
 * Agent task assigned event payload
 */
export interface AgentTaskAssignedPayload {
  agentId: string;
  taskId: string;
  taskType: string;
}

/**
 * Create agent task assigned event
 */
export function createAgentTaskAssignedEvent(
  agentId: string,
  taskId: string,
  taskType: string,
  options?: { source?: string }
): DomainEvent<AgentTaskAssignedPayload> {
  return createDomainEvent(
    SystemEventTypes.AGENT_TASK_ASSIGNED,
    agentId,
    "agent",
    { agentId, taskId, taskType },
    options
  );
}

/**
 * Agent task completed event payload
 */
export interface AgentTaskCompletedPayload {
  agentId: string;
  taskId: string;
  duration: number;
  result?: unknown;
}

/**
 * Create agent task completed event
 */
export function createAgentTaskCompletedEvent(
  agentId: string,
  taskId: string,
  duration: number,
  result?: unknown,
  options?: { source?: string }
): DomainEvent<AgentTaskCompletedPayload> {
  return createDomainEvent(
    SystemEventTypes.AGENT_TASK_COMPLETED,
    agentId,
    "agent",
    { agentId, taskId, duration, result },
    options
  );
}

// =============================================================================
// Task Events
// =============================================================================

/**
 * Task created event payload
 */
export interface TaskCreatedPayload {
  taskId: string;
  type: string;
  title: string;
  description?: string;
  priority: string;
  dependencies?: string[];
}

/**
 * Create task created event
 */
export function createTaskCreatedEvent(
  taskId: string,
  type: string,
  title: string,
  priority: string,
  options?: { description?: string; dependencies?: string[]; source?: string }
): DomainEvent<TaskCreatedPayload> {
  return createDomainEvent(
    SystemEventTypes.TASK_CREATED,
    taskId,
    "task",
    {
      taskId,
      type,
      title,
      priority,
      description: options?.description,
      dependencies: options?.dependencies,
    },
    { source: options?.source }
  );
}

/**
 * Task started event payload
 */
export interface TaskStartedPayload {
  taskId: string;
  agentId: string;
}

/**
 * Create task started event
 */
export function createTaskStartedEvent(
  taskId: string,
  agentId: string,
  options?: { source?: string }
): DomainEvent<TaskStartedPayload> {
  return createDomainEvent(
    SystemEventTypes.TASK_STARTED,
    taskId,
    "task",
    { taskId, agentId },
    options
  );
}

/**
 * Task completed event payload
 */
export interface TaskCompletedPayload {
  taskId: string;
  agentId: string;
  duration: number;
  result?: unknown;
}

/**
 * Create task completed event
 */
export function createTaskCompletedEvent(
  taskId: string,
  agentId: string,
  duration: number,
  result?: unknown,
  options?: { source?: string }
): DomainEvent<TaskCompletedPayload> {
  return createDomainEvent(
    SystemEventTypes.TASK_COMPLETED,
    taskId,
    "task",
    { taskId, agentId, duration, result },
    options
  );
}

/**
 * Task failed event payload
 */
export interface TaskFailedPayload {
  taskId: string;
  agentId?: string;
  error: string;
  retryCount: number;
}

/**
 * Create task failed event
 */
export function createTaskFailedEvent(
  taskId: string,
  error: string,
  retryCount: number,
  agentId?: string,
  options?: { source?: string }
): DomainEvent<TaskFailedPayload> {
  return createDomainEvent(
    SystemEventTypes.TASK_FAILED,
    taskId,
    "task",
    { taskId, agentId, error, retryCount },
    options
  );
}

/**
 * Task blocked event payload
 */
export interface TaskBlockedPayload {
  taskId: string;
  blockedBy: string[];
}

/**
 * Create task blocked event
 */
export function createTaskBlockedEvent(
  taskId: string,
  blockedBy: string[],
  options?: { source?: string }
): DomainEvent<TaskBlockedPayload> {
  return createDomainEvent(
    SystemEventTypes.TASK_BLOCKED,
    taskId,
    "task",
    { taskId, blockedBy },
    options
  );
}

// =============================================================================
// Memory Events
// =============================================================================

/**
 * Memory stored event payload
 */
export interface MemoryStoredPayload {
  memoryId: string;
  namespace: string;
  key: string;
  type: string;
  size: number;
}

/**
 * Create memory stored event
 */
export function createMemoryStoredEvent(
  memoryId: string,
  namespace: string,
  key: string,
  type: string,
  size: number,
  options?: { source?: string }
): DomainEvent<MemoryStoredPayload> {
  return createDomainEvent(
    SystemEventTypes.MEMORY_STORED,
    memoryId,
    "memory",
    { memoryId, namespace, key, type, size },
    options
  );
}

/**
 * Memory retrieved event payload
 */
export interface MemoryRetrievedPayload {
  memoryId: string;
  namespace: string;
  key: string;
}

/**
 * Create memory retrieved event
 */
export function createMemoryRetrievedEvent(
  memoryId: string,
  namespace: string,
  key: string,
  options?: { source?: string }
): DomainEvent<MemoryRetrievedPayload> {
  return createDomainEvent(
    SystemEventTypes.MEMORY_RETRIEVED,
    memoryId,
    "memory",
    { memoryId, namespace, key },
    options
  );
}

/**
 * Memory deleted event payload
 */
export interface MemoryDeletedPayload {
  memoryId: string;
  namespace: string;
  key: string;
}

/**
 * Create memory deleted event
 */
export function createMemoryDeletedEvent(
  memoryId: string,
  namespace: string,
  key: string,
  options?: { source?: string }
): DomainEvent<MemoryDeletedPayload> {
  return createDomainEvent(
    SystemEventTypes.MEMORY_DELETED,
    memoryId,
    "memory",
    { memoryId, namespace, key },
    options
  );
}

// =============================================================================
// Swarm Events
// =============================================================================

/**
 * Swarm initialized event payload
 */
export interface SwarmInitializedPayload {
  swarmId: string;
  topology: string;
  agentCount: number;
}

/**
 * Create swarm initialized event
 */
export function createSwarmInitializedEvent(
  swarmId: string,
  topology: string,
  agentCount: number,
  options?: { source?: string }
): DomainEvent<SwarmInitializedPayload> {
  return createDomainEvent(
    SystemEventTypes.SWARM_INITIALIZED,
    swarmId,
    "swarm",
    { swarmId, topology, agentCount },
    options
  );
}

/**
 * Swarm scaled event payload
 */
export interface SwarmScaledPayload {
  swarmId: string;
  previousCount: number;
  newCount: number;
  reason: string;
}

/**
 * Create swarm scaled event
 */
export function createSwarmScaledEvent(
  swarmId: string,
  previousCount: number,
  newCount: number,
  reason: string,
  options?: { source?: string }
): DomainEvent<SwarmScaledPayload> {
  return createDomainEvent(
    SystemEventTypes.SWARM_SCALED,
    swarmId,
    "swarm",
    { swarmId, previousCount, newCount, reason },
    options
  );
}

/**
 * Swarm terminated event payload
 */
export interface SwarmTerminatedPayload {
  swarmId: string;
  reason: string;
  metrics?: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    totalDuration: number;
  };
}

/**
 * Create swarm terminated event
 */
export function createSwarmTerminatedEvent(
  swarmId: string,
  reason: string,
  metrics?: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    totalDuration: number;
  },
  options?: { source?: string }
): DomainEvent<SwarmTerminatedPayload> {
  return createDomainEvent(
    SystemEventTypes.SWARM_TERMINATED,
    swarmId,
    "swarm",
    { swarmId, reason, metrics },
    options
  );
}
