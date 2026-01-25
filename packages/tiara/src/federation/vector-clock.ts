/**
 * Vector Clock Implementation
 *
 * Lamport vector clocks for distributed conflict detection and resolution.
 * Used in federation sync for causal ordering of updates.
 *
 * Ported from claude-flow v3 @agentic-flow/federation
 *
 * @module tiara/federation/vector-clock
 */

import type { VectorClock, VectorClockComparison } from "./types.js";

// =============================================================================
// Vector Clock Operations
// =============================================================================

/**
 * Create a new vector clock
 */
export function createVectorClock(nodeId?: string): VectorClock {
  const clock: VectorClock = {};
  if (nodeId) {
    clock[nodeId] = 0;
  }
  return clock;
}

/**
 * Increment the clock for a specific node
 */
export function incrementClock(
  clock: VectorClock,
  nodeId: string
): VectorClock {
  return {
    ...clock,
    [nodeId]: (clock[nodeId] || 0) + 1,
  };
}

/**
 * Merge two vector clocks (take maximum for each node)
 */
export function mergeClocks(
  clock1: VectorClock,
  clock2: VectorClock
): VectorClock {
  const merged: VectorClock = { ...clock1 };

  for (const nodeId in clock2) {
    const ts1 = merged[nodeId] || 0;
    const ts2 = clock2[nodeId];
    merged[nodeId] = Math.max(ts1, ts2);
  }

  return merged;
}

/**
 * Compare two vector clocks to determine causal relationship
 *
 * Returns:
 * - "before": clock1 happened before clock2
 * - "after": clock1 happened after clock2
 * - "concurrent": clocks are concurrent (potential conflict)
 * - "equal": clocks are identical
 */
export function compareClocks(
  clock1: VectorClock,
  clock2: VectorClock
): VectorClockComparison {
  // Get all node IDs from both clocks
  const allNodes = new Set([...Object.keys(clock1), ...Object.keys(clock2)]);

  let clock1Dominates = false;
  let clock2Dominates = false;

  for (const nodeId of allNodes) {
    const ts1 = clock1[nodeId] || 0;
    const ts2 = clock2[nodeId] || 0;

    if (ts1 > ts2) {
      clock1Dominates = true;
    } else if (ts2 > ts1) {
      clock2Dominates = true;
    }
  }

  if (clock1Dominates && clock2Dominates) {
    return "concurrent"; // Both have updates the other doesn't know about
  } else if (clock1Dominates) {
    return "after"; // clock1 happened after clock2
  } else if (clock2Dominates) {
    return "before"; // clock1 happened before clock2
  } else {
    return "equal"; // Identical clocks
  }
}

/**
 * Check if clock1 happened before clock2
 */
export function happenedBefore(
  clock1: VectorClock,
  clock2: VectorClock
): boolean {
  return compareClocks(clock1, clock2) === "before";
}

/**
 * Check if clocks are concurrent (potential conflict)
 */
export function areConcurrent(
  clock1: VectorClock,
  clock2: VectorClock
): boolean {
  return compareClocks(clock1, clock2) === "concurrent";
}

/**
 * Check if clocks are equal
 */
export function areEqual(clock1: VectorClock, clock2: VectorClock): boolean {
  return compareClocks(clock1, clock2) === "equal";
}

/**
 * Get the timestamp for a specific node
 */
export function getTimestamp(clock: VectorClock, nodeId: string): number {
  return clock[nodeId] || 0;
}

/**
 * Clone a vector clock
 */
export function cloneClock(clock: VectorClock): VectorClock {
  return { ...clock };
}

/**
 * Get all node IDs in a clock
 */
export function getNodes(clock: VectorClock): string[] {
  return Object.keys(clock);
}

/**
 * Get the total sum of all timestamps (for ordering concurrent events)
 */
export function getTotalSum(clock: VectorClock): number {
  return Object.values(clock).reduce((sum, ts) => sum + ts, 0);
}

// =============================================================================
// VectorClockManager Class
// =============================================================================

/**
 * Vector Clock Manager
 *
 * Manages a vector clock for a specific node in a distributed system.
 *
 * @example
 * const manager = new VectorClockManager('agent-1');
 *
 * manager.tick(); // Increment local timestamp
 *
 * const remoteClock = { 'agent-2': 5 };
 * manager.merge(remoteClock); // Merge with received clock
 *
 * const comparison = manager.compare(remoteClock);
 * if (comparison === 'concurrent') {
 *   // Handle conflict
 * }
 */
export class VectorClockManager {
  private nodeId: string;
  private clock: VectorClock;

  constructor(nodeId: string) {
    this.nodeId = nodeId;
    this.clock = createVectorClock(nodeId);
  }

  /**
   * Increment local timestamp (on local event)
   */
  tick(): void {
    this.clock = incrementClock(this.clock, this.nodeId);
  }

  /**
   * Merge with a received clock (on message receive)
   * Automatically increments local timestamp after merge
   */
  merge(remoteClock: VectorClock): void {
    this.clock = mergeClocks(this.clock, remoteClock);
    this.tick(); // Increment after merge
  }

  /**
   * Merge without incrementing (for inspection)
   */
  mergeSilent(remoteClock: VectorClock): void {
    this.clock = mergeClocks(this.clock, remoteClock);
  }

  /**
   * Compare local clock with remote clock
   */
  compare(remoteClock: VectorClock): VectorClockComparison {
    return compareClocks(this.clock, remoteClock);
  }

  /**
   * Check if remote clock indicates a concurrent update (conflict)
   */
  detectConflict(remoteClock: VectorClock): boolean {
    return areConcurrent(this.clock, remoteClock);
  }

  /**
   * Get current clock state
   */
  getClock(): VectorClock {
    return cloneClock(this.clock);
  }

  /**
   * Get local timestamp
   */
  getLocalTimestamp(): number {
    return getTimestamp(this.clock, this.nodeId);
  }

  /**
   * Get node ID
   */
  getNodeId(): string {
    return this.nodeId;
  }

  /**
   * Reset clock to initial state
   */
  reset(): void {
    this.clock = createVectorClock(this.nodeId);
  }

  /**
   * Set clock state (for recovery)
   */
  setClock(clock: VectorClock): void {
    this.clock = cloneClock(clock);
  }
}

/**
 * Create a vector clock manager
 */
export function createVectorClockManager(nodeId: string): VectorClockManager {
  return new VectorClockManager(nodeId);
}
