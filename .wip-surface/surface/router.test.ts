/**
 * Surface Router Tests
 *
 * Tests for the Surface Router implementation.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import {
  SurfaceRouter,
  resetSurfaceRouter,
  getSurfaceRouter,
} from "../../../../src/surface/router.js"
import { BaseSurface } from "../../../../src/surface/surface.js"
import type {
  SurfaceCapabilities,
  SurfaceMessage,
  SurfaceResponse,
  PermissionRequest,
  PermissionResponse,
  StreamChunk,
} from "../../../../src/surface/types.js"

// =============================================================================
// Mock Surface Implementation
// =============================================================================

class MockSurface extends BaseSurface {
  readonly id: string
  readonly name: string
  readonly capabilities: SurfaceCapabilities

  sentResponses: SurfaceResponse[] = []
  sentStreamChunks: StreamChunk[] = []
  permissionRequests: PermissionRequest[] = []

  constructor(
    id: string,
    capabilities: Partial<SurfaceCapabilities> = {}
  ) {
    super()
    this.id = id
    this.name = `Mock ${id}`
    this.capabilities = {
      streaming: false,
      interactivePrompts: false,
      richText: false,
      media: false,
      threading: false,
      typingIndicators: false,
      reactions: false,
      messageEditing: false,
      maxMessageLength: 1000,
      supportedMediaTypes: [],
      ...capabilities,
    }
  }

  async connect(): Promise<void> {
    this.setState("connected")
  }

  async disconnect(): Promise<void> {
    this.setState("disconnected")
  }

  async sendResponse(response: SurfaceResponse): Promise<void> {
    this.sentResponses.push(response)
  }

  async sendStreamChunk(chunk: StreamChunk): Promise<void> {
    this.sentStreamChunks.push(chunk)
  }

  async requestPermission(request: PermissionRequest): Promise<PermissionResponse> {
    this.permissionRequests.push(request)
    return {
      requestId: request.id,
      action: "allow",
    }
  }
}

// =============================================================================
// Tests
// =============================================================================

describe("surface.router", () => {
  let router: SurfaceRouter

  beforeEach(() => {
    resetSurfaceRouter()
    router = getSurfaceRouter()
  })

  afterEach(async () => {
    await router.shutdown()
    resetSurfaceRouter()
  })

  test("registers and retrieves surfaces", async () => {
    const surface = new MockSurface("test")

    await router.registerSurface(surface)

    expect(router.getSurface("test")).toBe(surface)
    expect(router.getAllSurfaces()).toContain(surface)
  })

  test("unregisters surfaces", async () => {
    const surface = new MockSurface("test")

    await router.registerSurface(surface)
    await router.unregisterSurface("test")

    expect(router.getSurface("test")).toBeUndefined()
    expect(router.getAllSurfaces()).not.toContain(surface)
  })

  test("prevents duplicate surface registration", async () => {
    const surface1 = new MockSurface("test")
    const surface2 = new MockSurface("test")

    await router.registerSurface(surface1)

    expect(async () => {
      await router.registerSurface(surface2)
    }).toThrow()
  })

  test("connects surfaces on init", async () => {
    const surface = new MockSurface("test")

    await router.registerSurface(surface)
    await router.init()

    expect(surface.state).toBe("connected")
  })

  test("disconnects surfaces on shutdown", async () => {
    const surface = new MockSurface("test")

    await router.registerSurface(surface)
    await router.init()
    await router.shutdown()

    expect(surface.state).toBe("disconnected")
  })

  test("routes messages to handler", async () => {
    const surface = new MockSurface("test")
    const messages: SurfaceMessage[] = []

    router.setMessageHandler(async (message) => {
      messages.push(message)
      return { text: "Response" }
    })

    await router.registerSurface(surface)
    await router.init()

    // Emit a message event
    surface.emit({
      type: "message",
      message: {
        id: "1",
        senderId: "user1",
        body: "Hello",
        timestamp: Date.now(),
      },
    })

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(messages.length).toBe(1)
    expect(messages[0].body).toBe("Hello")
    expect(surface.sentResponses.length).toBe(1)
    expect(surface.sentResponses[0].text).toBe("Response")
  })

  test("tracks analytics events", async () => {
    const routerWithAnalytics = getSurfaceRouter({ enableAnalytics: true })
    const surface = new MockSurface("test")

    await routerWithAnalytics.registerSurface(surface)
    await routerWithAnalytics.init()

    const analytics = routerWithAnalytics.getAnalytics()
    expect(analytics.some((e) => e.eventType === "connect")).toBe(true)
  })

  test("collects session statistics", async () => {
    const surface = new MockSurface("test")

    router.setMessageHandler(async () => ({ text: "OK" }))

    await router.registerSurface(surface)
    await router.init()

    // Simulate some activity
    surface.emit({
      type: "message",
      message: {
        id: "1",
        senderId: "user1",
        body: "Hello",
        timestamp: Date.now(),
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 10))

    const stats = router.getSessionStats()
    expect(stats.activeSurfaces).toBe(1)
    expect(stats.totalSessions).toBeGreaterThan(0)
  })

  test("buffers streaming for non-streaming surfaces", async () => {
    const surface = new MockSurface("test", { streaming: false })

    router.setMessageHandler(async function* () {
      yield { type: "text", text: "Hello ", isFinal: false }
      yield { type: "text", text: "World", isFinal: true }
    })

    await router.registerSurface(surface)
    await router.init()

    surface.emit({
      type: "message",
      message: {
        id: "1",
        senderId: "user1",
        body: "Test",
        timestamp: Date.now(),
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 10))

    // Non-streaming surface should receive single complete response
    expect(surface.sentResponses.length).toBe(1)
  })

  test("streams to streaming-capable surfaces", async () => {
    const surface = new MockSurface("test", { streaming: true })

    router.setMessageHandler(async function* () {
      yield { type: "text", text: "Hello ", isFinal: false }
      yield { type: "text", text: "World", isFinal: true }
    })

    await router.registerSurface(surface)
    await router.init()

    surface.emit({
      type: "message",
      message: {
        id: "1",
        senderId: "user1",
        body: "Test",
        timestamp: Date.now(),
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 10))

    // Streaming surface should receive chunks
    expect(surface.sentStreamChunks.length).toBeGreaterThan(0)
  })
})
