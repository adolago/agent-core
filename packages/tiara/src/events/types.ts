/**
 * Event Sourcing Type Definitions
 *
 * Core types for the Tiara event sourcing system.
 * Provides immutable event logging, replay, and state reconstruction.
 *
 * Ported from claude-flow v3 @claude-flow/shared/events
 *
 * @module tiara/events/types
 */

/**
 * Event priority levels
 */
export enum EventPriority {
  Critical = "critical",
  High = "high",
  Normal = "normal",
  Low = "low",
}

/**
 * Core event interface
 */
export interface IEvent<T = unknown> {
  /** Unique event ID */
  readonly id: string;
  /** Event type discriminator */
  readonly type: string;
  /** Event timestamp */
  readonly timestamp: Date;
  /** Event source (agent ID or system) */
  readonly source: string;
  /** Event payload */
  readonly payload: T;
  /** Event priority */
  readonly priority?: EventPriority;
  /** Groups related events */
  readonly correlationId?: string;
  /** Event that caused this event */
  readonly causationId?: string;
  /** Additional metadata */
  readonly metadata?: EventMetadata;
}

/**
 * Event metadata
 */
export interface EventMetadata {
  /** Event schema version */
  version?: number;
  /** User ID if applicable */
  userId?: string;
  /** Session ID */
  sessionId?: string;
  /** Custom metadata */
  [key: string]: unknown;
}

/**
 * Domain event extends base event with aggregate info
 */
export interface DomainEvent<T = unknown> extends IEvent<T> {
  /** Aggregate ID this event belongs to */
  readonly aggregateId: string;
  /** Aggregate type */
  readonly aggregateType: AggregateType;
  /** Event version within aggregate */
  version: number;
}

/**
 * Aggregate types
 */
export type AggregateType = "agent" | "task" | "memory" | "swarm" | "session";

/**
 * System event types
 */
export const SystemEventTypes = {
  // System lifecycle
  SYSTEM_READY: "system:ready",
  SYSTEM_SHUTDOWN: "system:shutdown",
  SYSTEM_ERROR: "system:error",
  SYSTEM_HEALTH_CHECK: "system:healthcheck",

  // Agent lifecycle
  AGENT_SPAWNED: "agent:spawned",
  AGENT_STARTED: "agent:started",
  AGENT_STOPPED: "agent:stopped",
  AGENT_FAILED: "agent:failed",
  AGENT_STATUS_CHANGED: "agent:status-changed",
  AGENT_TASK_ASSIGNED: "agent:task-assigned",
  AGENT_TASK_COMPLETED: "agent:task-completed",

  // Task lifecycle
  TASK_CREATED: "task:created",
  TASK_QUEUED: "task:queued",
  TASK_STARTED: "task:started",
  TASK_COMPLETED: "task:completed",
  TASK_FAILED: "task:failed",
  TASK_BLOCKED: "task:blocked",
  TASK_CANCELLED: "task:cancelled",

  // Memory operations
  MEMORY_STORED: "memory:stored",
  MEMORY_RETRIEVED: "memory:retrieved",
  MEMORY_DELETED: "memory:deleted",
  MEMORY_EXPIRED: "memory:expired",

  // Swarm coordination
  SWARM_INITIALIZED: "swarm:initialized",
  SWARM_SCALED: "swarm:scaled",
  SWARM_TERMINATED: "swarm:terminated",
  SWARM_PHASE_CHANGED: "swarm:phase-changed",

  // Session
  SESSION_CREATED: "session:created",
  SESSION_RESTORED: "session:restored",
  SESSION_TERMINATED: "session:terminated",
} as const;

export type SystemEventType = (typeof SystemEventTypes)[keyof typeof SystemEventTypes];

/**
 * Event handler function type
 */
export type EventHandler<T = unknown> = (event: IEvent<T>) => void | Promise<void>;

/**
 * Event filter for subscriptions
 */
export interface EventFilter {
  /** Event types to match (supports wildcards like 'agent:*') */
  types?: string[];
  /** Sources to match */
  sources?: string[];
  /** Priority filter */
  priority?: EventPriority;
  /** Correlation ID filter */
  correlationId?: string;
}

/**
 * Event subscription
 */
export interface EventSubscription {
  /** Unique subscription ID */
  readonly id: string;
  /** Filter for this subscription */
  readonly filter: EventFilter;
  /** Unsubscribe function */
  unsubscribe(): void;
  /** Pause subscription */
  pause(): void;
  /** Resume subscription */
  resume(): void;
  /** Check if paused */
  readonly isPaused: boolean;
}

/**
 * Event bus interface
 */
export interface IEventBus {
  /** Emit an event synchronously */
  emit<T>(type: string, payload: T, options?: EventEmitOptions): void;
  /** Emit an event and wait for all handlers */
  emitAsync<T>(type: string, payload: T, options?: EventEmitOptions): Promise<void>;
  /** Subscribe to events */
  subscribe<T>(filter: EventFilter, handler: EventHandler<T>): EventSubscription;
  /** Subscribe to a single event type */
  on<T>(type: string, handler: EventHandler<T>): () => void;
  /** Subscribe once */
  once<T>(type: string, handler: EventHandler<T>): () => void;
  /** Remove all handlers for a type */
  off(type: string): void;
  /** Get event history (if available) */
  getHistory(filter?: EventFilter): IEvent[];
  /** Clear history */
  clearHistory(): void;
}

/**
 * Options for emitting events
 */
export interface EventEmitOptions {
  /** Event source */
  source?: string;
  /** Event priority */
  priority?: EventPriority;
  /** Correlation ID */
  correlationId?: string;
  /** Causation ID */
  causationId?: string;
  /** Additional metadata */
  metadata?: EventMetadata;
}

/**
 * Event store filter
 */
export interface EventStoreFilter {
  /** Aggregate IDs to filter */
  aggregateIds?: string[];
  /** Aggregate types to filter */
  aggregateTypes?: AggregateType[];
  /** Event types to filter */
  eventTypes?: string[];
  /** Events after this timestamp */
  afterTimestamp?: number;
  /** Events before this timestamp */
  beforeTimestamp?: number;
  /** Events from this version */
  fromVersion?: number;
  /** Maximum events to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Event snapshot for state reconstruction
 */
export interface EventSnapshot {
  /** Aggregate ID */
  aggregateId: string;
  /** Aggregate type */
  aggregateType: AggregateType;
  /** Snapshot version */
  version: number;
  /** Serialized state */
  state: Record<string, unknown>;
  /** Snapshot timestamp */
  timestamp: number;
}

/**
 * Event store statistics
 */
export interface EventStoreStats {
  /** Total events stored */
  totalEvents: number;
  /** Events by type */
  eventsByType: Record<string, number>;
  /** Events by aggregate */
  eventsByAggregate: Record<string, number>;
  /** Oldest event timestamp */
  oldestEvent: number | null;
  /** Newest event timestamp */
  newestEvent: number | null;
  /** Number of snapshots */
  snapshotCount: number;
}

/**
 * Event store interface
 */
export interface IEventStore {
  /** Append an event */
  append(event: DomainEvent): Promise<void>;
  /** Get events for an aggregate */
  getEvents(aggregateId: string, fromVersion?: number): Promise<DomainEvent[]>;
  /** Get events by type */
  getEventsByType(type: string): Promise<DomainEvent[]>;
  /** Query events with filter */
  query(filter: EventStoreFilter): Promise<DomainEvent[]>;
  /** Get all events (generator for memory efficiency) */
  replay(fromVersion?: number): AsyncIterable<DomainEvent>;
  /** Save a snapshot */
  saveSnapshot(snapshot: EventSnapshot): Promise<void>;
  /** Get latest snapshot for aggregate */
  getSnapshot(aggregateId: string): Promise<EventSnapshot | null>;
  /** Get statistics */
  getStats(): Promise<EventStoreStats>;
  /** Clear all events */
  clear(): Promise<void>;
}

/**
 * Aggregate root interface for event sourcing
 */
export interface AggregateRoot {
  /** Aggregate ID */
  readonly id: string;
  /** Current version */
  version: number;
  /** Apply an event to update state */
  apply(event: DomainEvent): void;
  /** Get current state */
  getState(): Record<string, unknown>;
  /** Restore from snapshot */
  restoreFromSnapshot?(state: Record<string, unknown>): void;
}

/**
 * Projection interface for read models
 */
export interface IProjection {
  /** Initialize by replaying events */
  initialize(): Promise<void>;
  /** Handle a single event */
  handle(event: DomainEvent): Promise<void>;
  /** Reset projection state */
  reset(): void;
  /** Check if initialized */
  readonly initialized: boolean;
}
