import { Log } from "@/util/log"
import { Flag } from "@/flag/flag"
import { Bus } from "@/bus"
import { StreamEvents } from "./stream-events"
import { SessionStatus } from "./status"

const log = Log.create({ service: "stream.health" })

/**
 * Environment variable configuration for stream health thresholds.
 * These can be overridden via AGENT_CORE_STREAM_STALL_WARNING_MS and
 * AGENT_CORE_STREAM_STALL_TIMEOUT_MS environment variables.
 */
const DEFAULT_STALL_WARNING_MS = 15_000 // 15s without events = stall warning
const DEFAULT_STALL_TIMEOUT_MS = 60_000 // 60s without events = hard timeout
const DEFAULT_EARLY_STALL_MS = 5_000 // 5s without meaningful content = early warning

export type StreamStatus = "streaming" | "completed" | "error" | "stalled" | "timeout"

export interface StreamHealthReport {
  sessionID: string
  messageID: string
  status: StreamStatus
  timing: {
    startedAt: number
    lastEventAt: number
    completedAt?: number
    durationMs: number
    timeSinceLastEventMs: number
  }
  progress: {
    eventsReceived: number
    textDeltaEvents: number
    toolCallEvents: number
    bytesReceived: number
  }
  lastEventType?: string
  error?: string
  stallWarnings: number
}

/**
 * StreamHealthMonitor tracks the health and progress of an LLM stream.
 * It provides stall detection, progress tracking, and diagnostic reporting.
 */
export class StreamHealthMonitor {
  private sessionID: string
  private messageID: string
  private streamStartedAt: number
  private lastEventAt: number
  private lastEventType: string = ""
  private completedAt?: number

  // Progress tracking
  private eventsReceived: number = 0
  private textDeltaEvents: number = 0
  private toolCallEvents: number = 0
  private bytesReceived: number = 0

  // State
  private status: StreamStatus = "streaming"
  private errorMessage?: string
  private stallWarnings: number = 0

  // Stall detection
  private stallWarningMs: number
  private stallTimeoutMs: number
  private stallCheckTimer?: ReturnType<typeof setInterval>
  private stallWarningEmitted: boolean = false
  private earlyWarningEmitted: boolean = false

  constructor(input: { sessionID: string; messageID: string }) {
    this.sessionID = input.sessionID
    this.messageID = input.messageID
    this.streamStartedAt = Date.now()
    this.lastEventAt = Date.now()

    // Allow configuration via environment variables
    this.stallWarningMs =
      Flag.AGENT_CORE_STREAM_STALL_WARNING_MS ?? DEFAULT_STALL_WARNING_MS
    this.stallTimeoutMs =
      Flag.AGENT_CORE_STREAM_STALL_TIMEOUT_MS ?? DEFAULT_STALL_TIMEOUT_MS

    this.startStallDetection()
  }

  /**
   * Record that an event was received from the stream.
   */
  recordEvent(type: string, bytes?: number): void {
    this.lastEventAt = Date.now()
    this.lastEventType = type
    this.eventsReceived++

    if (bytes) {
      this.bytesReceived += bytes
    }

    // Track specific event types for more detailed metrics
    if (type === "text-delta") {
      this.textDeltaEvents++
    } else if (type === "tool-call" || type === "tool-result") {
      this.toolCallEvents++
    }

    // Reset stall warning state when we receive events
    // If we were stalled, immediately update status to clear the warning
    if (this.stallWarningEmitted) {
      SessionStatus.set(this.sessionID, {
        type: "busy",
        streamHealth: {
          isStalled: false,
          timeSinceLastEventMs: 0,
          eventsReceived: this.eventsReceived,
          stallWarnings: this.stallWarnings,
        },
      })
    }
    this.stallWarningEmitted = false
  }

  /**
   * Check if the stream has stalled (no events within threshold).
   * Returns true if stalled.
   */
  checkForStall(): boolean {
    if (this.status !== "streaming") {
      return false
    }

    const elapsed = Date.now() - this.lastEventAt

    // Check for hard timeout
    if (elapsed >= this.stallTimeoutMs) {
      this.status = "timeout"
      log.warn("stream timeout detected", {
        sessionID: this.sessionID,
        messageID: this.messageID,
        elapsedMs: elapsed,
        eventsReceived: this.eventsReceived,
        lastEventType: this.lastEventType,
      })

      // Emit timeout event so processor can abort the stream
      Bus.publish(StreamEvents.Timeout, {
        sessionID: this.sessionID,
        messageID: this.messageID,
        elapsed,
        eventsReceived: this.eventsReceived,
        lastEventType: this.lastEventType,
      })

      return true
    }

    // Check for early warning (no meaningful content after 5s)
    const elapsedSinceStart = Date.now() - this.streamStartedAt
    const hasNoContent = this.textDeltaEvents === 0 && this.toolCallEvents === 0
    if (
      elapsedSinceStart >= DEFAULT_EARLY_STALL_MS &&
      hasNoContent &&
      !this.earlyWarningEmitted
    ) {
      this.earlyWarningEmitted = true
      log.warn("stream slow start detected - no content received", {
        sessionID: this.sessionID,
        messageID: this.messageID,
        elapsedSinceStartMs: elapsedSinceStart,
        eventsReceived: this.eventsReceived,
        lastEventType: this.lastEventType,
      })

      // Update session status with early warning
      SessionStatus.set(this.sessionID, {
        type: "busy",
        streamHealth: {
          isStalled: false, // Not stalled yet, just slow
          timeSinceLastEventMs: elapsed,
          eventsReceived: this.eventsReceived,
          stallWarnings: this.stallWarnings,
        },
      })
    }

    // Check for stall warning
    if (elapsed >= this.stallWarningMs && !this.stallWarningEmitted) {
      this.stallWarnings++
      this.stallWarningEmitted = true

      log.warn("stream stall detected", {
        sessionID: this.sessionID,
        messageID: this.messageID,
        elapsedMs: elapsed,
        eventsReceived: this.eventsReceived,
        lastEventType: this.lastEventType,
      })

      Bus.publish(StreamEvents.StallWarning, {
        sessionID: this.sessionID,
        messageID: this.messageID,
        elapsed,
        eventsReceived: this.eventsReceived,
        lastEventType: this.lastEventType,
      })

      // Update session status with stream health warning
      SessionStatus.set(this.sessionID, {
        type: "busy",
        streamHealth: {
          isStalled: true,
          timeSinceLastEventMs: elapsed,
          eventsReceived: this.eventsReceived,
          stallWarnings: this.stallWarnings,
        },
      })

      return true
    }

    // Update session status with healthy stream info periodically
    // Only if we haven't emitted a stall warning
    if (this.eventsReceived > 0 && this.eventsReceived % 50 === 0) {
      SessionStatus.set(this.sessionID, {
        type: "busy",
        streamHealth: {
          isStalled: false,
          timeSinceLastEventMs: elapsed,
          eventsReceived: this.eventsReceived,
          stallWarnings: this.stallWarnings,
        },
      })
    }

    return false
  }

  /**
   * Mark the stream as completed successfully.
   */
  complete(): void {
    this.status = "completed"
    this.completedAt = Date.now()
    this.stopStallDetection()

    const report = this.getReport()

    // Detect suspicious completions (empty or near-empty responses)
    const isSuspicious =
      report.progress.eventsReceived < 5 || // Very few events
      (report.progress.textDeltaEvents === 0 && report.progress.toolCallEvents === 0) // No content

    if (isSuspicious) {
      log.warn("stream completed with suspicious metrics", {
        sessionID: this.sessionID,
        durationMs: report.timing.durationMs,
        eventsReceived: report.progress.eventsReceived,
        textDeltaEvents: report.progress.textDeltaEvents,
        toolCallEvents: report.progress.toolCallEvents,
      })
    } else {
      log.info("stream completed", {
        sessionID: this.sessionID,
        durationMs: report.timing.durationMs,
        eventsReceived: report.progress.eventsReceived,
      })
    }

    Bus.publish(StreamEvents.Completed, {
      sessionID: this.sessionID,
      messageID: this.messageID,
      report,
    })
  }

  /**
   * Mark the stream as failed with an error.
   */
  fail(error: Error | string): void {
    this.status = "error"
    this.errorMessage = error instanceof Error ? error.message : error
    this.completedAt = Date.now()
    this.stopStallDetection()

    const report = this.getReport()
    log.error("stream failed", {
      sessionID: this.sessionID,
      error: this.errorMessage,
      durationMs: report.timing.durationMs,
      eventsReceived: report.progress.eventsReceived,
    })

    Bus.publish(StreamEvents.Failed, {
      sessionID: this.sessionID,
      messageID: this.messageID,
      report,
      error: this.errorMessage,
    })
  }

  /**
   * Get the current stream health report.
   */
  getReport(): StreamHealthReport {
    const now = Date.now()
    const completedAt = this.completedAt ?? now
    const durationMs = completedAt - this.streamStartedAt
    const timeSinceLastEventMs = now - this.lastEventAt

    return {
      sessionID: this.sessionID,
      messageID: this.messageID,
      status: this.status,
      timing: {
        startedAt: this.streamStartedAt,
        lastEventAt: this.lastEventAt,
        completedAt: this.completedAt,
        durationMs,
        timeSinceLastEventMs,
      },
      progress: {
        eventsReceived: this.eventsReceived,
        textDeltaEvents: this.textDeltaEvents,
        toolCallEvents: this.toolCallEvents,
        bytesReceived: this.bytesReceived,
      },
      lastEventType: this.lastEventType || undefined,
      error: this.errorMessage,
      stallWarnings: this.stallWarnings,
    }
  }

  /**
   * Get current timing information for status display.
   */
  getTimingInfo(): { durationMs: number; timeSinceLastEventMs: number; eventsPerSecond: number } {
    const now = Date.now()
    const durationMs = now - this.streamStartedAt
    const timeSinceLastEventMs = now - this.lastEventAt
    const eventsPerSecond = durationMs > 0 ? (this.eventsReceived / durationMs) * 1000 : 0

    return {
      durationMs,
      timeSinceLastEventMs,
      eventsPerSecond,
    }
  }

  /**
   * Check if the stream is currently stalled (warning threshold exceeded).
   */
  isStalled(): boolean {
    if (this.status !== "streaming") {
      return false
    }
    return Date.now() - this.lastEventAt >= this.stallWarningMs
  }

  /**
   * Get the current status.
   */
  getStatus(): StreamStatus {
    return this.status
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.stopStallDetection()
  }

  private startStallDetection(): void {
    // Check for stalls every 2 seconds
    this.stallCheckTimer = setInterval(() => {
      this.checkForStall()
    }, 2000)
  }

  private stopStallDetection(): void {
    if (this.stallCheckTimer) {
      clearInterval(this.stallCheckTimer)
      this.stallCheckTimer = undefined
    }
  }
}

/**
 * Instance state for tracking active stream health monitors per session.
 */
const activeMonitors = new Map<string, StreamHealthMonitor>()

export namespace StreamHealth {
  /**
   * Get or create a health monitor for a session.
   */
  export function getOrCreate(input: { sessionID: string; messageID: string }): StreamHealthMonitor {
    const key = `${input.sessionID}:${input.messageID}`
    let monitor = activeMonitors.get(key)
    if (!monitor) {
      monitor = new StreamHealthMonitor(input)
      activeMonitors.set(key, monitor)
    }
    return monitor
  }

  /**
   * Get an existing health monitor for a session.
   */
  export function get(sessionID: string, messageID: string): StreamHealthMonitor | undefined {
    return activeMonitors.get(`${sessionID}:${messageID}`)
  }

  /**
   * Get the most recent active monitor for a session (by any message).
   */
  export function getActive(sessionID: string): StreamHealthMonitor | undefined {
    for (const [key, monitor] of activeMonitors) {
      if (key.startsWith(`${sessionID}:`) && monitor.getStatus() === "streaming") {
        return monitor
      }
    }
    return undefined
  }

  /**
   * Remove a health monitor.
   */
  export function remove(sessionID: string, messageID: string): void {
    const key = `${sessionID}:${messageID}`
    const monitor = activeMonitors.get(key)
    if (monitor) {
      monitor.dispose()
      activeMonitors.delete(key)
    }
  }

  /**
   * Clear all monitors.
   */
  export function clear(): void {
    for (const monitor of activeMonitors.values()) {
      monitor.dispose()
    }
    activeMonitors.clear()
  }

  /**
   * Configuration thresholds.
   */
  export const thresholds = {
    get stallWarningMs() {
      return Flag.AGENT_CORE_STREAM_STALL_WARNING_MS ?? DEFAULT_STALL_WARNING_MS
    },
    get stallTimeoutMs() {
      return Flag.AGENT_CORE_STREAM_STALL_TIMEOUT_MS ?? DEFAULT_STALL_TIMEOUT_MS
    },
  }
}
