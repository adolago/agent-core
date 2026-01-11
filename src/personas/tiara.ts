/**
 * Personas Orchestrator
 *
 * The main coordinator for the personas layer. Manages:
 * - Worker (queen/drone) lifecycle
 * - Task submission and execution
 * - State persistence to Qdrant
 * - WezTerm pane management
 * - Conversation continuity
 */

import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import type {
  PersonasOrchestrator,
  PersonasState,
  PersonasConfig,
  PersonasTask,
  PersonasEvent,
  PersonasEventType,
  DroneResult,
  WaitOptions,
  SpawnWithWaitOptions,
  Worker,
  WorkerId,
  WorkerRole,
  PersonaId,
  TaskPriority,
  TaskStatus,
  ConversationState,
} from "./types";
import { QdrantMemoryBridge, createMemoryBridge } from "./memory-bridge";
import { WeztermPaneBridge, createWeztermBridge } from "./wezterm";
import { generateDronePrompt } from "./persona";
import { formatAnnouncement, getDroneWaiter, shouldAnnounce, shutdownDroneWaiter } from "./drone-wait";
import { createConversationState } from "./continuity";
import { Log } from "../../packages/agent-core/src/util/log";

const log = Log.create({ service: "personas-tiara" });

/**
 * Default personas layer configuration
 */
const DEFAULT_CONFIG: PersonasConfig = {
  maxDronesPerPersona: 3,
  autoSpawn: true,
  wezterm: {
    enabled: true,
    layout: "horizontal",
    showStatusPane: true,
  },
  qdrant: {
    url: "http://localhost:6333",
    stateCollection: "personas_state",
    memoryCollection: "personas_memory",
  },
  continuity: {
    autoSummarize: true,
    summaryThreshold: 60000,
    maxKeyFacts: 50,
  },
  tiara: {
    enabled: true,
    topology: "star",
  },
};

/**
 * Generate a unique worker ID
 */
function generateWorkerId(): WorkerId {
  return `worker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` as WorkerId;
}

/**
 * Generate a unique task ID
 */
function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Main Personas Orchestrator implementation
 */
export class Orchestrator extends EventEmitter implements PersonasOrchestrator {
  private config: PersonasConfig;
  private memoryBridge: QdrantMemoryBridge;
  private weztermBridge: WeztermPaneBridge;
  private currentState: PersonasState;
  private processes = new Map<WorkerId, ChildProcess>();
  private workerOutputs = new Map<WorkerId, { stdout: string; stderr: string }>();
  private maxOutputChars = 20000;
  private initialized = false;
  private syncInterval?: ReturnType<typeof setInterval>;
  private droneWaiter = getDroneWaiter();

  constructor(config?: Partial<PersonasConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memoryBridge = createMemoryBridge(this.config.qdrant);
    this.weztermBridge = createWeztermBridge(this.config.wezterm);
    this.currentState = this.createInitialState();
  }

  /**
   * Create initial state
   */
  private createInitialState(): PersonasState {
    return {
      version: "1.0.0",
      workers: [],
      tasks: [],
      lastSyncAt: Date.now(),
      stats: {
        totalTasksCompleted: 0,
        totalDronesSpawned: 0,
        totalTokensUsed: 0,
      },
    };
  }

  /**
   * Initialize the tiara
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    const leadPersona = this.resolveLeadPersona();

    // Initialize memory bridge
    await this.memoryBridge.init();

    // Try to load existing state
    const existingState = await this.memoryBridge.loadState();
    if (existingState) {
      this.currentState = existingState;
      // Clean up any stale workers
      this.currentState.workers = this.currentState.workers.filter(
        (w) => w.status !== "terminated" && w.status !== "error"
      );
    }

    // Ensure a lead persona is always present
    if (!this.currentState.conversation) {
      this.currentState.conversation = createConversationState(
        `session-${Date.now()}`,
        leadPersona
      );
    }
    this.ensureQueenPresence(leadPersona);

    // Set up WezTerm if enabled
    if (this.config.wezterm.enabled) {
      const available = await this.weztermBridge.isAvailable();
      if (available) {
        await this.weztermBridge.setupLayout(this.config.wezterm);
      }
    }

    // Start periodic state sync
    this.syncInterval = setInterval(() => {
      this.saveState().catch((e) => log.error("Failed to save state", { error: String(e) }));
    }, 30000); // Sync every 30 seconds

    this.initialized = true;
    this.emit("initialized");
  }

  private resolveLeadPersona(): PersonaId {
    const requested = (process.env.PERSONAS_LEAD_PERSONA ?? "zee").trim().toLowerCase();
    if (requested === "stanley" || requested === "johny" || requested === "zee") {
      return requested;
    }
    return "zee";
  }

  private ensureQueenPresence(persona: PersonaId): void {
    const existing = this.currentState.workers.find(
      (w) => w.persona === persona && w.role === "queen"
    );
    if (existing) {
      if (existing.status === "terminated" || existing.status === "error") {
        existing.status = "idle";
        existing.lastActivityAt = Date.now();
      }
      return;
    }

    const now = Date.now();
    const worker: Worker = {
      id: `queen-${persona}` as WorkerId,
      persona,
      role: "queen",
      status: "idle",
      createdAt: now,
      lastActivityAt: now,
    };
    this.currentState.workers.push(worker);
  }

  /**
   * Get current state
   */
  state(): PersonasState {
    return { ...this.currentState };
  }

  /**
   * Get conversation state
   */
  conversation(): ConversationState | undefined {
    return this.currentState.conversation;
  }

  /**
   * Set the current plan
   */
  async setPlan(plan: string): Promise<void> {
    if (!this.currentState.conversation) {
      this.currentState.conversation = {
        sessionId: `session-${Date.now()}`,
        leadPersona: "zee",
        summary: "",
        plan,
        objectives: [],
        keyFacts: [],
        sessionChain: [],
        updatedAt: Date.now(),
      };
    } else {
      this.currentState.conversation.plan = plan;
      this.currentState.conversation.updatedAt = Date.now();
    }

    await this.saveState();
    this.emitEvent("state:synced", {});
  }

  /**
   * Add an objective
   */
  async addObjective(objective: string): Promise<void> {
    if (!this.currentState.conversation) {
      this.currentState.conversation = {
        sessionId: `session-${Date.now()}`,
        leadPersona: "zee",
        summary: "",
        plan: "",
        objectives: [objective],
        keyFacts: [],
        sessionChain: [],
        updatedAt: Date.now(),
      };
    } else {
      this.currentState.conversation.objectives.push(objective);
      this.currentState.conversation.updatedAt = Date.now();
    }

    await this.saveState();
  }

  /**
   * Spawn a drone for a task
   */
  async spawnDrone(options: {
    persona: PersonaId;
    task: string;
    prompt: string;
    priority?: TaskPriority;
    contextMemoryIds?: string[];
  }): Promise<Worker> {
    // Check limits - only count active drones
    const personaDrones = this.currentState.workers.filter(
      (w) => w.persona === options.persona && 
             w.role === "drone" && 
             w.status !== "terminated" && 
             w.status !== "error"
    );
    if (personaDrones.length >= this.config.maxDronesPerPersona) {
      throw new Error(
        `Maximum drones (${this.config.maxDronesPerPersona}) reached for ${options.persona}`
      );
    }

    const workerId = generateWorkerId();
    const now = Date.now();

    // Create worker record
    const worker: Worker = {
      id: workerId,
      persona: options.persona,
      role: "drone",
      status: "spawning",
      currentTask: options.task,
      createdAt: now,
      lastActivityAt: now,
    };

    this.currentState.workers.push(worker);
    this.currentState.stats.totalDronesSpawned++;

    // Create WezTerm pane if enabled
    if (this.config.wezterm.enabled) {
      try {
        const paneId = await this.weztermBridge.createWorkerPane(worker);
        worker.paneId = paneId;
      } catch (e) {
        log.warn("Failed to create WezTerm pane", { error: String(e), workerId: worker.id });
      }
    }

    // Generate the drone prompt
    const dronePrompt = generateDronePrompt(options.persona, options.prompt, {
      plan: this.currentState.conversation?.plan,
      objectives: this.currentState.conversation?.objectives,
      keyFacts: this.currentState.conversation?.keyFacts,
    });

    // Spawn the process
    try {
      await this.spawnDroneProcess(worker, dronePrompt);
      worker.status = "working";
      this.emitEvent("worker:spawned", { workerId, persona: options.persona });
    } catch (e) {
      worker.status = "error";
      this.emitEvent("worker:error", { workerId, error: String(e) });
      throw e;
    }

    await this.saveState();
    await this.updateStatusPane();

    return worker;
  }

  /**
   * Spawn actual drone process
   */
  private async spawnDroneProcess(worker: Worker, prompt: string): Promise<void> {
    // If we have a WezTerm pane, send command there
    if (worker.paneId && this.config.wezterm.enabled) {
      await this.weztermBridge.launchClaudeCode(worker.paneId, {
        prompt,
        persona: worker.persona,
      });
      return;
    }

    // Otherwise spawn a background process
    // Use agent-core run with JSON output to avoid TUI/formatting issues
    const child = spawn("agent-core", ["run", prompt, "--agent", worker.persona, "--format", "json"], {
      stdio: ["ignore", "pipe", "pipe"], // Ignore stdin to prevent hanging on read
      detached: false,
      env: { 
        ...process.env, 
        PATH: `${process.env.HOME}/bin:${process.env.PATH}`,
        // Disable terminal title to prevent escape sequence leaks
        AGENT_CORE_DISABLE_TERMINAL_TITLE: "true",
        OPENCODE_DISABLE_TERMINAL_TITLE: "true",
        NO_COLOR: "true"
      }
    });

    // child.stdin?.end(); // Not needed if stdio is ignore

    worker.pid = child.pid;
    this.processes.set(worker.id, child);

    // Initialize output capture
    this.workerOutputs.set(worker.id, { stdout: "", stderr: "" });

    // Capture stdout (parse JSON stream)
    child.stdout?.on("data", (data) => {
      const output = this.workerOutputs.get(worker.id);
      if (output) {
        const lines = data.toString().split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === "text" && event.part?.text) {
              output.stdout += event.part.text;
            } else if (event.type === "error" && event.error) {
              output.stderr += event.error + "\n";
            }
          } catch {
            // If not JSON, append as is (fallback)
            output.stdout += line + "\n";
          }
        }
        
        if (output.stdout.length > this.maxOutputChars) {
          output.stdout = output.stdout.slice(-this.maxOutputChars);
        }
      }
    });

    // Capture stderr
    child.stderr?.on("data", (data) => {
      const output = this.workerOutputs.get(worker.id);
      if (output) {
        output.stderr += data.toString();
        if (output.stderr.length > this.maxOutputChars) {
          output.stderr = output.stderr.slice(-this.maxOutputChars);
        }
      }
    });

    // Handle process completion
    child.on("exit", (code) => {
      this.handleWorkerComplete(worker.id, code === 0);
    });

    child.on("error", (err) => {
      this.handleWorkerError(worker.id, err.message);
    });
  }

  /**
   * Handle worker completion
   */
  private async handleWorkerComplete(workerId: WorkerId, success: boolean): Promise<void> {
    const worker = this.currentState.workers.find((w) => w.id === workerId);
    if (!worker) return;

    worker.status = success ? "idle" : "error";
    worker.lastActivityAt = Date.now();

    this.processes.delete(workerId);

    // Capture output
    const output = this.workerOutputs.get(workerId);
    const resultText = success ? output?.stdout || "Task completed" : undefined;
    const errorText = !success ? output?.stderr || output?.stdout || "Unknown error" : undefined;

    // Update any associated task
    const task = this.currentState.tasks.find((t) => t.workerId === workerId);
    if (task) {
      task.status = success ? "completed" : "failed";
      task.completedAt = Date.now();
      if (success) {
        task.result = resultText;
        this.currentState.stats.totalTasksCompleted++;
      } else {
        task.error = errorText;
      }
    }

    // Notify drone waiter
    if (success) {
      this.droneWaiter.notifyComplete(workerId, resultText);
    } else {
      this.droneWaiter.notifyError(workerId, errorText || "Task failed");
    }

    this.emitEvent(success ? "worker:completed" : "worker:error", { workerId });
    await this.saveState();
    await this.updateStatusPane();
  }

  /**
   * Handle worker error
   */
  private async handleWorkerError(workerId: WorkerId, error: string): Promise<void> {
    const worker = this.currentState.workers.find((w) => w.id === workerId);
    if (!worker) return;

    worker.status = "error";
    worker.lastActivityAt = Date.now();

    const task = this.currentState.tasks.find((t) => t.workerId === workerId);
    if (task) {
      task.status = "failed";
      task.error = error;
      task.completedAt = Date.now();
    }

    this.emitEvent("worker:error", { workerId, error });
    await this.saveState();
  }

  /**
   * Kill a worker
   */
  async killWorker(workerId: WorkerId): Promise<void> {
    const worker = this.currentState.workers.find((w) => w.id === workerId);
    if (!worker) return;

    // Cancel any pending wait
    this.droneWaiter.notifyError(workerId, "Worker killed");

    // Kill process if running
    const process = this.processes.get(workerId);
    if (process) {
      process.kill();
      this.processes.delete(workerId);
    }

    // Close WezTerm pane
    if (worker.paneId) {
      await this.weztermBridge.closePane(worker.paneId);
    }

    worker.status = "terminated";
    worker.lastActivityAt = Date.now();

    this.emitEvent("worker:terminated", { workerId });
    await this.saveState();
    await this.updateStatusPane();
  }

  /**
   * Wait for a drone to complete
   */
  async waitForDrone(workerId: WorkerId, options?: WaitOptions): Promise<DroneResult> {
    return this.droneWaiter.waitFor(workerId, options);
  }

  /**
   * Spawn a drone and wait for completion
   */
  async spawnDroneWithWait(options: SpawnWithWaitOptions): Promise<DroneResult> {
    const { announce, cleanup, timeoutMs = 300000 } = options;

    // Spawn the drone
    const worker = await this.spawnDrone({
      persona: options.persona,
      task: options.task,
      prompt: options.prompt,
    });

    // Wait for completion
    const result = await this.waitForDrone(worker.id, { timeoutMs });

    // Announce if requested
    if (announce && shouldAnnounce(result, announce)) {
      const announcement = formatAnnouncement(result, announce);
      log.info("Drone announcement", { announcement, workerId: worker.id, status: result.status });
    }

    // Cleanup if requested or fire-and-forget mode
    if (cleanup || timeoutMs === 0) {
      await this.killWorker(worker.id);
    }

    return result;
  }

  /**
   * Submit a task for execution
   */
  async submitTask(
    taskInput: Omit<PersonasTask, "id" | "createdAt" | "status">
  ): Promise<PersonasTask> {
    const task: PersonasTask = {
      ...taskInput,
      id: generateTaskId(),
      status: "pending",
      createdAt: Date.now(),
    };

    this.currentState.tasks.push(task);
    this.emitEvent("task:created", { taskId: task.id });

    // Auto-spawn if enabled
    if (this.config.autoSpawn) {
      try {
        const worker = await this.spawnDrone({
          persona: task.persona,
          task: task.description,
          prompt: task.prompt,
          priority: task.priority,
          contextMemoryIds: task.contextMemoryIds,
        });
        task.workerId = worker.id;
        task.status = "assigned";
        this.emitEvent("task:assigned", { taskId: task.id, workerId: worker.id });
      } catch (e) {
        // Task stays pending if spawn fails
        log.warn("Auto-spawn failed, task remains pending", {
          taskId: task.id,
          persona: task.persona,
          error: String(e),
        });
      }
    }

    await this.saveState();
    return task;
  }

  /**
   * List workers with optional filter
   */
  listWorkers(filter?: { persona?: PersonaId; role?: WorkerRole }): Worker[] {
    let workers = this.currentState.workers;

    if (filter?.persona) {
      workers = workers.filter((w) => w.persona === filter.persona);
    }
    if (filter?.role) {
      workers = workers.filter((w) => w.role === filter.role);
    }

    return workers;
  }

  /**
   * List tasks with optional filter
   */
  listTasks(filter?: { persona?: PersonaId; status?: TaskStatus }): PersonasTask[] {
    let tasks = this.currentState.tasks;

    if (filter?.persona) {
      tasks = tasks.filter((t) => t.persona === filter.persona);
    }
    if (filter?.status) {
      tasks = tasks.filter((t) => t.status === filter.status);
    }

    return tasks;
  }

  /**
   * Summarize conversation for continuity
   */
  async summarizeConversation(messages: string[]): Promise<string> {
    // For now, create a simple summary
    // In production, this would use an LLM to summarize
    const summary = messages.slice(-10).join("\n---\n");

    if (this.currentState.conversation) {
      this.currentState.conversation.summary = summary;
      this.currentState.conversation.updatedAt = Date.now();
    }

    await this.saveState();
    return summary;
  }

  /**
   * Restore context from a previous session
   */
  async restoreContext(sessionId: string): Promise<ConversationState | null> {
    const state = await this.memoryBridge.loadConversationState(sessionId);
    if (state) {
      this.currentState.conversation = state;
      this.emitEvent("continuity:restored", { sessionId });
    }
    return state;
  }

  /**
   * Save current state to Qdrant
   */
  async saveState(): Promise<void> {
    this.currentState.lastSyncAt = Date.now();
    await this.memoryBridge.saveState(this.currentState);
    this.emitEvent("state:synced", {});
  }

  /**
   * Update WezTerm status pane
   */
  private async updateStatusPane(): Promise<void> {
    if (this.config.wezterm.enabled) {
      await this.weztermBridge.updateStatus(this.currentState);
    }
  }

  /**
   * Subscribe to events
   */
  subscribe(
    event: PersonasEventType | "*",
    handler: (event: PersonasEvent) => void
  ): () => void {
    const listener = (e: PersonasEvent) => handler(e);
    super.on(event === "*" ? "event" : event, listener);
    return () => super.off(event === "*" ? "event" : event, listener);
  }

  /**
   * Emit a typed event
   */
  private emitEvent(type: PersonasEventType, data: Record<string, unknown>): void {
    const event: PersonasEvent = {
      type,
      timestamp: Date.now(),
      persona: data.persona as PersonaId | undefined,
      workerId: data.workerId as WorkerId | undefined,
      taskId: data.taskId as string | undefined,
      data,
    };
    super.emit(type, event);
    super.emit("event", event);
  }

  /**
   * Shutdown tiara
   */
  async shutdown(): Promise<void> {
    // Clear sync interval
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Cancel all pending waits and shutdown drone waiter
    this.droneWaiter.cancelAll();
    shutdownDroneWaiter();

    // Kill all workers
    for (const worker of this.currentState.workers) {
      if (worker.status !== "terminated") {
        await this.killWorker(worker.id);
      }
    }

    // Final state save
    await this.saveState();

    // Close WezTerm panes
    await this.weztermBridge.closeAllPanes();
  }
}

/**
 * Create a personas layer tiara with default or custom configuration
 */
export function createOrchestrator(config?: Partial<PersonasConfig>): Orchestrator {
  return new Orchestrator(config);
}

/**
 * Singleton instance for global access
 */
let globalOrchestrator: Orchestrator | null = null;

/**
 * Get or create the global tiara instance
 */
export async function getOrchestrator(
  config?: Partial<PersonasConfig>
): Promise<Orchestrator> {
  if (!globalOrchestrator) {
    globalOrchestrator = createOrchestrator(config);
    await globalOrchestrator.init();
  }
  return globalOrchestrator;
}

/**
 * Shutdown the global tiara
 */
export async function shutdownOrchestrator(): Promise<void> {
  if (globalOrchestrator) {
    await globalOrchestrator.shutdown();
    globalOrchestrator = null;
  }
}
