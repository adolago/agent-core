import { Server } from "../../server/server"
import { cmd } from "./cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Log } from "../../util/log"
import { Global } from "../../global"
import { Session } from "../../session"
import { Todo } from "../../session/todo"
import { Persistence } from "../../session/persistence"
import { Bus } from "../../bus"
import { Instance } from "../../project/instance"
import { LifecycleHooks } from "../../hooks/lifecycle"
import { WeztermOrchestration } from "../../orchestration/wezterm"
import { initPersonas } from "../../bootstrap/personas"
import { spawn, type ChildProcess } from "child_process"
import fs from "fs/promises"
import path from "path"
import os from "os"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"

const log = Log.create({ service: "daemon" })

export namespace Daemon {
  const STATE_DIR = path.join(Global.Path.state, "daemon")
  const PID_FILE = path.join(STATE_DIR, "daemon.pid")
  const LOCK_FILE = path.join(STATE_DIR, "daemon.lock")

  export interface DaemonState {
    pid: number
    port: number
    hostname: string
    startTime: number
    directory: string
  }

  async function ensureStateDir() {
    await fs.mkdir(STATE_DIR, { recursive: true })
  }

  export async function writePidFile(state: DaemonState) {
    await ensureStateDir()
    await fs.writeFile(PID_FILE, JSON.stringify(state, null, 2))
    log.info("wrote pid file", { path: PID_FILE, state })
  }

  export async function removePidFile() {
    try {
      await fs.unlink(PID_FILE)
      log.info("removed pid file", { path: PID_FILE })
    } catch (e) {
      // Ignore if file doesn't exist
    }
  }

  export async function readPidFile(): Promise<DaemonState | null> {
    try {
      const content = await fs.readFile(PID_FILE, "utf-8")
      return JSON.parse(content)
    } catch {
      return null
    }
  }

  export async function isRunning(): Promise<boolean> {
    const state = await readPidFile()
    if (!state) return false

    try {
      // Check if process is running
      process.kill(state.pid, 0)
      return true
    } catch {
      // Process not running, clean up stale pid file
      await removePidFile()
      return false
    }
  }

  export async function restoreSessionsWithTodos(directory: string) {
    log.info("checking for sessions with incomplete todos", { directory })

    const sessions: Session.Info[] = []
    for await (const session of Session.list()) {
      sessions.push(session)
    }

    let restoredCount = 0
    for (const session of sessions) {
      const todos = await Todo.get(session.id)
      const incompleteTodos = todos.filter((t) => t.status !== "completed" && t.status !== "cancelled")

      if (incompleteTodos.length > 0) {
        log.info("found session with incomplete todos", {
          sessionID: session.id,
          title: session.title,
          incomplete: incompleteTodos.length,
          total: todos.length,
        })
        restoredCount++
      }
    }

    if (restoredCount > 0) {
      log.info("sessions with incomplete todos ready for continuation", { count: restoredCount })
    } else {
      log.info("no sessions with incomplete todos found")
    }

    return restoredCount
  }

  export async function setupSignalHandlers(cleanup: (signal?: NodeJS.Signals) => Promise<void>) {
    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"]

    for (const signal of signals) {
      process.on(signal, async () => {
        log.info("received signal, shutting down", { signal })
        await cleanup(signal)
        process.exit(0)
      })
    }
  }
}

/**
 * Gateway supervisor - manages zee gateway as a child process with auto-restart
 */
export namespace GatewaySupervisor {
  const ZEE_GATEWAY_DIR = path.join(os.homedir(), "Repositories/personas/zee")
  const RESTART_DELAY_MS = 2000
  const MAX_RESTART_ATTEMPTS = 5
  const RESTART_WINDOW_MS = 60_000 // Reset restart counter after 1 minute of stability

  let gatewayProcess: ChildProcess | null = null
  let restartAttempts = 0
  let lastRestartTime = 0
  let isShuttingDown = false
  let gatewayEnabled = false

  export interface GatewayState {
    running: boolean
    pid?: number
    restarts: number
    lastRestartAt?: number
    error?: string
  }

  export function getState(): GatewayState {
    return {
      running: gatewayProcess !== null && !gatewayProcess.killed,
      pid: gatewayProcess?.pid,
      restarts: restartAttempts,
      lastRestartAt: lastRestartTime || undefined,
    }
  }

  export async function start(): Promise<boolean> {
    if (isShuttingDown) return false
    if (gatewayProcess) return true

    // Check if zee gateway directory exists
    try {
      await fs.access(ZEE_GATEWAY_DIR)
    } catch {
      log.warn("zee gateway directory not found", { dir: ZEE_GATEWAY_DIR })
      return false
    }

    // Check if package.json exists
    try {
      await fs.access(path.join(ZEE_GATEWAY_DIR, "package.json"))
    } catch {
      log.warn("zee gateway package.json not found", { dir: ZEE_GATEWAY_DIR })
      return false
    }

    log.info("starting zee gateway", { dir: ZEE_GATEWAY_DIR })

    try {
      // Use pnpm to start the gateway
      gatewayProcess = spawn("pnpm", ["zee", "gateway"], {
        cwd: ZEE_GATEWAY_DIR,
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
        env: {
          ...process.env,
          // Ensure gateway connects back to this daemon
          AGENT_CORE_URL: `http://127.0.0.1:${process.env.PORT || 3210}`,
        },
      })

      gatewayEnabled = true
      lastRestartTime = Date.now()

      gatewayProcess.stdout?.on("data", (data: Buffer) => {
        const lines = data.toString().trim().split("\n")
        for (const line of lines) {
          if (line.trim()) {
            log.info("[zee-gateway]", { message: line })
          }
        }
      })

      gatewayProcess.stderr?.on("data", (data: Buffer) => {
        const lines = data.toString().trim().split("\n")
        for (const line of lines) {
          if (line.trim()) {
            log.warn("[zee-gateway]", { message: line })
          }
        }
      })

      gatewayProcess.on("exit", (code, signal) => {
        const pid = gatewayProcess?.pid
        gatewayProcess = null

        if (isShuttingDown) {
          log.info("zee gateway stopped during shutdown", { pid, code, signal })
          return
        }

        log.warn("zee gateway exited", { pid, code, signal })

        // Reset restart counter if running stably for RESTART_WINDOW_MS
        const now = Date.now()
        if (now - lastRestartTime > RESTART_WINDOW_MS) {
          restartAttempts = 0
        }

        // Auto-restart if under limit
        if (restartAttempts < MAX_RESTART_ATTEMPTS) {
          restartAttempts++
          log.info("scheduling zee gateway restart", {
            attempt: restartAttempts,
            maxAttempts: MAX_RESTART_ATTEMPTS,
            delayMs: RESTART_DELAY_MS,
          })
          setTimeout(() => {
            if (!isShuttingDown) {
              start().catch((err) => {
                log.error("failed to restart zee gateway", { error: String(err) })
              })
            }
          }, RESTART_DELAY_MS)
        } else {
          log.error("zee gateway restart limit reached", {
            attempts: restartAttempts,
            maxAttempts: MAX_RESTART_ATTEMPTS,
          })
        }
      })

      gatewayProcess.on("error", (err) => {
        log.error("zee gateway process error", { error: err.message })
      })

      log.info("zee gateway started", { pid: gatewayProcess.pid })
      return true
    } catch (error) {
      log.error("failed to start zee gateway", {
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  export async function stop(): Promise<void> {
    isShuttingDown = true
    gatewayEnabled = false

    if (!gatewayProcess) return

    const pid = gatewayProcess.pid
    log.info("stopping zee gateway", { pid })

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (gatewayProcess && !gatewayProcess.killed) {
          log.warn("zee gateway did not stop gracefully, sending SIGKILL", { pid })
          gatewayProcess.kill("SIGKILL")
        }
        resolve()
      }, 5000)

      gatewayProcess!.once("exit", () => {
        clearTimeout(timeout)
        log.info("zee gateway stopped", { pid })
        resolve()
      })

      gatewayProcess!.kill("SIGTERM")
    })
  }

  export function isEnabled(): boolean {
    return gatewayEnabled
  }
}

export const DaemonCommand = cmd({
  command: "daemon",
  builder: (yargs) =>
    withNetworkOptions(yargs)
      .option("directory", {
        describe: "Working directory for the daemon",
        type: "string",
        default: process.cwd(),
      })
      .option("foreground", {
        describe: "Run in foreground (don't daemonize)",
        type: "boolean",
        default: true, // For now, always run in foreground
      })
      .option("restore-sessions", {
        describe: "Restore sessions with incomplete todos on startup",
        type: "boolean",
        default: true,
      })
      .option("wezterm", {
        describe: "Enable WezTerm visual orchestration when display available",
        type: "boolean",
        default: true,
      })
      .option("wezterm-layout", {
        describe: "WezTerm pane layout",
        type: "string",
        choices: ["horizontal", "vertical", "grid"],
        default: "horizontal",
      })
      .option("gateway", {
        describe: "Start zee messaging gateway (WhatsApp/Telegram/Signal)",
        type: "boolean",
        default: true,
      }),
  describe: "Start agent-core as a headless daemon for remote access",
  handler: async (args) => {
    // Check if already running
    if (await Daemon.isRunning()) {
      const state = await Daemon.readPidFile()
      UI.warn(`Daemon is already running (PID: ${state?.pid}, Port: ${state?.port})`)
      
      const shouldKill = await prompts.confirm({
        message: "Do you want to stop the existing daemon and start a new one?",
        initialValue: false
      })

      if (prompts.isCancel(shouldKill) || !shouldKill) {
        UI.info("Exiting.")
        process.exit(0)
      }

      UI.info(`Stopping daemon (PID: ${state?.pid})...`)
      try {
        if (state?.pid) process.kill(state.pid, "SIGTERM")
        await Daemon.removePidFile()
        // Wait a bit
        await new Promise(r => setTimeout(r, 1000))
      } catch (e) {
        UI.error(`Failed to stop daemon: ${e}`)
        process.exit(1)
      }
    }

    const opts = await resolveNetworkOptions(args)
    const directory = args.directory as string

    log.info("starting daemon", {
      directory,
      hostname: opts.hostname,
      port: opts.port,
      restoreSessions: args["restore-sessions"],
    })

    // Start the server
    const server = Server.listen(opts)

    // Write PID file
    const state: Daemon.DaemonState = {
      pid: process.pid,
      port: server.port ?? opts.port,
      hostname: server.hostname ?? opts.hostname,
      startTime: Date.now(),
      directory,
    }
    await Daemon.writePidFile(state)

    // Emit daemon.start hook
    await LifecycleHooks.emitDaemonStart({
      pid: process.pid,
      port: state.port,
      hostname: state.hostname,
      directory,
      startTime: state.startTime,
    })

    // Initialize session persistence (checkpoints, WAL, recovery)
    let persistenceEnabled = false
    try {
      await Instance.provide({
        directory,
        async fn() {
          await Persistence.init({
            checkpointInterval: 5 * 60 * 1000, // 5 minutes
            maxCheckpoints: 3,
            enableWAL: true,
          })
          persistenceEnabled = true
        },
      })
      console.log("Persistence: Enabled (checkpoints + WAL)")
    } catch (error) {
      log.error("Failed to initialize persistence", {
        error: error instanceof Error ? error.message : String(error),
      })
      console.error(`Warning: Persistence initialization failed: ${error instanceof Error ? error.message : error}`)
    }

    // Initialize persona hooks (cross-session memory, fact extraction)
    try {
      await initPersonas()
      console.log("Personas:   Hooks initialized")
    } catch (error) {
      log.debug("Personas initialization skipped", {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    // Initialize WezTerm orchestration if enabled
    let weztermEnabled = false
    if (args.wezterm) {
      try {
        weztermEnabled = await WeztermOrchestration.init({
          enabled: true,
          layout: args["wezterm-layout"] as "horizontal" | "vertical" | "grid",
          showStatusPane: true,
          statusPanePercent: 20,
          statusRefreshInterval: 5000,
        })
        if (weztermEnabled) {
          console.log("WezTerm:   Visual orchestration enabled")
        } else {
          console.log("WezTerm:   Not available (no display or WezTerm CLI)")
        }
      } catch (error) {
        log.debug("WezTerm initialization failed", {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // Start zee gateway if enabled
    let gatewayStarted = false
    if (args.gateway) {
      gatewayStarted = await GatewaySupervisor.start()
      if (gatewayStarted) {
        console.log("Gateway:    Messaging gateway started (WhatsApp/Telegram/Signal)")
      } else {
        console.log("Gateway:    Not available (zee gateway not found)")
      }
    }

    // Setup cleanup handlers
    const cleanup = async (signal?: NodeJS.Signals, error?: Error) => {
      log.info("daemon shutting down")

      const shutdownReason: "signal" | "error" | "manual" = error ? "error" : signal ? "signal" : "manual"

      // Emit daemon.shutdown hook
      await LifecycleHooks.emitDaemonShutdown({
        pid: process.pid,
        reason: shutdownReason,
        signal: signal,
        error: error?.message,
      })

      // Shutdown WezTerm orchestration
      if (weztermEnabled) {
        await WeztermOrchestration.shutdown()
      }

      // Shutdown zee gateway
      if (GatewaySupervisor.isEnabled()) {
        await GatewaySupervisor.stop()
      }

      // Shutdown persistence (creates final checkpoint, removes recovery marker)
      if (persistenceEnabled) {
        await Instance.provide({
          directory,
          async fn() {
            await Persistence.shutdown()
          },
        }).catch((e) => log.error("Persistence shutdown error", { error: String(e) }))
      }

      await Daemon.removePidFile()
      await server.stop()
    }

    await Daemon.setupSignalHandlers(cleanup)

    // Handle uncaught errors
    process.on("uncaughtException", async (error) => {
      log.error("uncaught exception", { error: error.message, stack: error.stack })
      await cleanup(undefined, error)
      process.exit(1)
    })

    process.on("unhandledRejection", async (reason) => {
      log.error("unhandled rejection", { reason: String(reason) })
    })

    const persistenceStatus = persistenceEnabled ? "Active (checkpoints + WAL)" : "Disabled"
    const weztermStatus = weztermEnabled ? "Active (status pane)" : args.wezterm ? "No display" : "Disabled"
    const gatewayStatus = gatewayStarted
      ? `Active (PID: ${GatewaySupervisor.getState().pid})`
      : args.gateway
        ? "Not available (zee not found)"
        : "Disabled"

    console.log(`
Agent-Core Daemon Started
========================
PID:       ${process.pid}
Port:      ${server.port}
Hostname:  ${server.hostname}
Directory: ${directory}
URL:       http://${server.hostname}:${server.port}

Services:
  Persistence: ${persistenceStatus}
  WezTerm:     ${weztermStatus}
  Gateway:     ${gatewayStatus}

API Endpoints:
  Health:   GET  /global/health
  Sessions: GET  /session
  Events:   GET  /event (SSE)
  Prompt:   POST /session/:id/message

Press Ctrl+C to stop the daemon.
`)

    // Restore sessions with incomplete todos and emit daemon.ready hook
    let sessionsWithIncompleteTodos = 0
    if (args["restore-sessions"]) {
      // Need to provide instance context for session operations
      await Instance.provide({
        directory,
        async fn() {
          sessionsWithIncompleteTodos = await Daemon.restoreSessionsWithTodos(directory)
          if (sessionsWithIncompleteTodos > 0) {
            console.log(`Found ${sessionsWithIncompleteTodos} session(s) with incomplete todos ready for continuation.`)
          }
        },
      })
    }

    // Emit daemon.ready hook - daemon is fully initialized
    // Note: telegram/whatsapp/discord are false because messaging is handled by external zee gateway
    await LifecycleHooks.emitDaemonReady({
      pid: process.pid,
      port: state.port,
      services: {
        persistence: persistenceEnabled,
        telegram: false,
        whatsapp: false,
        discord: false,
      },
      sessionsWithIncompleteTodos,
    })

    // Keep the process running
    await new Promise(() => {})
  },
})

// Subcommand: daemon status
export const DaemonStatusCommand = cmd({
  command: "daemon-status",
  describe: "Check if the daemon is running",
  handler: async () => {
    const running = await Daemon.isRunning()
    const state = await Daemon.readPidFile()

    if (running && state) {
      console.log(`Daemon is running`)
      console.log(`  PID:       ${state.pid}`)
      console.log(`  Port:      ${state.port}`)
      console.log(`  Hostname:  ${state.hostname}`)
      console.log(`  Directory: ${state.directory}`)
      console.log(`  Started:   ${new Date(state.startTime).toISOString()}`)
      console.log(`  URL:       http://${state.hostname}:${state.port}`)
    } else {
      console.log(`Daemon is not running`)
      process.exit(1)
    }
  },
})

// Subcommand: daemon stop
export const DaemonStopCommand = cmd({
  command: "daemon-stop",
  describe: "Stop the running daemon",
  handler: async () => {
    const state = await Daemon.readPidFile()

    if (!state) {
      console.log("No daemon PID file found")
      process.exit(1)
    }

    try {
      process.kill(state.pid, "SIGTERM")
      console.log(`Sent SIGTERM to daemon (PID: ${state.pid})`)

      // Wait for it to stop
      let attempts = 0
      while (attempts < 10) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        if (!(await Daemon.isRunning())) {
          console.log("Daemon stopped successfully")
          return
        }
        attempts++
      }

      // Force kill if still running
      console.log("Daemon did not stop gracefully, sending SIGKILL")
      process.kill(state.pid, "SIGKILL")
      await Daemon.removePidFile()
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ESRCH") {
        console.log("Daemon process not found, cleaning up PID file")
        await Daemon.removePidFile()
      } else {
        throw e
      }
    }
  },
})
