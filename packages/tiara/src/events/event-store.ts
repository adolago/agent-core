/**
 * In-Memory Event Store
 *
 * Event store implementation for persistent event logging.
 * Supports snapshots for efficient state reconstruction.
 *
 * Ported from claude-flow v3 @claude-flow/shared/events
 *
 * @module tiara/events/event-store
 */

import { EventEmitter } from "events";
import type {
  DomainEvent,
  IEventStore,
  EventStoreFilter,
  EventSnapshot,
  EventStoreStats,
  AggregateType,
} from "./types.js";

/**
 * Event store configuration
 */
export interface EventStoreConfig {
  /** Snapshot threshold (create snapshot every N events per aggregate) */
  snapshotThreshold?: number;
  /** Maximum events to keep (0 for unlimited) */
  maxEvents?: number;
  /** Enable debug logging */
  debug?: boolean;
}

const DEFAULT_CONFIG: Required<EventStoreConfig> = {
  snapshotThreshold: 100,
  maxEvents: 0,
  debug: false,
};

/**
 * In-Memory Event Store
 *
 * Stores events in memory with support for:
 * - Per-aggregate versioning
 * - Snapshot storage
 * - Flexible querying
 * - Event replay
 *
 * @example
 * const store = new InMemoryEventStore({ snapshotThreshold: 50 });
 *
 * // Append events
 * await store.append({
 *   id: 'evt_1',
 *   type: 'agent:spawned',
 *   aggregateId: 'agent-1',
 *   aggregateType: 'agent',
 *   version: 1,
 *   timestamp: new Date(),
 *   source: 'system',
 *   payload: { role: 'coder' },
 * });
 *
 * // Query events
 * const events = await store.getEvents('agent-1');
 *
 * // Replay all events
 * for await (const event of store.replay()) {
 *   projection.handle(event);
 * }
 */
export class InMemoryEventStore extends EventEmitter implements IEventStore {
  private readonly config: Required<EventStoreConfig>;
  private readonly events: DomainEvent[] = [];
  private readonly eventsByAggregate = new Map<string, DomainEvent[]>();
  private readonly aggregateVersions = new Map<string, number>();
  private readonly snapshots = new Map<string, EventSnapshot>();

  constructor(config?: EventStoreConfig) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Append an event to the store
   */
  async append(event: DomainEvent): Promise<void> {
    // Get or initialize version for aggregate
    const currentVersion = this.aggregateVersions.get(event.aggregateId) || 0;
    const nextVersion = currentVersion + 1;

    // Assign version to event
    event.version = nextVersion;

    // Add to main event list
    this.events.push(event);

    // Add to aggregate-specific list
    if (!this.eventsByAggregate.has(event.aggregateId)) {
      this.eventsByAggregate.set(event.aggregateId, []);
    }
    this.eventsByAggregate.get(event.aggregateId)!.push(event);

    // Update version tracker
    this.aggregateVersions.set(event.aggregateId, nextVersion);

    // Check if snapshot recommended
    if (nextVersion % this.config.snapshotThreshold === 0) {
      this.emit("snapshot:recommended", {
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType,
        version: nextVersion,
      });
    }

    // Trim events if max exceeded
    if (this.config.maxEvents > 0 && this.events.length > this.config.maxEvents) {
      this.events.shift();
    }

    // Emit appended event
    this.emit("event:appended", event);

    if (this.config.debug) {
      console.debug(`Event appended: ${event.type} for ${event.aggregateId} v${nextVersion}`);
    }
  }

  /**
   * Get events for an aggregate
   */
  async getEvents(aggregateId: string, fromVersion?: number): Promise<DomainEvent[]> {
    const events = this.eventsByAggregate.get(aggregateId) || [];

    if (fromVersion !== undefined) {
      return events.filter((e) => e.version >= fromVersion);
    }

    return [...events];
  }

  /**
   * Get events by type
   */
  async getEventsByType(type: string): Promise<DomainEvent[]> {
    return this.events.filter((e) => e.type === type);
  }

  /**
   * Query events with filter
   */
  async query(filter: EventStoreFilter): Promise<DomainEvent[]> {
    let results = [...this.events];

    // Filter by aggregate IDs
    if (filter.aggregateIds && filter.aggregateIds.length > 0) {
      results = results.filter((e) => filter.aggregateIds!.includes(e.aggregateId));
    }

    // Filter by aggregate types
    if (filter.aggregateTypes && filter.aggregateTypes.length > 0) {
      results = results.filter((e) => filter.aggregateTypes!.includes(e.aggregateType));
    }

    // Filter by event types
    if (filter.eventTypes && filter.eventTypes.length > 0) {
      results = results.filter((e) => filter.eventTypes!.includes(e.type));
    }

    // Filter by timestamp
    if (filter.afterTimestamp !== undefined) {
      results = results.filter((e) => e.timestamp.getTime() > filter.afterTimestamp!);
    }
    if (filter.beforeTimestamp !== undefined) {
      results = results.filter((e) => e.timestamp.getTime() < filter.beforeTimestamp!);
    }

    // Filter by version
    if (filter.fromVersion !== undefined) {
      results = results.filter((e) => e.version >= filter.fromVersion!);
    }

    // Apply offset
    if (filter.offset !== undefined) {
      results = results.slice(filter.offset);
    }

    // Apply limit
    if (filter.limit !== undefined) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  /**
   * Replay all events (generator for memory efficiency)
   */
  async *replay(fromVersion?: number): AsyncIterable<DomainEvent> {
    for (const event of this.events) {
      if (fromVersion !== undefined && event.version < fromVersion) {
        continue;
      }
      yield event;
    }
  }

  /**
   * Save a snapshot
   */
  async saveSnapshot(snapshot: EventSnapshot): Promise<void> {
    this.snapshots.set(snapshot.aggregateId, snapshot);

    this.emit("snapshot:saved", snapshot);

    if (this.config.debug) {
      console.debug(`Snapshot saved for ${snapshot.aggregateId} v${snapshot.version}`);
    }
  }

  /**
   * Get latest snapshot for an aggregate
   */
  async getSnapshot(aggregateId: string): Promise<EventSnapshot | null> {
    return this.snapshots.get(aggregateId) || null;
  }

  /**
   * Get store statistics
   */
  async getStats(): Promise<EventStoreStats> {
    const eventsByType: Record<string, number> = {};
    const eventsByAggregate: Record<string, number> = {};

    for (const event of this.events) {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      eventsByAggregate[event.aggregateId] = (eventsByAggregate[event.aggregateId] || 0) + 1;
    }

    return {
      totalEvents: this.events.length,
      eventsByType,
      eventsByAggregate,
      oldestEvent: this.events.length > 0 ? this.events[0]!.timestamp.getTime() : null,
      newestEvent:
        this.events.length > 0 ? this.events[this.events.length - 1]!.timestamp.getTime() : null,
      snapshotCount: this.snapshots.size,
    };
  }

  /**
   * Clear all events and snapshots
   */
  async clear(): Promise<void> {
    this.events.length = 0;
    this.eventsByAggregate.clear();
    this.aggregateVersions.clear();
    this.snapshots.clear();

    this.emit("store:cleared");
  }

  /**
   * Get current version for an aggregate
   */
  getAggregateVersion(aggregateId: string): number {
    return this.aggregateVersions.get(aggregateId) || 0;
  }

  /**
   * Get all aggregate IDs
   */
  getAggregateIds(): string[] {
    return Array.from(this.eventsByAggregate.keys());
  }
}

/**
 * Create an in-memory event store
 */
export function createEventStore(config?: EventStoreConfig): IEventStore {
  return new InMemoryEventStore(config);
}
