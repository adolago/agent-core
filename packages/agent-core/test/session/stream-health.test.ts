import { describe, expect, test, beforeEach, afterEach, mock, spyOn } from "bun:test"
import { StreamHealthMonitor, StreamHealth } from "../../src/session/stream-health"
import { Bus } from "../../src/bus"
import { StreamEvents } from "../../src/session/stream-events"

// Mock the Instance module to avoid initialization issues
mock.module("../../src/project/instance", () => ({
  Instance: {
    state: <T>(init: () => T) => {
      const value = init()
      return () => value
    },
    directory: "/test",
  },
}))

// Mock SessionStatus to avoid side effects
mock.module("../../src/session/status", () => ({
  SessionStatus: {
    set: () => {},
    get: () => ({ type: "idle" }),
  },
}))

describe("StreamHealthMonitor", () => {
  let monitor: StreamHealthMonitor

  beforeEach(() => {
    // Clear any existing monitors
    StreamHealth.clear()
  })

  afterEach(() => {
    // Clean up
    if (monitor) {
      monitor.dispose()
    }
    StreamHealth.clear()
  })

  describe("initialization", () => {
    test("creates monitor with correct initial state", () => {
      monitor = new StreamHealthMonitor({
        sessionID: "test-session",
        messageID: "test-message",
      })

      const report = monitor.getReport()
      expect(report.sessionID).toBe("test-session")
      expect(report.messageID).toBe("test-message")
      expect(report.status).toBe("streaming")
      expect(report.progress.eventsReceived).toBe(0)
      expect(report.stallWarnings).toBe(0)
    })

    test("sets timing.startedAt to current time", () => {
      const before = Date.now()
      monitor = new StreamHealthMonitor({
        sessionID: "test-session",
        messageID: "test-message",
      })
      const after = Date.now()

      const report = monitor.getReport()
      expect(report.timing.startedAt).toBeGreaterThanOrEqual(before)
      expect(report.timing.startedAt).toBeLessThanOrEqual(after)
    })
  })

  describe("recordEvent", () => {
    test("increments eventsReceived counter", () => {
      monitor = new StreamHealthMonitor({
        sessionID: "test-session",
        messageID: "test-message",
      })

      monitor.recordEvent("text-delta")
      monitor.recordEvent("text-delta")
      monitor.recordEvent("tool-call")

      const report = monitor.getReport()
      expect(report.progress.eventsReceived).toBe(3)
    })

    test("tracks text-delta events separately", () => {
      monitor = new StreamHealthMonitor({
        sessionID: "test-session",
        messageID: "test-message",
      })

      monitor.recordEvent("text-delta")
      monitor.recordEvent("text-delta")
      monitor.recordEvent("start")

      const report = monitor.getReport()
      expect(report.progress.textDeltaEvents).toBe(2)
    })

    test("tracks tool-call and tool-result events", () => {
      monitor = new StreamHealthMonitor({
        sessionID: "test-session",
        messageID: "test-message",
      })

      monitor.recordEvent("tool-call")
      monitor.recordEvent("tool-result")
      monitor.recordEvent("tool-call")

      const report = monitor.getReport()
      expect(report.progress.toolCallEvents).toBe(3)
    })

    test("tracks bytes when provided", () => {
      monitor = new StreamHealthMonitor({
        sessionID: "test-session",
        messageID: "test-message",
      })

      monitor.recordEvent("text-delta", 100)
      monitor.recordEvent("text-delta", 200)

      const report = monitor.getReport()
      expect(report.progress.bytesReceived).toBe(300)
    })

    test("updates lastEventType", () => {
      monitor = new StreamHealthMonitor({
        sessionID: "test-session",
        messageID: "test-message",
      })

      monitor.recordEvent("start")
      expect(monitor.getReport().lastEventType).toBe("start")

      monitor.recordEvent("text-delta")
      expect(monitor.getReport().lastEventType).toBe("text-delta")

      monitor.recordEvent("finish")
      expect(monitor.getReport().lastEventType).toBe("finish")
    })

    test("updates lastEventAt timestamp", async () => {
      monitor = new StreamHealthMonitor({
        sessionID: "test-session",
        messageID: "test-message",
      })

      const initialTime = monitor.getReport().timing.lastEventAt
      await Bun.sleep(10)
      monitor.recordEvent("text-delta")

      expect(monitor.getReport().timing.lastEventAt).toBeGreaterThan(initialTime)
    })
  })

  describe("complete", () => {
    test("sets status to completed", () => {
      monitor = new StreamHealthMonitor({
        sessionID: "test-session",
        messageID: "test-message",
      })

      monitor.complete()

      expect(monitor.getStatus()).toBe("completed")
      expect(monitor.getReport().status).toBe("completed")
    })

    test("sets completedAt timestamp", () => {
      monitor = new StreamHealthMonitor({
        sessionID: "test-session",
        messageID: "test-message",
      })

      const before = Date.now()
      monitor.complete()
      const after = Date.now()

      const report = monitor.getReport()
      expect(report.timing.completedAt).toBeDefined()
      expect(report.timing.completedAt).toBeGreaterThanOrEqual(before)
      expect(report.timing.completedAt).toBeLessThanOrEqual(after)
    })

    test("calculates correct duration", async () => {
      monitor = new StreamHealthMonitor({
        sessionID: "test-session",
        messageID: "test-message",
      })

      await Bun.sleep(50)
      monitor.complete()

      const report = monitor.getReport()
      expect(report.timing.durationMs).toBeGreaterThanOrEqual(50)
      expect(report.timing.durationMs).toBeLessThan(200)
    })
  })

  describe("fail", () => {
    test("sets status to error", () => {
      monitor = new StreamHealthMonitor({
        sessionID: "test-session",
        messageID: "test-message",
      })

      monitor.fail("Something went wrong")

      expect(monitor.getStatus()).toBe("error")
      expect(monitor.getReport().status).toBe("error")
    })

    test("stores error message from string", () => {
      monitor = new StreamHealthMonitor({
        sessionID: "test-session",
        messageID: "test-message",
      })

      monitor.fail("Network timeout")

      expect(monitor.getReport().error).toBe("Network timeout")
    })

    test("extracts message from Error object", () => {
      monitor = new StreamHealthMonitor({
        sessionID: "test-session",
        messageID: "test-message",
      })

      monitor.fail(new Error("Connection refused"))

      expect(monitor.getReport().error).toBe("Connection refused")
    })
  })

  describe("stall detection", () => {
    test("isStalled returns false when events are recent", () => {
      monitor = new StreamHealthMonitor({
        sessionID: "test-session",
        messageID: "test-message",
      })

      monitor.recordEvent("text-delta")
      expect(monitor.isStalled()).toBe(false)
    })

    test("checkForStall returns false for completed streams", () => {
      monitor = new StreamHealthMonitor({
        sessionID: "test-session",
        messageID: "test-message",
      })

      monitor.complete()
      expect(monitor.checkForStall()).toBe(false)
    })

    test("checkForStall returns false for errored streams", () => {
      monitor = new StreamHealthMonitor({
        sessionID: "test-session",
        messageID: "test-message",
      })

      monitor.fail("error")
      expect(monitor.checkForStall()).toBe(false)
    })
  })

  describe("getTimingInfo", () => {
    test("calculates eventsPerSecond", async () => {
      monitor = new StreamHealthMonitor({
        sessionID: "test-session",
        messageID: "test-message",
      })

      // Record 10 events
      for (let i = 0; i < 10; i++) {
        monitor.recordEvent("text-delta")
      }

      await Bun.sleep(100)
      const timing = monitor.getTimingInfo()

      expect(timing.eventsPerSecond).toBeGreaterThan(0)
      expect(timing.durationMs).toBeGreaterThanOrEqual(100)
    })

    test("timeSinceLastEventMs increases over time", async () => {
      monitor = new StreamHealthMonitor({
        sessionID: "test-session",
        messageID: "test-message",
      })

      monitor.recordEvent("start")
      const initial = monitor.getTimingInfo().timeSinceLastEventMs

      await Bun.sleep(50)
      const later = monitor.getTimingInfo().timeSinceLastEventMs

      expect(later).toBeGreaterThan(initial)
    })
  })

  describe("dispose", () => {
    test("stops stall detection timer", () => {
      monitor = new StreamHealthMonitor({
        sessionID: "test-session",
        messageID: "test-message",
      })

      // Should not throw
      monitor.dispose()
      monitor.dispose() // Double dispose should be safe
    })
  })
})

describe("StreamHealth namespace", () => {
  beforeEach(() => {
    StreamHealth.clear()
  })

  afterEach(() => {
    StreamHealth.clear()
  })

  describe("getOrCreate", () => {
    test("creates new monitor if none exists", () => {
      const monitor = StreamHealth.getOrCreate({
        sessionID: "session-1",
        messageID: "message-1",
      })

      expect(monitor).toBeInstanceOf(StreamHealthMonitor)
      expect(monitor.getReport().sessionID).toBe("session-1")
    })

    test("returns existing monitor if already created", () => {
      const first = StreamHealth.getOrCreate({
        sessionID: "session-1",
        messageID: "message-1",
      })

      const second = StreamHealth.getOrCreate({
        sessionID: "session-1",
        messageID: "message-1",
      })

      expect(first).toBe(second)
    })

    test("creates separate monitors for different sessions", () => {
      const monitor1 = StreamHealth.getOrCreate({
        sessionID: "session-1",
        messageID: "message-1",
      })

      const monitor2 = StreamHealth.getOrCreate({
        sessionID: "session-2",
        messageID: "message-2",
      })

      expect(monitor1).not.toBe(monitor2)
    })
  })

  describe("get", () => {
    test("returns undefined if monitor does not exist", () => {
      const monitor = StreamHealth.get("nonexistent", "message")
      expect(monitor).toBeUndefined()
    })

    test("returns monitor if it exists", () => {
      StreamHealth.getOrCreate({
        sessionID: "session-1",
        messageID: "message-1",
      })

      const monitor = StreamHealth.get("session-1", "message-1")
      expect(monitor).toBeDefined()
      expect(monitor!.getReport().sessionID).toBe("session-1")
    })
  })

  describe("getActive", () => {
    test("returns undefined if no active monitors", () => {
      const monitor = StreamHealth.getActive("session-1")
      expect(monitor).toBeUndefined()
    })

    test("returns streaming monitor for session", () => {
      StreamHealth.getOrCreate({
        sessionID: "session-1",
        messageID: "message-1",
      })

      const active = StreamHealth.getActive("session-1")
      expect(active).toBeDefined()
      expect(active!.getStatus()).toBe("streaming")
    })

    test("returns undefined if monitor is completed", () => {
      const monitor = StreamHealth.getOrCreate({
        sessionID: "session-1",
        messageID: "message-1",
      })
      monitor.complete()

      const active = StreamHealth.getActive("session-1")
      expect(active).toBeUndefined()
    })
  })

  describe("remove", () => {
    test("removes monitor and disposes it", () => {
      StreamHealth.getOrCreate({
        sessionID: "session-1",
        messageID: "message-1",
      })

      StreamHealth.remove("session-1", "message-1")

      expect(StreamHealth.get("session-1", "message-1")).toBeUndefined()
    })

    test("handles removing nonexistent monitor gracefully", () => {
      // Should not throw
      StreamHealth.remove("nonexistent", "message")
    })
  })

  describe("clear", () => {
    test("removes all monitors", () => {
      StreamHealth.getOrCreate({ sessionID: "s1", messageID: "m1" })
      StreamHealth.getOrCreate({ sessionID: "s2", messageID: "m2" })
      StreamHealth.getOrCreate({ sessionID: "s3", messageID: "m3" })

      StreamHealth.clear()

      expect(StreamHealth.get("s1", "m1")).toBeUndefined()
      expect(StreamHealth.get("s2", "m2")).toBeUndefined()
      expect(StreamHealth.get("s3", "m3")).toBeUndefined()
    })
  })

  describe("thresholds", () => {
    test("returns default stall warning threshold", () => {
      expect(StreamHealth.thresholds.stallWarningMs).toBe(15_000)
    })

    test("returns default stall timeout threshold", () => {
      expect(StreamHealth.thresholds.stallTimeoutMs).toBe(60_000)
    })
  })
})

describe("StreamHealthReport structure", () => {
  test("report contains all required fields", () => {
    const monitor = StreamHealth.getOrCreate({
      sessionID: "test-session",
      messageID: "test-message",
    })

    monitor.recordEvent("start")
    monitor.recordEvent("text-delta", 100)
    monitor.recordEvent("tool-call")

    const report = monitor.getReport()

    // Check structure
    expect(report).toHaveProperty("sessionID")
    expect(report).toHaveProperty("messageID")
    expect(report).toHaveProperty("status")
    expect(report).toHaveProperty("timing")
    expect(report).toHaveProperty("progress")
    expect(report).toHaveProperty("stallWarnings")

    // Check timing
    expect(report.timing).toHaveProperty("startedAt")
    expect(report.timing).toHaveProperty("lastEventAt")
    expect(report.timing).toHaveProperty("durationMs")
    expect(report.timing).toHaveProperty("timeSinceLastEventMs")

    // Check progress
    expect(report.progress).toHaveProperty("eventsReceived")
    expect(report.progress).toHaveProperty("textDeltaEvents")
    expect(report.progress).toHaveProperty("toolCallEvents")
    expect(report.progress).toHaveProperty("bytesReceived")

    // Check values
    expect(report.progress.eventsReceived).toBe(3)
    expect(report.progress.textDeltaEvents).toBe(1)
    expect(report.progress.toolCallEvents).toBe(1)
    expect(report.progress.bytesReceived).toBe(100)

    StreamHealth.clear()
  })
})
