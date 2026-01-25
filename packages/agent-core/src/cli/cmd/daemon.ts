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
import * as UsageTracker from "../../usage/tracker"
import { execSync, spawn, spawnSync, type ChildProcess } from "child_process"
import fs from "fs/promises"
import fsSync from "fs"
import path from "path"
import net from "net"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import { Zee } from "../../paths"
import { createAuthorizedFetch } from "../../server/auth"

const log = Log.create({ service: "daemon" })

export namespace Daemon {
  const STATE_DIR = path.join(Global.Path.state, "daemon")
  const PID_FILE = path.join(STATE_DIR, "daemon.pid")
  const LOCK_FILE = path.join(STATE_DIR, "daemon.lock")
  let lockHandle: fs.FileHandle | null = null

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
    if (!state) {
      // No PID file, but check for stale lock file
      await checkAndCleanStaleLock()
      return false
    }

    try {
      // Check if process is running
      process.kill(state.pid, 0)
      return true
    } catch {
      // Process not running, clean up stale files
      await removePidFile()
      await checkAndCleanStaleLock()
      return false
    }
  }

  async function checkAndCleanStaleLock() {
    try {
      const stat = await fs.lstat(LOCK_FILE)
      if (!stat.isFile() || stat.isSymbolicLink()) return
      const baseDir = path.resolve(STATE_DIR)
      const resolved = path.resolve(LOCK_FILE)
      const rel = path.relative(baseDir, resolved)
      if (rel.startsWith("..") || path.isAbsolute(rel)) return
      // If we reach here, lock exists but PID doesn't (or is dead)
      await fs.unlink(LOCK_FILE)
      log.info("removed stale lock file", { path: LOCK_FILE })
    } catch {
      // No lock file, all good
    }
  }

  async function readLockFile(): Promise<{ pid?: number; startTime?: number } | null> {
    try {
      const content = await fs.readFile(LOCK_FILE, "utf-8")
      return JSON.parse(content)
    } catch {
      return null
    }
  }

  export async function acquireLock() {
    await ensureStateDir()
    try {
      lockHandle = await fs.open(LOCK_FILE, "wx")
      await lockHandle.writeFile(JSON.stringify({ pid: process.pid, startTime: Date.now() }, null, 2))
      return
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? (error as NodeJS.ErrnoException).code : ""
      if (code !== "EEXIST") throw error
    }

    const existing = await readLockFile()
    if (existing?.pid) {
      try {
        process.kill(existing.pid, 0)
        throw new Error(`Daemon is already running (PID: ${existing.pid})`)
      } catch {
        // Stale lock
      }
    }

    await checkAndCleanStaleLock()
    lockHandle = await fs.open(LOCK_FILE, "wx")
    await lockHandle.writeFile(JSON.stringify({ pid: process.pid, startTime: Date.now() }, null, 2))
  }

  export async function releaseLock() {
    try {
      if (lockHandle) {
        await lockHandle.close()
      }
    } catch {
      // Ignore lock close errors
    } finally {
      lockHandle = null
    }

    try {
      await fs.unlink(LOCK_FILE)
      log.info("removed lock file", { path: LOCK_FILE })
    } catch {
      // Ignore if file doesn't exist
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
 * Gateway supervisor - manages zee gateway as a child process
 */
export namespace GatewaySupervisor {
  const ZEE_GATEWAY_DIR = Zee.repo()
  const ZEE_CONFIG_FILES = ["zee.json", "zee.jsonc"]
  const GATEWAY_ENV_HINTS = [
    "ZEE_GATEWAY_TOKEN",
    "ZEE_GATEWAY_PASSWORD",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_USER_PHONE",
    "TELEGRAM_API_ID",
    "TELEGRAM_API_HASH",
    "DISCORD_BOT_TOKEN",
    "SLACK_BOT_TOKEN",
    "SLACK_APP_TOKEN",
  ]

  let gatewayProcess: ChildProcess | null = null
  let startInFlight = false
  let isShuttingDown = false
  let gatewayEnabled = false
  let forceStart = false
  let lastError: string | undefined
  let lastExit: { code?: number | null; signal?: NodeJS.Signals | null } | undefined
  let lastPreflight: GatewayPreflight | null = null
  let gatewayDaemonUrl: string | undefined
  let retryTimer: NodeJS.Timeout | undefined
  let retryCount = 0
  const RETRY_BASE_MS = 1000
  const RETRY_MAX_MS = 30000

  export interface GatewayPreflight {
    ok: boolean
    issues: string[]
    warnings: string[]
    configPath?: string
    envHints: string[]
    repoExists: boolean
    packageJsonExists: boolean
    pnpmAvailable: boolean
  }

  export interface GatewayState {
    running: boolean
    pid?: number
    error?: string
    enabled: boolean
    lastExit?: { code?: number | null; signal?: NodeJS.Signals | null }
    configPath?: string
    warnings?: string[]
    daemonUrl?: string
  }

  let resolvedPnpmPath: string | undefined

  function resolvePnpmPath(): string | undefined {
    const envPath = process.env.PNPM_BIN?.trim()
    if (envPath) return envPath

    const home = process.env.HOME ?? ""
    const candidates = [
      "pnpm",
      home ? path.join(home, ".local", "bin", "pnpm") : undefined,
    ].filter(Boolean) as string[]

    for (const candidate of candidates) {
      if (candidate !== "pnpm" && fsSync.existsSync(candidate)) {
        return candidate
      }
      try {
        const result = spawnSync(candidate, ["--version"], { stdio: "ignore" })
        if (result.status === 0) return candidate
      } catch {
        continue
      }
    }
    return undefined
  }

  function hasPnpm(): boolean {
    try {
      resolvedPnpmPath = resolvePnpmPath()
      return Boolean(resolvedPnpmPath)
    } catch {
      resolvedPnpmPath = undefined
      return false
    }
  }

  function getEnvHints(): string[] {
    const hints: string[] = []
    for (const key of GATEWAY_ENV_HINTS) {
      if (process.env[key]?.trim()) hints.push(key)
    }
    return hints
  }

  async function findZeeConfig(): Promise<string | undefined> {
    for (const file of ZEE_CONFIG_FILES) {
      const candidate = path.join(Zee.dataDir(), file)
      try {
        await fs.access(candidate)
        return candidate
      } catch {
        // Ignore missing config path
      }
    }
    return undefined
  }

  async function runPreflight(options: { force: boolean; checkPort: boolean }): Promise<GatewayPreflight> {
    const issues: string[] = []
    const warnings: string[] = []

    let repoExists = true
    try {
      await fs.access(ZEE_GATEWAY_DIR)
    } catch {
      repoExists = false
      issues.push(`Zee gateway directory not found (${ZEE_GATEWAY_DIR})`)
    }

    let packageJsonExists = true
    if (repoExists) {
      try {
        await fs.access(path.join(ZEE_GATEWAY_DIR, "package.json"))
      } catch {
        packageJsonExists = false
        issues.push(`Zee gateway package.json not found (${ZEE_GATEWAY_DIR})`)
      }
    } else {
      packageJsonExists = false
    }

    const pnpmAvailable = hasPnpm()
    if (!pnpmAvailable) {
      issues.push("pnpm not found on PATH")
    }

    const configPath = await findZeeConfig()
    const envHints = getEnvHints()
    const configured = Boolean(configPath || envHints.length)
    if (!configured) {
      warnings.push("Zee gateway not configured (no config in ~/.zee/zee.json* or provider env vars)")
    }

    if (options.checkPort) {
      const gatewayPort = getGatewayPort()
      const portOpen = await isPortOpen("127.0.0.1", gatewayPort)
      if (portOpen) {
        const processes = listGatewayProcesses()
        if (processes.length > 0) {
          issues.push(`Existing Zee gateway process detected on port ${gatewayPort}`)
        } else {
          issues.push(`Gateway port ${gatewayPort} is already in use`)
        }
      }
    }

    const ok = issues.length === 0 && (warnings.length === 0 || options.force)
    return {
      ok,
      issues,
      warnings,
      configPath,
      envHints,
      repoExists,
      packageJsonExists,
      pnpmAvailable,
    }
  }

  function clearRetryTimer() {
    if (!retryTimer) return
    clearTimeout(retryTimer)
    retryTimer = undefined
  }

  function scheduleRetry(reason?: string) {
    if (isShuttingDown || !gatewayEnabled) return
    if (retryTimer) return

    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** retryCount)
    retryCount += 1
    log.warn("scheduling zee gateway retry", { delay, reason })

    retryTimer = setTimeout(async () => {
      retryTimer = undefined
      if (isShuttingDown || !gatewayEnabled || gatewayProcess) return
      await start({ force: forceStart, daemonUrl: gatewayDaemonUrl })
    }, delay)
  }

  export async function preflight(options: { force?: boolean; checkPort?: boolean } = {}): Promise<GatewayPreflight> {
    const result = await runPreflight({
      force: options.force ?? false,
      checkPort: options.checkPort ?? false,
    })
    lastPreflight = result
    return result
  }

  export function getState(): GatewayState {
    return {
      running: gatewayProcess !== null && !gatewayProcess.killed,
      pid: gatewayProcess?.pid,
      error: lastError,
      enabled: gatewayEnabled,
      lastExit,
      configPath: lastPreflight?.configPath,
      warnings: lastPreflight?.warnings?.length ? lastPreflight.warnings : undefined,
      daemonUrl: gatewayDaemonUrl,
    }
  }
  export async function start(options: { force?: boolean; daemonUrl?: string } = {}): Promise<boolean> {
    if (isShuttingDown) return false
    if (gatewayProcess) {
      return true
    }
    if (startInFlight) return false

    clearRetryTimer()

    gatewayEnabled = true
    forceStart = options.force ?? false
    if (options.daemonUrl) {
      gatewayDaemonUrl = options.daemonUrl
    }

    startInFlight = true
    const preflight = await runPreflight({ force: forceStart, checkPort: true }).finally(() => {
      startInFlight = false
    })
    lastPreflight = preflight
    lastError = undefined
    if (!preflight.ok) {
      lastError = preflight.issues[0] ?? preflight.warnings[0]
      if (lastError) log.warn("zee gateway preflight failed", { reason: lastError })
      return false
    }

    if (preflight.warnings.length > 0) {
      log.warn("zee gateway preflight warnings", { warnings: preflight.warnings })
    }

    log.info("starting zee gateway", { dir: ZEE_GATEWAY_DIR })

    try {
      // Use pnpm to start the gateway
      const pnpm = resolvedPnpmPath ?? "pnpm"
      gatewayProcess = spawn(pnpm, ["zee", "gateway"], {
        cwd: ZEE_GATEWAY_DIR,
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
        env: {
          ...process.env,
          // Ensure gateway connects back to this daemon
          AGENT_CORE_URL:
            gatewayDaemonUrl ??
            process.env.AGENT_CORE_URL ??
            `http://127.0.0.1:${process.env.PORT || 3210}`,
        },
      })

      gatewayEnabled = true
      lastExit = undefined
      retryCount = 0

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
        lastExit = { code, signal }

        if (isShuttingDown) {
          log.info("zee gateway stopped during shutdown", { pid, code, signal })
          return
        }

        log.warn("zee gateway exited", { pid, code, signal })
        lastError = `zee gateway exited (code: ${code ?? "unknown"}, signal: ${signal ?? "unknown"})`
      })

      gatewayProcess.on("error", (err) => {
        log.error("zee gateway process error", { error: err.message })
        lastError = err.message
      })

      log.info("zee gateway started", { pid: gatewayProcess.pid })
      return true
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      log.error("failed to start zee gateway", {
        error: lastError,
      })
      scheduleRetry(lastError)
      return false
    }
  }

  export async function stop(): Promise<void> {
    isShuttingDown = true
    gatewayEnabled = false
    forceStart = false
    clearRetryTimer()

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

async function isPortOpen(host: string, port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    const timeout = setTimeout(() => {
      socket.destroy()
      resolve(false)
    }, 1000)

    socket.once("connect", () => {
      clearTimeout(timeout)
      socket.end()
      resolve(true)
    })
    socket.once("error", () => {
      clearTimeout(timeout)
      resolve(false)
    })
  })
}

function getGatewayPort(): number {
  const portRaw = Number.parseInt(process.env.ZEE_GATEWAY_PORT ?? "", 10)
  return Number.isFinite(portRaw) ? portRaw : 18789
}

function listGatewayProcesses(): Array<{ pid: number; cmd: string }> {
  try {
    const output = execSync('pgrep -af "zee.*gateway" 2>/dev/null || true', {
      encoding: "utf-8",
    })
    const lines = output.trim().split("\n").filter(Boolean)
  return lines
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.*)$/)
      if (!match) return null
      const cmd = match[2]
      if (cmd.includes("pgrep")) return null
      return { pid: Number.parseInt(match[1], 10), cmd }
    })
    .filter((entry): entry is { pid: number; cmd: string } => Boolean(entry))
  } catch {
    return []
  }
}

function listDaemonProcesses(): Array<{ pid: number; cmd: string }> {
  try {
    const output = execSync('pgrep -af "(agent-core|opencode).*daemon([[:space:]]|$)" 2>/dev/null || true', {
      encoding: "utf-8",
    })
    const lines = output.trim().split("\n").filter(Boolean)
    return lines
      .map((line) => {
        const match = line.match(/^(\d+)\s+(.*)$/)
        if (!match) return null
        const cmd = match[2]
        if (cmd.includes("pgrep") || cmd.includes("daemon-stop")) return null
        return { pid: Number.parseInt(match[1], 10), cmd }
      })
      .filter((entry): entry is { pid: number; cmd: string } => Boolean(entry))
  } catch {
    return []
  }
}

async function stopGatewayProcesses(reason: string): Promise<void> {
  const processes = listGatewayProcesses()
  if (processes.length === 0) return

  log.warn("stopping leftover zee gateway processes", {
    reason,
    count: processes.length,
    pids: processes.map((proc) => proc.pid),
  })

  for (const proc of processes) {
    try {
      process.kill(proc.pid, "SIGTERM")
    } catch {
      // ignore missing process
    }
  }

  const deadline = Date.now() + 4000
  let remaining = processes.map((proc) => proc.pid)
  while (remaining.length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    remaining = remaining.filter((pid) => {
      try {
        process.kill(pid, 0)
        return true
      } catch {
        return false
      }
    })
  }

  if (remaining.length > 0) {
    for (const pid of remaining) {
      try {
        process.kill(pid, "SIGKILL")
      } catch {
        // ignore
      }
    }
    log.warn("force-killed lingering zee gateway processes", { pids: remaining })
  }
}

async function stopDaemonProcesses(reason: string): Promise<void> {
  const processes = listDaemonProcesses()
  if (processes.length === 0) return

  log.warn("stopping leftover daemon processes", {
    reason,
    count: processes.length,
    pids: processes.map((proc) => proc.pid),
  })

  for (const proc of processes) {
    try {
      process.kill(proc.pid, "SIGTERM")
    } catch {
      // ignore missing process
    }
  }

  const deadline = Date.now() + 4000
  let remaining = processes.map((proc) => proc.pid)
  while (remaining.length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    remaining = remaining.filter((pid) => {
      try {
        process.kill(pid, 0)
        return true
      } catch {
        return false
      }
    })
  }

  if (remaining.length > 0) {
    for (const pid of remaining) {
      try {
        process.kill(pid, "SIGKILL")
      } catch {
        // ignore
      }
    }
    log.warn("force-killed lingering daemon processes", { pids: remaining })
  }
}

async function verifyAgentEndpoint(daemonUrl: string, directory: string) {
  const url = new URL("/agent", daemonUrl)
  url.searchParams.set("directory", directory)

  // Use authorized fetch to include server password if configured
  const authorizedFetch = createAuthorizedFetch(fetch)

  let lastError: Error | undefined
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await authorizedFetch(url, { signal: AbortSignal.timeout(15000) })

      if (!response.ok) {
        throw new Error(`Agent endpoint returned ${response.status} ${response.statusText}`)
      }

      const contentType = response.headers.get("content-type") ?? ""
      const body = await response.text()
      if (!contentType.includes("json")) {
        const preview = body.slice(0, 200)
        throw new Error(`Agent endpoint returned ${contentType || "unknown content-type"}: ${preview}`)
      }

      let data: unknown
      try {
        data = JSON.parse(body)
      } catch {
        const preview = body.slice(0, 200)
        throw new Error(`Agent endpoint returned invalid JSON: ${preview}`)
      }

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("Agent endpoint returned no agents")
      }

      return
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
  }

  throw lastError ?? new Error("Agent endpoint check failed")
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
        default: false,
      })
      .option("gateway-force", {
        describe: "Start zee gateway even if preflight checks fail",
        type: "boolean",
        default: false,
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

    try {
      await Daemon.acquireLock()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      UI.error(`Failed to acquire daemon lock: ${message}`)
      process.exit(1)
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
    let server: ReturnType<typeof Server.listen>
    try {
      server = Server.listen(opts)
    } catch (error) {
      await Daemon.releaseLock()
      const message = error instanceof Error ? error.message : String(error)
      UI.error(`Failed to start daemon server: ${message}`)
      process.exit(1)
    }
    const serverHost = server.hostname ?? opts.hostname
    const daemonHost = serverHost === "0.0.0.0" ? "127.0.0.1" : serverHost
    const daemonPort = server.port ?? opts.port
    const daemonUrl = `http://${daemonHost}:${daemonPort}`

    try {
      await verifyAgentEndpoint(daemonUrl, directory)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error("startup sanity check failed", { error: message })
      console.error(`Error: Failed to load agents (${message}).`)
      await server.stop().catch((stopErr) => {
        log.debug("failed to stop server after sanity check failure", { error: String(stopErr) })
      })
      await Daemon.releaseLock()
      process.exit(1)
    }

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

    // Initialize usage tracking
    let usageEnabled = false
    try {
      await UsageTracker.init()
      usageEnabled = true
      console.log("Usage:      Tracking enabled")
    } catch (error) {
      log.error("Failed to initialize usage tracking", {
        error: error instanceof Error ? error.message : String(error),
      })
      console.error(`Warning: Usage tracking initialization failed: ${error instanceof Error ? error.message : error}`)
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
      const gatewayForce = Boolean(args["gateway-force"])
      gatewayStarted = await GatewaySupervisor.start({
        force: gatewayForce,
        daemonUrl,
      })
      const gatewayState = GatewaySupervisor.getState()
      if (gatewayStarted) {
        console.log("Gateway:    Messaging gateway started")
      } else {
        const reason = gatewayState.error ?? "Not available"
        console.log(`Gateway:    Disabled (${reason})`)
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

      // Shutdown usage tracking
      if (usageEnabled) {
        await UsageTracker.shutdown()
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
      await Daemon.releaseLock()
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
    const usageStatus = usageEnabled ? "Active (SQLite)" : "Disabled"
    const weztermStatus = weztermEnabled ? "Active (status pane)" : args.wezterm ? "No display" : "Disabled"
    const gatewayState = GatewaySupervisor.getState()
    const gatewayStatus = gatewayStarted
      ? `Active (PID: ${gatewayState.pid})`
      : args.gateway
        ? `Disabled (${gatewayState.error ?? "not configured"})`
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
  Usage:       ${usageStatus}
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
    // Note: messaging is handled by the embedded Zee gateway (managed by the daemon)
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
  builder: (yargs) =>
    yargs.option("keep-gateway", {
      type: "boolean",
      default: false,
      describe: "Do not stop Zee gateway processes after daemon shutdown",
    }),
  handler: async (args) => {
    const keepGateway = Boolean(args["keep-gateway"])
    const state = await Daemon.readPidFile()

    if (!state) {
      console.log("No daemon PID file found")
      await stopDaemonProcesses("daemon-stop (pid missing)")
      if (!keepGateway) await stopGatewayProcesses("daemon-stop (pid missing)")
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
          await stopDaemonProcesses("daemon-stop (cleanup)")
          if (!keepGateway) await stopGatewayProcesses("daemon-stop (graceful)")
          return
        }
        attempts++
      }

      // Force kill if still running
      console.log("Daemon did not stop gracefully, sending SIGKILL")
      process.kill(state.pid, "SIGKILL")
      await Daemon.removePidFile()
      await Daemon.releaseLock()
      await stopDaemonProcesses("daemon-stop (forced)")
      if (!keepGateway) await stopGatewayProcesses("daemon-stop (forced)")
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ESRCH") {
        console.log("Daemon process not found, cleaning up PID file")
        await Daemon.removePidFile()
        await Daemon.releaseLock()
        await stopDaemonProcesses("daemon-stop (pid missing)")
        if (!keepGateway) await stopGatewayProcesses("daemon-stop (pid missing)")
      } else {
        throw e
      }
    }
  },
})

export const GatewayStatusCommand = cmd({
  command: "gateway-status",
  describe: "Check Zee gateway configuration and reachability",
  handler: async () => {
    const preflight = await GatewaySupervisor.preflight({ force: true })
    const zeeDir = Zee.repo()
    const port = getGatewayPort()
    const portOpen = await isPortOpen("127.0.0.1", port)
    const processes = listGatewayProcesses()
    const gatewayState = GatewaySupervisor.getState()

    console.log("Zee Gateway Status")
    console.log(`  Repo:      ${preflight.repoExists ? zeeDir : `Missing (${zeeDir})`}`)
    console.log(`  Config:    ${preflight.configPath ?? "Not found"}`)
    console.log(`  pnpm:      ${preflight.pnpmAvailable ? "Found" : "Missing"}`)
    console.log(`  Port:      ${port} (${portOpen ? "listening" : "closed"})`)
    console.log(`  Daemon:    ${gatewayState.daemonUrl ?? "unknown"}`)
    console.log(`  Enabled:   ${gatewayState.enabled ? "yes" : "no"}`)
    console.log(`  Env:       ${preflight.envHints.length ? preflight.envHints.join(", ") : "none"}`)

    if (processes.length > 0) {
      console.log("  Processes:")
      for (const proc of processes) {
        console.log(`    ${proc.pid} ${proc.cmd}`)
      }
    } else {
      console.log("  Processes: none")
    }

    const issues = [...preflight.issues, ...preflight.warnings]
    if (issues.length > 0) {
      console.log("  Issues:")
      for (const issue of issues) {
        console.log(`    - ${issue}`)
      }
    }
  },
})
