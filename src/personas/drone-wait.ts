/**
 * Drone Wait & Announce
 *
 * Patterns for waiting on drone completion and announcing results.
 * Ported from zee's sessions-spawn-tool.ts for personas integration.
 */

import { EventEmitter } from 'node:events';
import type {
  AnnounceOptions,
  DroneResult,
  SpawnWithWaitOptions,
  WaitOptions,
  WorkerId,
} from './types';

// ============================================================================
// Drone Waiter
// ============================================================================

/**
 * Manages waiting for drone completion with timeout support
 */
export class DroneWaiter extends EventEmitter {
  private pendingWaits = new Map<WorkerId, {
    resolve: (result: DroneResult) => void;
    timeoutHandle?: ReturnType<typeof setTimeout>;
    startedAt: number;
  }>();
  private recentResults = new Map<WorkerId, { result: DroneResult; storedAt: number }>();
  private resultTtlMs = 300000;

  /**
   * Wait for a drone to complete
   */
  async waitFor(workerId: WorkerId, options: WaitOptions = {}): Promise<DroneResult> {
    const { timeoutMs = 300000 } = options; // Default 5 minutes
    const recent = this.takeRecentResult(workerId);
    if (recent) {
      return recent;
    }

    // Fire-and-forget mode
    if (timeoutMs === 0) {
      return {
        workerId,
        status: 'ok',
        result: 'Task accepted (fire-and-forget)',
        durationMs: 0,
      };
    }

    return new Promise<DroneResult>((resolve) => {
      const startedAt = Date.now();

      const entry = {
        resolve,
        startedAt,
        timeoutHandle: undefined as ReturnType<typeof setTimeout> | undefined,
      };

      // Set up timeout
      entry.timeoutHandle = setTimeout(() => {
        this.pendingWaits.delete(workerId);
        resolve({
          workerId,
          status: 'timeout',
          error: `Drone did not complete within ${timeoutMs}ms`,
          durationMs: Date.now() - startedAt,
        });
      }, timeoutMs);

      this.pendingWaits.set(workerId, entry);
    });
  }

  /**
   * Notify that a drone has completed
   */
  notifyComplete(workerId: WorkerId, result?: string): void {
    const entry = this.pendingWaits.get(workerId);
    if (!entry) {
      this.storeRecentResult({
        workerId,
        status: 'ok',
        result,
        durationMs: 0,
      });
      return;
    }

    if (entry.timeoutHandle) {
      clearTimeout(entry.timeoutHandle);
    }

    this.pendingWaits.delete(workerId);

    entry.resolve({
      workerId,
      status: 'ok',
      result,
      durationMs: Date.now() - entry.startedAt,
    });
  }

  /**
   * Notify that a drone has errored
   */
  notifyError(workerId: WorkerId, error: string): void {
    const entry = this.pendingWaits.get(workerId);
    if (!entry) {
      this.storeRecentResult({
        workerId,
        status: 'error',
        error,
        durationMs: 0,
      });
      return;
    }

    if (entry.timeoutHandle) {
      clearTimeout(entry.timeoutHandle);
    }

    this.pendingWaits.delete(workerId);

    entry.resolve({
      workerId,
      status: 'error',
      error,
      durationMs: Date.now() - entry.startedAt,
    });
  }

  /**
   * Cancel all pending waits
   */
  cancelAll(): void {
    const entries = Array.from(this.pendingWaits.entries());
    for (const [workerId, entry] of entries) {
      if (entry.timeoutHandle) {
        clearTimeout(entry.timeoutHandle);
      }
      entry.resolve({
        workerId,
        status: 'error',
        error: 'Wait cancelled',
        durationMs: Date.now() - entry.startedAt,
      });
    }
    this.pendingWaits.clear();
    this.recentResults.clear();
  }

  /**
   * Check if we're waiting for a specific drone
   */
  isWaiting(workerId: WorkerId): boolean {
    return this.pendingWaits.has(workerId);
  }

  /**
   * Get all pending wait worker IDs
   */
  getPendingWorkerIds(): WorkerId[] {
    return Array.from(this.pendingWaits.keys());
  }

  private storeRecentResult(result: DroneResult): void {
    this.recentResults.set(result.workerId, { result, storedAt: Date.now() });
    this.pruneRecentResults();
  }

  private takeRecentResult(workerId: WorkerId): DroneResult | undefined {
    this.pruneRecentResults();
    const entry = this.recentResults.get(workerId);
    if (!entry) return undefined;
    this.recentResults.delete(workerId);
    return entry.result;
  }

  private pruneRecentResults(): void {
    const now = Date.now();
    const entries = Array.from(this.recentResults.entries());
    for (const [workerId, entry] of entries) {
      if (now - entry.storedAt > this.resultTtlMs) {
        this.recentResults.delete(workerId);
      }
    }
  }
}

// ============================================================================
// Announce Flow
// ============================================================================

/**
 * Format a drone result for announcement
 */
export function formatAnnouncement(result: DroneResult, options: AnnounceOptions): string {
  const prefix = options.prefix ?? '';
  const format = options.target.format ?? 'text';

  if (result.status === 'error') {
    return `${prefix}ERROR: ${result.error}`;
  }

  if (result.status === 'timeout') {
    return `${prefix}TIMEOUT: Task timed out after ${Math.round(result.durationMs / 1000)}s`;
  }

  // Success case
  const duration = Math.round(result.durationMs / 1000);
  const resultText = result.result ?? 'Task completed';

  if (format === 'json') {
    return JSON.stringify(
      {
        status: 'ok',
        duration,
        result: resultText,
      },
      null,
      2
    );
  }

  if (format === 'markdown') {
    return `${prefix}**Task completed** (${duration}s)\n\n${resultText}`;
  }

  return `${prefix}Task completed (${duration}s): ${resultText}`;
}

/**
 * Check if a result should be announced (skip trivial results)
 */
export function shouldAnnounce(result: DroneResult, options: AnnounceOptions): boolean {
  if (!options.skipTrivial) return true;

  // Always announce errors
  if (result.status === 'error' || result.status === 'timeout') {
    return true;
  }

  // Skip trivial success results
  const trivialPatterns = [
    /^(ok|done|completed?)$/i,
    /^task (completed?|finished)$/i,
    /^no (changes?|updates?|action) (needed|required)$/i,
  ];

  const resultText = result.result ?? '';
  return !trivialPatterns.some((p) => p.test(resultText.trim()));
}

// ============================================================================
// Spawn Options Builder
// ============================================================================

/**
 * Build a complete spawn configuration with wait/announce support
 */
export function buildSpawnConfig(options: SpawnWithWaitOptions) {
  const isFireAndForget = options.timeoutMs === 0;

  return {
    spawn: {
      persona: options.persona,
      task: options.task,
      prompt: options.prompt,
    },
    wait: isFireAndForget
      ? null
      : {
          timeoutMs: options.timeoutMs ?? 300000,
        },
    announce: options.announce ?? null,
    cleanup: options.cleanup ?? isFireAndForget,
    label: options.label ?? options.task.slice(0, 50),
  };
}

// ============================================================================
// Singleton
// ============================================================================

let globalDroneWaiter: DroneWaiter | null = null;

export function getDroneWaiter(): DroneWaiter {
  if (!globalDroneWaiter) {
    globalDroneWaiter = new DroneWaiter();
  }
  return globalDroneWaiter;
}

export function shutdownDroneWaiter(): void {
  if (globalDroneWaiter) {
    globalDroneWaiter.cancelAll();
    globalDroneWaiter = null;
  }
}
