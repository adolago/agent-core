/**
 * Agent-Core Daemon
 *
 * The main entry point for running agent-core as a background service.
 * Starts personas layer tiara and LSP server together.
 *
 * Usage:
 *   bun run src/daemon/index.ts
 *   bun run src/daemon/index.ts --lsp-port 7777
 */

import { createServer, type Server } from "net";
import { getOrchestrator } from "../personas";
import { createAgentOrchestrator, type AgentOrchestrator } from "../tiara.js";
import { CouncilCoordinator } from "../council/index.js";
import { AgentLSPServer } from "../lsp";
import { DaemonIpcServer } from "./ipc-server";
import { resolveIpcSocketPath } from "./ipc";
import { CanvasManager, type CanvasKind } from "../canvas/manager.js";

interface DaemonConfig {
  lspPort: number;
  lspHost: string;
  ipcSocket: string;
  logLevel: "debug" | "info" | "warn" | "error";
}

const DEFAULT_CONFIG: DaemonConfig = {
  lspPort: 7777,
  lspHost: "127.0.0.1",
  ipcSocket: resolveIpcSocketPath(),
  logLevel: "info",
};

function log(level: string, message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
}

function parseBoolEnv(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

/**
 * Agent-Core Daemon
 *
 * Manages lifecycle of:
 * - Personas layer tiara (worker management, task queue, memory)
 * - LSP server (editor integration via TCP)
 */
export class AgentCoreDaemon {
  private config: DaemonConfig;
  private tcpServer?: Server;
  private lspServer?: AgentLSPServer;
  private ipcServer?: DaemonIpcServer;
  private canvasManager?: CanvasManager;
  private councilCoordinator?: CouncilCoordinator;
  private agentOrchestrator?: AgentOrchestrator;
  private isRunning = false;

  constructor(config?: Partial<DaemonConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the daemon
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("Daemon is already running");
    }

    log("info", "Starting agent-core daemon...");

    const weztermEnabled = parseBoolEnv(
      process.env.AGENT_CORE_WEZTERM_ENABLED ?? process.env.PERSONAS_WEZTERM_ENABLED,
      true
    );

    // 1. Initialize personas layer tiara
    log("info", "Initializing personas layer tiara...");
    const tiara = await getOrchestrator({
      wezterm: { enabled: weztermEnabled },
    });

    // Create AgentOrchestrator adapter for council integration
    log("info", "Creating AgentOrchestrator adapter...");
    this.agentOrchestrator = createAgentOrchestrator(tiara);

    // Create CouncilCoordinator with tiara integration
    log("info", "Creating CouncilCoordinator...");
    this.councilCoordinator = await CouncilCoordinator.create({
      tiara: this.agentOrchestrator,
    });

    // Subscribe to tiara events for logging
    tiara.subscribe("worker:spawned", (data) => {
      log("info", `Worker spawned: ${data.workerId} (${data.persona})`);
    });

    tiara.subscribe("worker:status", (data) => {
      log("debug", `Worker ${data.workerId}: status update`);
    });

    tiara.subscribe("task:completed", (data) => {
      log("info", `Task completed: ${data.taskId}`);
    });

    tiara.subscribe("task:failed", (data) => {
      log("error", `Task failed: ${data.taskId} - ${data.error}`);
    });

    // 2. Create LSP server
    log("info", "Creating LSP server...");
    this.lspServer = new AgentLSPServer({
      enableDiagnostics: true,
      enableCodeActions: true,
      enableHover: true,
    });

    // 3. Initialize canvas manager
    log("info", "Initializing canvas manager...");
    this.canvasManager = new CanvasManager({
      defaultWidth: 0.67,
      reusePane: true,
      splitDirection: "right",
    });

    // 4. Start IPC server for local skill/runtime commands
    this.ipcServer = new DaemonIpcServer({
      socketPath: this.config.ipcSocket,
      handleRequest: async (request) => {
        switch (request.method) {
          case "status": {
            return {
              pid: process.pid,
              lspHost: this.config.lspHost,
              lspPort: this.config.lspPort,
              workers: tiara.listWorkers(),
              tasks: tiara.listTasks(),
            };
          }
          case "list_workers":
            return tiara.listWorkers();
          case "list_tasks":
            return tiara.listTasks();
          case "spawn_drone": {
            const params = request.params ?? {};
            const persona = params.persona ? String(params.persona) : "";
            const task = params.task ? String(params.task) : "";
            const prompt = params.prompt ? String(params.prompt) : "";
            const priority = params.priority as typeof params.priority;
            const contextMemoryIds = Array.isArray(params.contextMemoryIds)
              ? params.contextMemoryIds.map((id) => String(id))
              : undefined;
            if (!persona || !task || !prompt) {
              throw new Error("spawn_drone requires persona, task, and prompt");
            }
            return await tiara.spawnDrone({
              persona: persona as Parameters<typeof tiara.spawnDrone>[0]["persona"],
              task,
              prompt,
              priority: priority as Parameters<typeof tiara.spawnDrone>[0]["priority"],
              contextMemoryIds,
            });
          }
          case "spawn_drone_with_wait": {
            const params = request.params ?? {};
            const persona = params.persona ? String(params.persona) : "";
            const task = params.task ? String(params.task) : "";
            const prompt = params.prompt ? String(params.prompt) : "";
            const timeoutMs = params.timeoutMs ? Number(params.timeoutMs) : undefined;
            
            if (!persona || !task || !prompt) {
              throw new Error("spawn_drone_with_wait requires persona, task, and prompt");
            }
            
            return await tiara.spawnDroneWithWait({
              persona: persona as Parameters<typeof tiara.spawnDroneWithWait>[0]["persona"],
              task,
              prompt,
              timeoutMs,
              announce: {
                target: { type: "surface", id: "daemon", format: "text" },
                prefix: `[${persona}] `,
                skipTrivial: true
              }
            });
          }
          case "submit_task": {
            const params = request.params ?? {};
            const persona = params.persona ? String(params.persona) : "";
            const description = params.description ? String(params.description) : "";
            const prompt = params.prompt ? String(params.prompt) : "";
            const priority = params.priority as typeof params.priority;
            if (!persona || !description || !prompt) {
              throw new Error("submit_task requires persona, description, and prompt");
            }
            return await tiara.submitTask({
              persona: persona as Parameters<typeof tiara.submitTask>[0]["persona"],
              description,
              prompt,
              priority: priority as Parameters<typeof tiara.submitTask>[0]["priority"],
            });
          }
          case "kill_worker": {
            const params = request.params ?? {};
            const workerId = params.workerId ? String(params.workerId) : "";
            if (!workerId) {
              throw new Error("kill_worker requires workerId");
            }
            await tiara.killWorker(workerId);
            return { ok: true };
          }
          case "set_plan": {
            const params = request.params ?? {};
            const plan = params.plan ? String(params.plan) : "";
            if (!plan) {
              throw new Error("set_plan requires plan");
            }
            await tiara.setPlan(plan);
            return { ok: true };
          }
          case "add_objective": {
            const params = request.params ?? {};
            const objective = params.objective ? String(params.objective) : "";
            if (!objective) {
              throw new Error("add_objective requires objective");
            }
            await tiara.addObjective(objective);
            return { ok: true };
          }
          case "save_state":
            await tiara.saveState();
            return { ok: true };
          case "shutdown":
            this.stop().catch((err) => {
              log("error", `Shutdown error: ${err instanceof Error ? err.message : String(err)}`);
            });
            return { ok: true };

          // Canvas IPC methods
          case "canvas:spawn": {
            const params = request.params ?? {};
            const kind = params.kind ? String(params.kind) as CanvasKind : "text";
            const id = params.id ? String(params.id) : `canvas-${Date.now()}`;
            const config = (params.config as Record<string, unknown>) ?? {};
            if (!this.canvasManager) {
              throw new Error("Canvas manager not initialized");
            }
            const canvas = await this.canvasManager.spawn(kind, id, config);
            return { paneId: canvas.paneId, id: canvas.id, kind: canvas.kind };
          }
          case "canvas:show": {
            const params = request.params ?? {};
            const id = params.id ? String(params.id) : "";
            if (!id) throw new Error("canvas:show requires id");
            if (!this.canvasManager) {
              throw new Error("Canvas manager not initialized");
            }
            await this.canvasManager.show(id);
            return { ok: true };
          }
          case "canvas:update": {
            const params = request.params ?? {};
            const id = params.id ? String(params.id) : "";
            const config = (params.config as Record<string, unknown>) ?? {};
            if (!id) throw new Error("canvas:update requires id");
            if (!this.canvasManager) {
              throw new Error("Canvas manager not initialized");
            }
            await this.canvasManager.update(id, config);
            return { ok: true };
          }
          case "canvas:close": {
            const params = request.params ?? {};
            const id = params.id ? String(params.id) : "";
            if (!id) throw new Error("canvas:close requires id");
            if (!this.canvasManager) {
              throw new Error("Canvas manager not initialized");
            }
            await this.canvasManager.close(id);
            return { ok: true };
          }
          case "canvas:selection": {
            const params = request.params ?? {};
            const id = params.id ? String(params.id) : "";
            if (!id) throw new Error("canvas:selection requires id");
            if (!this.canvasManager) {
              throw new Error("Canvas manager not initialized");
            }
            const selection = await this.canvasManager.getSelection(id);
            return { selection };
          }
          case "canvas:list": {
            if (!this.canvasManager) {
              throw new Error("Canvas manager not initialized");
            }
            return this.canvasManager.listActive();
          }

          // Council IPC methods
          case "council:deliberate": {
            if (!this.councilCoordinator) {
              throw new Error("Council coordinator not initialized");
            }
            const params = request.params ?? {};
            const question = params.question ? String(params.question) : "";
            if (!question) {
              throw new Error("council:deliberate requires question");
            }
            const mode = params.mode as "raw_llm" | "agent" | "hybrid" | undefined;
            const models = Array.isArray(params.models)
              ? params.models.map(String)
              : undefined;
            const agents = Array.isArray(params.agents)
              ? params.agents.map(String)
              : undefined;
            const context = params.context ? String(params.context) : undefined;
            const includeDebug = Boolean(params.includeDebug);

            // Build members from models and agents
            const members: Array<{
              type: "llm" | "agent";
              id: string;
              provider?: string;
              model?: string;
              modelRoute?: string;
              agentType?: string;
            }> = [];

            if (models && models.length > 0) {
              for (let i = 0; i < models.length; i++) {
                members.push({
                  type: "llm",
                  id: `llm-${i}`,
                  provider: "openrouter",
                  model: models[i],
                  modelRoute: models[i],
                });
              }
            }

            if (agents && agents.length > 0) {
              for (let i = 0; i < agents.length; i++) {
                members.push({
                  type: "agent",
                  id: `agent-${i}`,
                  agentType: agents[i],
                });
              }
            }

            // Default members if none specified
            if (members.length === 0) {
              members.push(
                {
                  type: "llm",
                  id: "claude",
                  provider: "openrouter",
                  model: "anthropic/claude-3-opus",
                  modelRoute: "anthropic/claude-3-opus",
                },
                {
                  type: "llm",
                  id: "gpt4",
                  provider: "openrouter",
                  model: "openai/gpt-4-turbo",
                  modelRoute: "openai/gpt-4-turbo",
                }
              );
            }

            const result = await this.councilCoordinator.deliberate(
              question,
              {
                mode: mode ?? (agents ? "hybrid" : "raw_llm"),
                members: members as Parameters<typeof this.councilCoordinator.deliberate>[1]["members"],
                chairman: { mode: "highest_scorer" },
              },
              { context, includeDebug }
            );

            return {
              success: result.success,
              sessionId: result.sessionId,
              finalAnswer: result.finalAnswer,
              summary: result.summary,
              debug: result.debug,
            };
          }

          case "council:quick_consensus": {
            if (!this.councilCoordinator) {
              throw new Error("Council coordinator not initialized");
            }
            const params = request.params ?? {};
            const question = params.question ? String(params.question) : "";
            if (!question) {
              throw new Error("council:quick_consensus requires question");
            }
            const models = Array.isArray(params.models)
              ? params.models.map(String)
              : undefined;

            const result = await this.councilCoordinator.quickConsensus(question, models);
            return {
              question: result.question,
              consensus: result.consensus,
              agreement: result.agreement,
              responses: result.responses,
            };
          }

          case "council:list_sessions": {
            if (!this.councilCoordinator) {
              throw new Error("Council coordinator not initialized");
            }
            const params = request.params ?? {};
            const limit = params.limit ? Number(params.limit) : undefined;
            const status = params.status as Parameters<typeof this.councilCoordinator.listSessions>[0]["status"];
            return this.councilCoordinator.listSessions({ limit, status });
          }

          case "council:get_session": {
            if (!this.councilCoordinator) {
              throw new Error("Council coordinator not initialized");
            }
            const params = request.params ?? {};
            const sessionId = params.sessionId ? String(params.sessionId) : "";
            if (!sessionId) {
              throw new Error("council:get_session requires sessionId");
            }
            const session = this.councilCoordinator.getSession(sessionId);
            if (!session) {
              throw new Error(`Session not found: ${sessionId}`);
            }
            return session;
          }

          default:
            throw new Error(`Unknown IPC method: ${request.method}`);
        }
      },
      log,
    });
    await this.ipcServer.start();

    // 5. Start TCP server for LSP connections
    log("info", `Starting TCP server on ${this.config.lspHost}:${this.config.lspPort}...`);
    await this.startTcpServer();

    // 6. Wire tiara state to LSP
    this.wireOrchestratorToLsp(tiara);

    this.isRunning = true;
    log("info", `Agent-core daemon started successfully`);
    log("info", `LSP server listening on ${this.config.lspHost}:${this.config.lspPort}`);
    log("info", `IPC socket listening on ${this.config.ipcSocket}`);
    log("info", `Connect from Neovim: :lua vim.lsp.start({ cmd = vim.lsp.rpc.connect('${this.config.lspHost}', ${this.config.lspPort}) })`);
  }

  /**
   * Start TCP server for LSP connections
   */
  private startTcpServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.tcpServer = createServer((socket) => {
        log("info", `LSP client connected from ${socket.remoteAddress}:${socket.remotePort}`);

        // Pipe socket to LSP server's stdin/stdout simulation
        socket.on("data", (data) => {
          // Forward to LSP server's message parser
          this.lspServer?.handleTcpData(data.toString(), socket);
        });

        socket.on("close", () => {
          log("info", `LSP client disconnected`);
        });

        socket.on("error", (err) => {
          log("error", `Socket error: ${err.message}`);
        });
      });

      this.tcpServer.on("error", (err) => {
        log("error", `TCP server error: ${err.message}`);
        reject(err);
      });

      this.tcpServer.listen(this.config.lspPort, this.config.lspHost, () => {
        resolve();
      });
    });
  }

  /**
   * Wire tiara events to LSP server for real-time updates
   */
  private wireOrchestratorToLsp(tiara: Awaited<ReturnType<typeof getOrchestrator>>): void {
    const updateLspState = async () => {
      const workers = tiara.listWorkers();
      const tasks = tiara.listTasks();

      this.lspServer?.updateState({
        workers: workers.map((w) => ({
          id: w.id,
          persona: w.persona,
          role: w.role,
          status: w.status,
          currentTask: w.currentTask,
          paneId: w.paneId,
          lastActivityAt: w.lastActivityAt,
        })),
        tasks: tasks.map((t) => ({
          id: t.id,
          persona: t.persona,
          description: t.description,
          status: t.status,
          workerId: t.workerId,
          createdAt: t.createdAt,
        })),
        plan: undefined,
        keyFacts: [],
      });
    };

    // Update on relevant events
    tiara.subscribe("worker:spawned", updateLspState);
    tiara.subscribe("worker:status", updateLspState);
    tiara.subscribe("worker:terminated", updateLspState);
    tiara.subscribe("task:submitted", updateLspState);
    tiara.subscribe("task:assigned", updateLspState);
    tiara.subscribe("task:completed", updateLspState);
    tiara.subscribe("task:failed", updateLspState);
    tiara.subscribe("plan:updated", updateLspState);
    tiara.subscribe("objective:added", updateLspState);

    // Initial state push
    updateLspState();
  }

  /**
   * Stop the daemon gracefully
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    log("info", "Stopping agent-core daemon...");

    // Stop TCP server
    if (this.tcpServer) {
      await new Promise<void>((resolve) => {
        this.tcpServer!.close(() => resolve());
      });
    }

    // Stop LSP server
    this.lspServer?.stop();

    // Stop IPC server
    if (this.ipcServer) {
      await this.ipcServer.stop();
      this.ipcServer = undefined;
    }

    // Close all canvases
    if (this.canvasManager) {
      await this.canvasManager.closeAll();
      this.canvasManager = undefined;
    }

    // Shutdown tiara
    const tiara = await getOrchestrator();
    await tiara.shutdown();

    this.isRunning = false;
    log("info", "Agent-core daemon stopped");
  }
}

/**
 * Parse CLI arguments
 */
function parseArgs(): Partial<DaemonConfig> {
  const args = process.argv.slice(2);
  const config: Partial<DaemonConfig> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--lsp-port" && args[i + 1]) {
      config.lspPort = parseInt(args[++i], 10);
    } else if (arg === "--lsp-host" && args[i + 1]) {
      config.lspHost = args[++i];
    } else if (arg === "--ipc-socket" && args[i + 1]) {
      config.ipcSocket = args[++i];
    } else if (arg === "--log-level" && args[i + 1]) {
      config.logLevel = args[++i] as DaemonConfig["logLevel"];
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
agent-core daemon - Background service for multi-persona AI agents

Usage:
  bun run src/daemon/index.ts [options]

Options:
  --lsp-port <port>    LSP server port (default: 7777)
  --lsp-host <host>    LSP server host (default: 127.0.0.1)
  --ipc-socket <path>  IPC socket path (default: ~/.zee/agent-core/daemon.sock)
  --log-level <level>  Log level: debug, info, warn, error (default: info)
  --help, -h           Show this help message

Examples:
  bun run src/daemon/index.ts
  bun run src/daemon/index.ts --lsp-port 8888
  bun run src/daemon/index.ts --lsp-host 0.0.0.0 --lsp-port 7777
  bun run src/daemon/index.ts --ipc-socket /tmp/agent-core.sock
`);
      process.exit(0);
    }
  }

  return config;
}

// Main entry point
if (import.meta.main || require.main === module) {
  const config = parseArgs();
  const daemon = new AgentCoreDaemon(config);

  // Handle shutdown signals
  process.on("SIGINT", async () => {
    log("info", "Received SIGINT, shutting down...");
    await daemon.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    log("info", "Received SIGTERM, shutting down...");
    await daemon.stop();
    process.exit(0);
  });

  // Start daemon
  daemon.start().catch((err) => {
    log("error", `Failed to start daemon: ${err.message}`);
    process.exit(1);
  });
}

export { AgentCoreDaemon as default };
