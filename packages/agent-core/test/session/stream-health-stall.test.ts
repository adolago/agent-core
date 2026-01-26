import { describe, expect, test, beforeEach, afterEach, mock, spyOn } from "bun:test"
import { Bus } from "../../src/bus"
import { StreamEvents } from "../../src/session/stream-events"
import { StreamHealthMonitor, StreamHealth } from "../../src/session/stream-health"

// Store captured events for verification
const capturedEvents: { type: string; properties: unknown }[] = []
let unsubscribe: (() => void) | null = null

// Mock the Instance module
mock.module("../../src/project/instance", () => ({
  Instance: {
    state: <T>(init: () => T) => {
      const value = init()
      return () => value
    },
    directory: "/test",
  },
}))

// Mock SessionStatus
mock.module("../../src/session/status", () => ({
  SessionStatus: {
    set: () => {},
    get: () => ({ type: "idle" }),
  },
}))

describe("StreamHealth stall detection with timing", () => {
  beforeEach(() => {
    StreamHealth.clear()
    capturedEvents.length = 0

    // Subscribe to stall warning events
    unsubscribe = Bus.subscribe(StreamEvents.StallWarning, (event) => {
      capturedEvents.push(event)
    })
  })

  afterEach(() => {
    StreamHealth.clear()
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  })

  test("isStalled returns false immediately after event", () => {
    const monitor = StreamHealth.getOrCreate({
      sessionID: "stall-test",
      messageID: "msg-1",
    })

    monitor.recordEvent("start")

    // Immediately after recording, should not be stalled
    expect(monitor.isStalled()).toBe(false)
    expect(monitor.getReport().stallWarnings).toBe(0)

    monitor.dispose()
  })

  test("records events prevent stall detection", async () => {
    const monitor = StreamHealth.getOrCreate({
      sessionID: "no-stall-test",
      messageID: "msg-2",
    })

    // Continuously record events
    const interval = setInterval(() => {
      monitor.recordEvent("text-delta")
    }, 50)

    await Bun.sleep(500)
    clearInterval(interval)

    // Should not be stalled because we kept recording events
    expect(monitor.isStalled()).toBe(false)
    expect(monitor.getReport().stallWarnings).toBe(0)

    monitor.dispose()
  })

  test("checkForStall returns false when under threshold", async () => {
    const monitor = StreamHealth.getOrCreate({
      sessionID: "counter-test",
      messageID: "msg-3",
    })

    monitor.recordEvent("start")
    expect(monitor.getReport().stallWarnings).toBe(0)

    // Wait a short time (well under 15s threshold)
    await Bun.sleep(100)
    const result = monitor.checkForStall()

    // Should not be stalled yet
    expect(result).toBe(false)
    expect(monitor.getReport().stallWarnings).toBe(0)

    monitor.dispose()
  })

  test("recording events resets timing", async () => {
    const monitor = StreamHealth.getOrCreate({
      sessionID: "reset-test",
      messageID: "msg-4",
    })

    monitor.recordEvent("start")
    await Bun.sleep(100)

    const timing1 = monitor.getTimingInfo()
    expect(timing1.timeSinceLastEventMs).toBeGreaterThanOrEqual(90)

    // Record another event - should reset timeSinceLastEvent
    monitor.recordEvent("text-delta")
    const timing2 = monitor.getTimingInfo()

    expect(timing2.timeSinceLastEventMs).toBeLessThan(50) // Should be nearly 0

    monitor.dispose()
  })

  test("completed stream does not trigger stall", async () => {
    const monitor = StreamHealth.getOrCreate({
      sessionID: "completed-test",
      messageID: "msg-5",
    })

    monitor.recordEvent("start")
    monitor.complete()

    // Wait a bit
    await Bun.sleep(100)

    // Should not detect stall because stream is completed
    expect(monitor.checkForStall()).toBe(false)
    expect(monitor.getStatus()).toBe("completed")

    monitor.dispose()
  })

  test("failed stream does not trigger stall", async () => {
    const monitor = StreamHealth.getOrCreate({
      sessionID: "failed-test",
      messageID: "msg-6",
    })

    monitor.recordEvent("start")
    monitor.fail("Test error")

    // Wait a bit
    await Bun.sleep(100)

    // Should not detect stall because stream failed
    expect(monitor.checkForStall()).toBe(false)
    expect(monitor.getStatus()).toBe("error")

    monitor.dispose()
  })

  test("getTimingInfo tracks time accurately", async () => {
    const monitor = StreamHealth.getOrCreate({
      sessionID: "timing-test",
      messageID: "msg-7",
    })

    monitor.recordEvent("start")
    const timing1 = monitor.getTimingInfo()

    await Bun.sleep(100)

    const timing2 = monitor.getTimingInfo()

    // Duration should increase
    expect(timing2.durationMs).toBeGreaterThan(timing1.durationMs)
    expect(timing2.durationMs - timing1.durationMs).toBeGreaterThanOrEqual(90)

    // Time since last event should also increase
    expect(timing2.timeSinceLastEventMs).toBeGreaterThan(timing1.timeSinceLastEventMs)

    monitor.dispose()
  })

  test("events per second calculation", async () => {
    const monitor = StreamHealth.getOrCreate({
      sessionID: "eps-test",
      messageID: "msg-8",
    })

    // Record 20 events quickly
    for (let i = 0; i < 20; i++) {
      monitor.recordEvent("text-delta")
    }

    await Bun.sleep(100)

    const timing = monitor.getTimingInfo()

    // Should have a high events per second rate
    expect(timing.eventsPerSecond).toBeGreaterThan(50) // 20 events in ~100ms = ~200/s

    monitor.dispose()
  })

  test("stall thresholds are exposed", () => {
    // Verify defaults (without env overrides)
    expect(StreamHealth.thresholds.stallWarningMs).toBe(15_000)
    expect(StreamHealth.thresholds.stallTimeoutMs).toBe(60_000)
  })
})

describe("StreamHealth report generation", () => {
  beforeEach(() => {
    StreamHealth.clear()
  })

  afterEach(() => {
    StreamHealth.clear()
  })

  test("report includes all timing information", () => {
    const monitor = StreamHealth.getOrCreate({
      sessionID: "report-test",
      messageID: "msg-9",
    })

    monitor.recordEvent("start")
    monitor.recordEvent("text-delta", 150)
    monitor.recordEvent("tool-call")
    monitor.complete()

    const report = monitor.getReport()

    // Verify structure
    expect(report.timing.startedAt).toBeTypeOf("number")
    expect(report.timing.lastEventAt).toBeTypeOf("number")
    expect(report.timing.completedAt).toBeTypeOf("number")
    expect(report.timing.durationMs).toBeTypeOf("number")
    expect(report.timing.timeSinceLastEventMs).toBeTypeOf("number")

    // Verify ordering
    expect(report.timing.lastEventAt).toBeGreaterThanOrEqual(report.timing.startedAt)
    expect(report.timing.completedAt).toBeGreaterThanOrEqual(report.timing.lastEventAt)

    monitor.dispose()
  })

  test("report includes accurate progress counters", () => {
    const monitor = StreamHealth.getOrCreate({
      sessionID: "progress-test",
      messageID: "msg-10",
    })

    // Simulate a realistic stream
    monitor.recordEvent("start")
    monitor.recordEvent("text-delta", 50)
    monitor.recordEvent("text-delta", 75)
    monitor.recordEvent("text-delta", 100)
    monitor.recordEvent("tool-call")
    monitor.recordEvent("tool-result")
    monitor.recordEvent("text-delta", 25)
    monitor.recordEvent("finish")

    const report = monitor.getReport()

    expect(report.progress.eventsReceived).toBe(8)
    expect(report.progress.textDeltaEvents).toBe(4)
    expect(report.progress.toolCallEvents).toBe(2) // tool-call + tool-result
    expect(report.progress.bytesReceived).toBe(250) // 50 + 75 + 100 + 25

    monitor.dispose()
  })
})
