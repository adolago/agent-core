/**
 * Event Sourcing Module
 *
 * Complete event sourcing system for Tiara orchestration engine.
 * Provides immutable event logging, replay, projections, and state reconstruction.
 *
 * Ported from claude-flow v3 @claude-flow/shared/events
 *
 * @module tiara/events
 */

// Types
export type {
  IEvent,
  DomainEvent,
  AggregateType,
  EventMetadata,
  EventHandler,
  EventFilter,
  EventSubscription,
  EventEmitOptions,
  IEventBus,
  EventStoreFilter,
  EventSnapshot,
  EventStoreStats,
  IEventStore,
  AggregateRoot,
  IProjection,
} from "./types.js";

export { EventPriority, SystemEventTypes } from "./types.js";
export type { SystemEventType } from "./types.js";

// Event Bus
export { EventBus, createEventBus } from "./event-bus.js";
export type { EventBusConfig } from "./event-bus.js";

// Event Store
export { InMemoryEventStore, createEventStore } from "./event-store.js";
export type { EventStoreConfig } from "./event-store.js";

// Domain Events
export {
  // Agent events
  createAgentSpawnedEvent,
  createAgentStartedEvent,
  createAgentStoppedEvent,
  createAgentFailedEvent,
  createAgentStatusChangedEvent,
  createAgentTaskAssignedEvent,
  createAgentTaskCompletedEvent,
  // Task events
  createTaskCreatedEvent,
  createTaskStartedEvent,
  createTaskCompletedEvent,
  createTaskFailedEvent,
  createTaskBlockedEvent,
  // Memory events
  createMemoryStoredEvent,
  createMemoryRetrievedEvent,
  createMemoryDeletedEvent,
  // Swarm events
  createSwarmInitializedEvent,
  createSwarmScaledEvent,
  createSwarmTerminatedEvent,
} from "./domain-events.js";

export type {
  // Agent payloads
  AgentSpawnedPayload,
  AgentStartedPayload,
  AgentStoppedPayload,
  AgentFailedPayload,
  AgentStatusChangedPayload,
  AgentTaskAssignedPayload,
  AgentTaskCompletedPayload,
  // Task payloads
  TaskCreatedPayload,
  TaskStartedPayload,
  TaskCompletedPayload,
  TaskFailedPayload,
  TaskBlockedPayload,
  // Memory payloads
  MemoryStoredPayload,
  MemoryRetrievedPayload,
  MemoryDeletedPayload,
  // Swarm payloads
  SwarmInitializedPayload,
  SwarmScaledPayload,
  SwarmTerminatedPayload,
} from "./domain-events.js";

// Projections
export {
  AgentStateProjection,
  TaskHistoryProjection,
  MemoryIndexProjection,
} from "./projections.js";

export type {
  AgentProjectionState,
  TaskProjectionState,
  MemoryProjectionState,
} from "./projections.js";
