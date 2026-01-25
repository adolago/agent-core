import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import {
  EventBus,
  createEventBus,
  InMemoryEventStore,
  createEventStore,
  AgentStateProjection,
  TaskHistoryProjection,
  MemoryIndexProjection,
  createAgentSpawnedEvent,
  createAgentStartedEvent,
  createAgentStoppedEvent,
  createAgentTaskAssignedEvent,
  createAgentTaskCompletedEvent,
  createTaskCreatedEvent,
  createTaskStartedEvent,
  createTaskCompletedEvent,
  createTaskFailedEvent,
  createMemoryStoredEvent,
  createMemoryRetrievedEvent,
  createMemoryDeletedEvent,
  EventPriority,
  SystemEventTypes,
} from "../index.js";

describe("events module", () => {
  describe("EventBus", () => {
    let bus: EventBus;

    beforeEach(() => {
      bus = new EventBus();
    });

    it("emits and receives events", () => {
      const handler = jest.fn();
      bus.on("test:event", handler);

      bus.emit("test:event", { data: "hello" });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "test:event",
          payload: { data: "hello" },
        })
      );
    });

    it("supports wildcard subscriptions", () => {
      const handler = jest.fn();
      bus.subscribe({ types: ["agent:*"] }, handler);

      bus.emit("agent:spawned", { agentId: "1" });
      bus.emit("agent:started", { agentId: "1" });
      bus.emit("task:created", { taskId: "1" });

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("supports subscription pause/resume", () => {
      const handler = jest.fn();
      const subscription = bus.subscribe({ types: ["test:*"] }, handler);

      bus.emit("test:event", {});
      expect(handler).toHaveBeenCalledTimes(1);

      subscription.pause();
      bus.emit("test:event", {});
      expect(handler).toHaveBeenCalledTimes(1);

      subscription.resume();
      bus.emit("test:event", {});
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("maintains event history", () => {
      bus.emit("event:1", { n: 1 });
      bus.emit("event:2", { n: 2 });
      bus.emit("event:3", { n: 3 });

      const history = bus.getHistory();
      expect(history).toHaveLength(3);
      expect(history[0]!.type).toBe("event:1");
    });

    it("filters history by type", () => {
      bus.emit("agent:spawned", {});
      bus.emit("task:created", {});
      bus.emit("agent:started", {});

      const agentHistory = bus.getHistory({ types: ["agent:*"] });
      expect(agentHistory).toHaveLength(2);
    });

    it("handles once subscriptions", () => {
      const handler = jest.fn();
      bus.once("test:event", handler);

      bus.emit("test:event", {});
      bus.emit("test:event", {});

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("emits events with metadata", () => {
      const handler = jest.fn();
      bus.on("test:event", handler);

      bus.emit("test:event", { data: 1 }, {
        source: "my-source",
        priority: EventPriority.High,
        correlationId: "corr-123",
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "my-source",
          priority: EventPriority.High,
          correlationId: "corr-123",
        })
      );
    });

    it("supports async emit", async () => {
      const results: number[] = [];
      bus.on("async:event", async () => {
        await new Promise((r) => setTimeout(r, 10));
        results.push(1);
      });
      bus.on("async:event", async () => {
        results.push(2);
      });

      await bus.emitAsync("async:event", {});

      expect(results).toContain(1);
      expect(results).toContain(2);
    });
  });

  describe("InMemoryEventStore", () => {
    let store: InMemoryEventStore;

    beforeEach(() => {
      store = new InMemoryEventStore();
    });

    it("appends and retrieves events", async () => {
      const event = createAgentSpawnedEvent("agent-1", "coder", "core", ["coding"]);
      await store.append(event);

      const events = await store.getEvents("agent-1");
      expect(events).toHaveLength(1);
      expect(events[0]!.payload.agentId).toBe("agent-1");
    });

    it("assigns incremental versions", async () => {
      const event1 = createAgentSpawnedEvent("agent-1", "coder", "core", []);
      const event2 = createAgentStartedEvent("agent-1");

      await store.append(event1);
      await store.append(event2);

      const events = await store.getEvents("agent-1");
      expect(events[0]!.version).toBe(1);
      expect(events[1]!.version).toBe(2);
    });

    it("queries by event type", async () => {
      await store.append(createAgentSpawnedEvent("agent-1", "coder", "core", []));
      await store.append(createTaskCreatedEvent("task-1", "code", "Test task", "high"));
      await store.append(createAgentSpawnedEvent("agent-2", "reviewer", "core", []));

      const agentEvents = await store.getEventsByType(SystemEventTypes.AGENT_SPAWNED);
      expect(agentEvents).toHaveLength(2);
    });

    it("supports complex queries", async () => {
      await store.append(createAgentSpawnedEvent("agent-1", "coder", "core", []));
      await store.append(createAgentSpawnedEvent("agent-2", "reviewer", "core", []));
      await store.append(createTaskCreatedEvent("task-1", "code", "Task", "high"));

      const results = await store.query({
        aggregateTypes: ["agent"],
        limit: 1,
      });

      expect(results).toHaveLength(1);
    });

    it("replays events as async iterable", async () => {
      await store.append(createAgentSpawnedEvent("agent-1", "coder", "core", []));
      await store.append(createAgentStartedEvent("agent-1"));
      await store.append(createTaskCreatedEvent("task-1", "code", "Task", "high"));

      const events: unknown[] = [];
      for await (const event of store.replay()) {
        events.push(event);
      }

      expect(events).toHaveLength(3);
    });

    it("manages snapshots", async () => {
      await store.saveSnapshot({
        aggregateId: "agent-1",
        aggregateType: "agent",
        version: 10,
        state: { status: "active", taskCount: 5 },
        timestamp: Date.now(),
      });

      const snapshot = await store.getSnapshot("agent-1");
      expect(snapshot).not.toBeNull();
      expect(snapshot!.version).toBe(10);
      expect(snapshot!.state.taskCount).toBe(5);
    });

    it("emits snapshot recommended event", async () => {
      const store = new InMemoryEventStore({ snapshotThreshold: 2 });
      const handler = jest.fn();
      store.on("snapshot:recommended", handler);

      await store.append(createAgentSpawnedEvent("agent-1", "coder", "core", []));
      await store.append(createAgentStartedEvent("agent-1"));

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          aggregateId: "agent-1",
          version: 2,
        })
      );
    });

    it("provides statistics", async () => {
      await store.append(createAgentSpawnedEvent("agent-1", "coder", "core", []));
      await store.append(createTaskCreatedEvent("task-1", "code", "Task", "high"));

      const stats = await store.getStats();
      expect(stats.totalEvents).toBe(2);
      expect(stats.eventsByType[SystemEventTypes.AGENT_SPAWNED]).toBe(1);
      expect(stats.eventsByType[SystemEventTypes.TASK_CREATED]).toBe(1);
    });
  });

  describe("Domain Events", () => {
    it("creates agent spawned event", () => {
      const event = createAgentSpawnedEvent("agent-1", "coder", "core", ["code-generation"]);

      expect(event.type).toBe(SystemEventTypes.AGENT_SPAWNED);
      expect(event.aggregateId).toBe("agent-1");
      expect(event.aggregateType).toBe("agent");
      expect(event.payload.role).toBe("coder");
      expect(event.payload.capabilities).toContain("code-generation");
    });

    it("creates task created event", () => {
      const event = createTaskCreatedEvent("task-1", "code", "Implement feature", "high", {
        description: "Full implementation",
        dependencies: ["task-0"],
      });

      expect(event.type).toBe(SystemEventTypes.TASK_CREATED);
      expect(event.aggregateId).toBe("task-1");
      expect(event.payload.title).toBe("Implement feature");
      expect(event.payload.dependencies).toContain("task-0");
    });

    it("creates memory stored event", () => {
      const event = createMemoryStoredEvent("mem-1", "context", "user-prefs", "semantic", 1024);

      expect(event.type).toBe(SystemEventTypes.MEMORY_STORED);
      expect(event.aggregateType).toBe("memory");
      expect(event.payload.size).toBe(1024);
    });

    it("generates unique event IDs", () => {
      const event1 = createAgentSpawnedEvent("a", "r", "d", []);
      const event2 = createAgentSpawnedEvent("a", "r", "d", []);

      expect(event1.id).not.toBe(event2.id);
    });
  });

  describe("AgentStateProjection", () => {
    let store: InMemoryEventStore;
    let projection: AgentStateProjection;

    beforeEach(async () => {
      store = new InMemoryEventStore();
      projection = new AgentStateProjection(store);
    });

    it("builds agent state from events", async () => {
      await store.append(createAgentSpawnedEvent("agent-1", "coder", "core", ["coding"]));
      await store.append(createAgentStartedEvent("agent-1"));

      await projection.initialize();

      const agent = projection.getAgent("agent-1");
      expect(agent).toBeDefined();
      expect(agent!.role).toBe("coder");
      expect(agent!.status).toBe("active");
    });

    it("tracks task assignments", async () => {
      await store.append(createAgentSpawnedEvent("agent-1", "coder", "core", []));
      await store.append(createAgentTaskAssignedEvent("agent-1", "task-1", "code"));

      await projection.initialize();

      const agent = projection.getAgent("agent-1");
      expect(agent!.status).toBe("busy");
      expect(agent!.currentTask).toBe("task-1");
    });

    it("tracks completed tasks", async () => {
      await store.append(createAgentSpawnedEvent("agent-1", "coder", "core", []));
      await store.append(createAgentTaskAssignedEvent("agent-1", "task-1", "code"));
      await store.append(createAgentTaskCompletedEvent("agent-1", "task-1", 5000));

      await projection.initialize();

      const agent = projection.getAgent("agent-1");
      expect(agent!.completedTasks).toContain("task-1");
      expect(agent!.taskCount).toBe(1);
      expect(agent!.totalTaskDuration).toBe(5000);
    });

    it("queries agents by status", async () => {
      await store.append(createAgentSpawnedEvent("agent-1", "coder", "core", []));
      await store.append(createAgentSpawnedEvent("agent-2", "reviewer", "core", []));
      await store.append(createAgentStartedEvent("agent-1"));

      await projection.initialize();

      expect(projection.getAgentsByStatus("idle")).toHaveLength(1);
      expect(projection.getAgentsByStatus("active")).toHaveLength(1);
    });
  });

  describe("TaskHistoryProjection", () => {
    let store: InMemoryEventStore;
    let projection: TaskHistoryProjection;

    beforeEach(() => {
      store = new InMemoryEventStore();
      projection = new TaskHistoryProjection(store);
    });

    it("builds task state from events", async () => {
      await store.append(createTaskCreatedEvent("task-1", "code", "Test task", "high"));
      await store.append(createTaskStartedEvent("task-1", "agent-1"));

      await projection.initialize();

      const task = projection.getTask("task-1");
      expect(task).toBeDefined();
      expect(task!.status).toBe("in-progress");
      expect(task!.assignedAgent).toBe("agent-1");
    });

    it("tracks task completion", async () => {
      await store.append(createTaskCreatedEvent("task-1", "code", "Test", "high"));
      await store.append(createTaskStartedEvent("task-1", "agent-1"));
      await store.append(createTaskCompletedEvent("task-1", "agent-1", 3000, { success: true }));

      await projection.initialize();

      const task = projection.getTask("task-1");
      expect(task!.status).toBe("completed");
      expect(task!.duration).toBe(3000);
    });

    it("tracks task failures", async () => {
      await store.append(createTaskCreatedEvent("task-1", "code", "Test", "high"));
      await store.append(createTaskFailedEvent("task-1", "Network error", 1, "agent-1"));

      await projection.initialize();

      const task = projection.getTask("task-1");
      expect(task!.status).toBe("failed");
      expect(task!.error).toBe("Network error");
      expect(task!.retryCount).toBe(1);
    });

    it("calculates average duration", async () => {
      await store.append(createTaskCreatedEvent("task-1", "code", "Test 1", "high"));
      await store.append(createTaskStartedEvent("task-1", "agent-1"));
      await store.append(createTaskCompletedEvent("task-1", "agent-1", 1000));

      await store.append(createTaskCreatedEvent("task-2", "code", "Test 2", "high"));
      await store.append(createTaskStartedEvent("task-2", "agent-1"));
      await store.append(createTaskCompletedEvent("task-2", "agent-1", 3000));

      await projection.initialize();

      expect(projection.getAverageTaskDuration()).toBe(2000);
    });
  });

  describe("MemoryIndexProjection", () => {
    let store: InMemoryEventStore;
    let projection: MemoryIndexProjection;

    beforeEach(() => {
      store = new InMemoryEventStore();
      projection = new MemoryIndexProjection(store);
    });

    it("indexes stored memories", async () => {
      await store.append(createMemoryStoredEvent("mem-1", "context", "key1", "semantic", 512));

      await projection.initialize();

      const memory = projection.getMemory("mem-1");
      expect(memory).toBeDefined();
      expect(memory!.namespace).toBe("context");
      expect(memory!.size).toBe(512);
    });

    it("tracks access count", async () => {
      await store.append(createMemoryStoredEvent("mem-1", "context", "key1", "semantic", 512));
      await store.append(createMemoryRetrievedEvent("mem-1", "context", "key1"));
      await store.append(createMemoryRetrievedEvent("mem-1", "context", "key1"));

      await projection.initialize();

      const memory = projection.getMemory("mem-1");
      expect(memory!.accessCount).toBe(2);
    });

    it("tracks deleted memories", async () => {
      await store.append(createMemoryStoredEvent("mem-1", "context", "key1", "semantic", 512));
      await store.append(createMemoryDeletedEvent("mem-1", "context", "key1"));

      await projection.initialize();

      const memory = projection.getMemory("mem-1");
      expect(memory!.isDeleted).toBe(true);

      const active = projection.getActiveMemories();
      expect(active).toHaveLength(0);
    });

    it("queries by namespace", async () => {
      await store.append(createMemoryStoredEvent("mem-1", "context", "k1", "semantic", 100));
      await store.append(createMemoryStoredEvent("mem-2", "context", "k2", "semantic", 200));
      await store.append(createMemoryStoredEvent("mem-3", "other", "k3", "semantic", 300));

      await projection.initialize();

      const contextMemories = projection.getMemoriesByNamespace("context");
      expect(contextMemories).toHaveLength(2);
      expect(projection.getTotalSizeByNamespace("context")).toBe(300);
    });

    it("finds most accessed memories", async () => {
      await store.append(createMemoryStoredEvent("mem-1", "ns", "k1", "semantic", 100));
      await store.append(createMemoryStoredEvent("mem-2", "ns", "k2", "semantic", 100));

      await store.append(createMemoryRetrievedEvent("mem-1", "ns", "k1"));
      await store.append(createMemoryRetrievedEvent("mem-2", "ns", "k2"));
      await store.append(createMemoryRetrievedEvent("mem-2", "ns", "k2"));
      await store.append(createMemoryRetrievedEvent("mem-2", "ns", "k2"));

      await projection.initialize();

      const mostAccessed = projection.getMostAccessedMemories(1);
      expect(mostAccessed[0]!.id).toBe("mem-2");
    });
  });
});
