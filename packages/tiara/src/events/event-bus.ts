/**
 * Event Bus Implementation
 *
 * Pub/sub event bus with filtering, subscriptions, and history.
 * Supports both synchronous and asynchronous event emission.
 *
 * Ported from claude-flow v3 @claude-flow/shared/events
 *
 * @module tiara/events/event-bus
 */

import { EventEmitter } from "events";
import { randomBytes } from "crypto";
import type {
  IEvent,
  IEventBus,
  EventHandler,
  EventFilter,
  EventSubscription,
  EventEmitOptions,
  EventPriority,
} from "./types.js";

/**
 * Generate a unique event ID
 */
function generateEventId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8).toString("hex");
  return `evt_${timestamp}_${random}`;
}

/**
 * Generate a unique subscription ID
 */
function generateSubscriptionId(): string {
  return `sub_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

/**
 * Check if an event type matches a pattern (supports wildcards)
 */
function matchesType(eventType: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith(":*")) {
    const prefix = pattern.slice(0, -1);
    return eventType.startsWith(prefix);
  }
  return eventType === pattern;
}

/**
 * Check if an event matches a filter
 */
function matchesFilter(event: IEvent, filter: EventFilter): boolean {
  // Check types
  if (filter.types && filter.types.length > 0) {
    const typeMatch = filter.types.some((pattern) => matchesType(event.type, pattern));
    if (!typeMatch) return false;
  }

  // Check sources
  if (filter.sources && filter.sources.length > 0) {
    if (!filter.sources.includes(event.source)) return false;
  }

  // Check priority
  if (filter.priority && event.priority !== filter.priority) {
    return false;
  }

  // Check correlation ID
  if (filter.correlationId && event.correlationId !== filter.correlationId) {
    return false;
  }

  return true;
}

/**
 * Internal subscription entry
 */
interface SubscriptionEntry {
  id: string;
  filter: EventFilter;
  handler: EventHandler;
  paused: boolean;
}

/**
 * Event Bus Configuration
 */
export interface EventBusConfig {
  /** Maximum history size (0 to disable) */
  maxHistorySize?: number;
  /** Default event source */
  defaultSource?: string;
  /** Enable debug logging */
  debug?: boolean;
}

const DEFAULT_CONFIG: Required<EventBusConfig> = {
  maxHistorySize: 10000,
  defaultSource: "system",
  debug: false,
};

/**
 * Event Bus
 *
 * Pub/sub event system with filtering, subscriptions, and history.
 *
 * @example
 * const bus = new EventBus();
 *
 * // Subscribe to specific events
 * bus.on('agent:spawned', (event) => {
 *   console.log('Agent spawned:', event.payload);
 * });
 *
 * // Subscribe with filter
 * bus.subscribe({ types: ['agent:*'] }, (event) => {
 *   console.log('Agent event:', event.type);
 * });
 *
 * // Emit events
 * bus.emit('agent:spawned', { agentId: 'agent-1', role: 'coder' });
 */
export class EventBus extends EventEmitter implements IEventBus {
  private readonly config: Required<EventBusConfig>;
  private readonly subscriptions = new Map<string, SubscriptionEntry>();
  private readonly typeHandlers = new Map<string, Set<EventHandler>>();
  private readonly history: IEvent[] = [];

  constructor(config?: EventBusConfig) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Emit an event synchronously
   */
  emit<T>(type: string, payload: T, options?: EventEmitOptions): boolean {
    const event = this.createEvent(type, payload, options);

    // Add to history
    this.addToHistory(event);

    // Dispatch to handlers
    this.dispatch(event);

    // Also emit on EventEmitter for wildcard listeners
    return super.emit(type, event);
  }

  /**
   * Emit an event and wait for all async handlers
   */
  async emitAsync<T>(type: string, payload: T, options?: EventEmitOptions): Promise<void> {
    const event = this.createEvent(type, payload, options);

    // Add to history
    this.addToHistory(event);

    // Dispatch and wait
    await this.dispatchAsync(event);

    // Also emit on EventEmitter
    super.emit(type, event);
  }

  /**
   * Subscribe to events with a filter
   */
  subscribe<T>(filter: EventFilter, handler: EventHandler<T>): EventSubscription {
    const id = generateSubscriptionId();

    const entry: SubscriptionEntry = {
      id,
      filter,
      handler: handler as EventHandler,
      paused: false,
    };

    this.subscriptions.set(id, entry);

    return {
      id,
      filter,
      isPaused: false,
      unsubscribe: () => {
        this.subscriptions.delete(id);
      },
      pause: () => {
        entry.paused = true;
      },
      resume: () => {
        entry.paused = false;
      },
    };
  }

  /**
   * Subscribe to a single event type
   */
  on<T>(type: string, handler: EventHandler<T>): () => void {
    if (!this.typeHandlers.has(type)) {
      this.typeHandlers.set(type, new Set());
    }
    this.typeHandlers.get(type)!.add(handler as EventHandler);

    return () => {
      this.typeHandlers.get(type)?.delete(handler as EventHandler);
    };
  }

  /**
   * Subscribe to a single event once
   */
  once<T>(type: string, handler: EventHandler<T>): () => void {
    const wrappedHandler: EventHandler<T> = (event) => {
      this.typeHandlers.get(type)?.delete(wrappedHandler as EventHandler);
      return handler(event);
    };

    if (!this.typeHandlers.has(type)) {
      this.typeHandlers.set(type, new Set());
    }
    this.typeHandlers.get(type)!.add(wrappedHandler as EventHandler);

    return () => {
      this.typeHandlers.get(type)?.delete(wrappedHandler as EventHandler);
    };
  }

  /**
   * Remove all handlers for a type
   */
  off(type: string): void {
    this.typeHandlers.delete(type);
    super.removeAllListeners(type);
  }

  /**
   * Get event history
   */
  getHistory(filter?: EventFilter): IEvent[] {
    if (!filter) {
      return [...this.history];
    }

    return this.history.filter((event) => matchesFilter(event, filter));
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.history.length = 0;
  }

  /**
   * Create an event object
   */
  private createEvent<T>(type: string, payload: T, options?: EventEmitOptions): IEvent<T> {
    return {
      id: generateEventId(),
      type,
      timestamp: new Date(),
      source: options?.source ?? this.config.defaultSource,
      payload,
      priority: options?.priority,
      correlationId: options?.correlationId,
      causationId: options?.causationId,
      metadata: options?.metadata,
    };
  }

  /**
   * Add event to history
   */
  private addToHistory(event: IEvent): void {
    if (this.config.maxHistorySize <= 0) return;

    this.history.push(event);

    // Trim history if needed
    while (this.history.length > this.config.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * Dispatch event to handlers synchronously
   */
  private dispatch(event: IEvent): void {
    // Dispatch to type handlers
    const handlers = this.typeHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          if (this.config.debug) {
            console.error(`Event handler error for ${event.type}:`, error);
          }
        }
      }
    }

    // Dispatch to subscription handlers
    for (const entry of this.subscriptions.values()) {
      if (entry.paused) continue;
      if (!matchesFilter(event, entry.filter)) continue;

      try {
        entry.handler(event);
      } catch (error) {
        if (this.config.debug) {
          console.error(`Subscription handler error for ${event.type}:`, error);
        }
      }
    }
  }

  /**
   * Dispatch event to handlers asynchronously
   */
  private async dispatchAsync(event: IEvent): Promise<void> {
    const promises: Promise<void>[] = [];

    // Dispatch to type handlers
    const handlers = this.typeHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        promises.push(
          Promise.resolve()
            .then(() => handler(event))
            .catch((error) => {
              if (this.config.debug) {
                console.error(`Event handler error for ${event.type}:`, error);
              }
            })
        );
      }
    }

    // Dispatch to subscription handlers
    for (const entry of this.subscriptions.values()) {
      if (entry.paused) continue;
      if (!matchesFilter(event, entry.filter)) continue;

      promises.push(
        Promise.resolve()
          .then(() => entry.handler(event))
          .catch((error) => {
            if (this.config.debug) {
              console.error(`Subscription handler error for ${event.type}:`, error);
            }
          })
      );
    }

    await Promise.allSettled(promises);
  }
}

/**
 * Create a new event bus
 */
export function createEventBus(config?: EventBusConfig): IEventBus {
  return new EventBus(config);
}
