import { cmd } from "@/cli/cmd/cmd"
import { tui } from "./app"
import { Rpc } from "@/util/rpc"
import { type rpc } from "./worker"
import path from "path"
import { spawn, spawnSync } from "child_process"
import { UI } from "@/cli/ui"
import { iife } from "@/util/iife"
import { Log } from "@/util/log"
import { withNetworkOptions, resolveNetworkOptions, type ResolvedNetworkOptions } from "@/cli/network"
import { Daemon } from "@/cli/cmd/daemon"
import { Config } from "@/config/config"
import { createAuthorizedFetch } from "@/server/auth"
import type { EventSource } from "./context/sdk"

declare global {
  const OPENCODE_WORKER_PATH: string
}

type RpcClient = ReturnType<typeof Rpc.client<typeof rpc>>
type AppEvent = { type: string; properties: any }

function createWorkerFetch(client: RpcClient): typeof fetch {
  const fn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    const body = request.body ? await request.text() : undefined
    const result = await client.call("fetch", {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
    })
    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    })
  }
  return fn as typeof fetch
}

function createEventSource(client: RpcClient): EventSource {
  return {
    on: (handler) => client.on<AppEvent>("event", handler),
  }
}

const DEFAULT_DAEMON_PORT = 3210
const DAEMON_HEALTH_PATH = "/global/health"

type SystemdServiceState = {
  available: boolean
  installed: boolean
  active: boolean
  status?: string
}

function normalizeDaemonHost(hostname?: string): string {
  if (!hostname || hostname === "0.0.0.0") return "127.0.0.1"
  return hostname
}

function getSystemdServiceState(): SystemdServiceState {
  if (process.platform !== "linux") {
    return { available: false, installed: false, active: false }
  }
  try {
    const result = spawnSync("systemctl", ["is-active", "agent-core"], {
      encoding: "utf-8",
    })
    if (result.error) {
      return { available: false, installed: false, active: false }
    }
    const stdout = (result.stdout ?? "").trim()
    const stderr = (result.stderr ?? "").trim()
    if (result.status === 0) {
      return { available: true, installed: true, active: true, status: stdout || stderr }
    }
    if (result.status === 3) {
      return { available: true, installed: true, active: false, status: stdout || stderr }
    }
    if (result.status === 4) {
      return { available: true, installed: false, active: false, status: stdout || stderr }
    }
    return { available: true, installed: true, active: false, status: stdout || stderr }
  } catch {
    return { available: false, installed: false, active: false }
  }
}

function resolveDaemonUrl(network: ResolvedNetworkOptions, state?: Daemon.DaemonState | null): string {
  if (process.env.AGENT_CORE_URL) return process.env.AGENT_CORE_URL
  const hostname = normalizeDaemonHost(state?.hostname ?? network.hostname)
  const port = state?.port ?? (network.port && network.port !== 0 ? network.port : DEFAULT_DAEMON_PORT)
  return `http://${hostname}:${port}`
}

async function checkDaemonHealth(url: string): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1500)
  try {
    const authorizedFetch = createAuthorizedFetch(fetch)
    const response = await authorizedFetch(`${url}${DAEMON_HEALTH_PATH}`, { signal: controller.signal })
    if (!response.ok) return false
    const data = await response.json().catch(() => undefined)
    if (data && typeof data === "object" && "healthy" in data) {
      return Boolean((data as { healthy?: boolean }).healthy)
    }
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function waitForHealthy(resolveUrl: () => Promise<string>, timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const url = await resolveUrl()
    if (await checkDaemonHealth(url)) return url
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return null
}

function attemptSystemctlStart(): { ok: boolean; details?: string } {
  const result = spawnSync("systemctl", ["--no-ask-password", "start", "agent-core"], { encoding: "utf-8" })
  if (result.status === 0) return { ok: true }

  const stdout = (result.stdout ?? "").trim()
  const stderr = (result.stderr ?? "").trim()
  const details = stderr || stdout

  const sudoResult = spawnSync("sudo", ["-n", "systemctl", "start", "agent-core"], { encoding: "utf-8" })
  if (sudoResult.status === 0) return { ok: true }

  const sudoStdout = (sudoResult.stdout ?? "").trim()
  const sudoStderr = (sudoResult.stderr ?? "").trim()
  const sudoDetails = sudoStderr || sudoStdout

  return { ok: false, details: sudoDetails || details }
}

function spawnLocalDaemon(hostname: string, port: number, directory: string): boolean {
  try {
    const child = spawn(
      "agent-core",
      ["daemon", "--hostname", hostname, "--port", port.toString(), "--directory", directory],
      {
        detached: true,
        stdio: "ignore",
        env: process.env,
      },
    )
    if (!child.pid) return false
    child.unref()
    return true
  } catch {
    return false
  }
}

async function ensureDaemonRunning(
  network: ResolvedNetworkOptions,
  directory: string,
  options?: { systemdOnly?: boolean },
): Promise<string> {
  const systemdOnly = options?.systemdOnly ?? false
  const explicitUrl = process.env.AGENT_CORE_URL?.trim()

  if (explicitUrl) {
    const url = resolveDaemonUrl(network)
    if (await checkDaemonHealth(url)) return url
    UI.error("AGENT_CORE_URL is set but the daemon is unreachable or unauthorized.")
    UI.info("Unset AGENT_CORE_URL to use the local daemon/systemd service.")
    process.exit(1)
  }

  const systemd = getSystemdServiceState()

  const resolveUrl = async () => resolveDaemonUrl(network, await Daemon.readPidFile())

  if (systemd.available && systemd.installed) {
    if (!systemd.active) {
      UI.info("Starting systemd service 'agent-core'...")
      const started = attemptSystemctlStart()
      if (!started.ok) {
        UI.error("Failed to start systemd service 'agent-core'.")
        if (started.details) UI.info(started.details)
        UI.info("Try: sudo systemctl start agent-core")
        UI.info("Or run locally with: agent-core --no-daemon")
        process.exit(1)
      }
    }

    const url = await waitForHealthy(resolveUrl, 8000)
    if (url) return url

    UI.error("Systemd service 'agent-core' is active but the daemon is unhealthy.")
    UI.info("Check: systemctl status agent-core")
    UI.info("Logs:  journalctl -u agent-core -f")
    process.exit(1)
  }

  if (systemdOnly) {
    UI.error("Daemon spawning is disabled by config (daemon.systemd_only).")
    UI.info("Start the systemd service or run with: agent-core --no-daemon")
    process.exit(1)
  }

  const running = await Daemon.isRunning()
  let url = await resolveUrl()

  if (running) {
    if (await checkDaemonHealth(url)) return url
    url = await resolveUrl()
    if (await checkDaemonHealth(url)) return url
    UI.error("Daemon appears to be running but is not healthy. Check `agent-core daemon-status`.")
    process.exit(1)
  }

  const hostname = normalizeDaemonHost(network.hostname)
  const port = network.port && network.port !== 0 ? network.port : DEFAULT_DAEMON_PORT

  UI.info("Daemon is not running. Starting it now...")
  const spawned = spawnLocalDaemon(hostname, port, directory)
  if (!spawned) {
    UI.error("Failed to spawn daemon process.")
    UI.info("Try: agent-core daemon")
    UI.info("Or run locally with: agent-core --no-daemon")
    process.exit(1)
  }

  const startedUrl = await waitForHealthy(resolveUrl, 8000)
  if (startedUrl) return startedUrl

  UI.error("Daemon failed to become healthy after starting.")
  UI.info("Check: agent-core daemon-status")
  UI.info("Or run foreground for logs: agent-core daemon")
  process.exit(1)
}

export const TuiThreadCommand = cmd({
  command: "$0 [project]",
  describe: "start agent-core tui",
  builder: (yargs) =>
    withNetworkOptions(yargs)
      .positional("project", {
        type: "string",
        describe: "path to start agent-core in",
      })
      .option("model", {
        type: "string",
        alias: ["m"],
        describe: "model to use in the format of provider/model",
      })
      .option("continue", {
        alias: ["c"],
        describe: "continue the last session",
        type: "boolean",
      })
      .option("session", {
        alias: ["s"],
        type: "string",
        describe: "session id to continue",
      })
      .option("prompt", {
        type: "string",
        describe: "prompt to use",
      })
      .option("agent", {
        type: "string",
        describe: "agent to use",
      })
      .option("daemon", {
        type: "boolean",
        default: true,
        describe: "start or attach to the agent-core daemon (tiara; gateway is opt-in)",
      }),
  handler: async (args) => {
    // Use AGENT_CORE_ORIGINAL_PWD if set (from launcher script), otherwise PWD or cwd
    const baseCwd = process.env.AGENT_CORE_ORIGINAL_PWD ?? process.env.PWD ?? process.cwd()
    const cwd = args.project ? path.resolve(baseCwd, args.project) : baseCwd
    const localWorker = new URL("./worker.ts", import.meta.url)
    const distWorker = new URL("./cli/cmd/tui/worker.js", import.meta.url)
    const workerPath = await iife(async () => {
      if (typeof OPENCODE_WORKER_PATH !== "undefined") return OPENCODE_WORKER_PATH
      if (await Bun.file(distWorker).exists()) return distWorker
      return localWorker
    })
    try {
      process.chdir(cwd)
    } catch (e) {
      UI.error("Failed to change directory to " + cwd)
      return
    }

    let systemdOnly = false
    if (args.daemon) {
      try {
        const config = await Config.get()
        systemdOnly = Boolean(config.daemon?.systemd_only)
      } catch (error) {
        Log.Default.debug("Failed to load config for daemon policy", {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const prompt = await iife(async () => {
      const piped = !process.stdin.isTTY ? await Bun.stdin.text() : undefined
      if (!args.prompt) return piped
      return piped ? piped + "\n" + args.prompt : args.prompt
    })

    const networkOpts = await resolveNetworkOptions(args)
    let url: string
    let customFetch: typeof fetch | undefined
    let events: EventSource | undefined
    let onExit: (() => Promise<void>) | undefined
    let client: RpcClient | undefined

    if (args.daemon) {
      url = await ensureDaemonRunning(networkOpts, cwd, {
        systemdOnly,
      })
    } else {
      const worker = new Worker(workerPath, {
        env: Object.fromEntries(
          Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
        ),
      })
      worker.onerror = (e) => {
        Log.Default.error(e.message, { error: e.error })
      }
      client = Rpc.client<typeof rpc>(worker)
      process.on("uncaughtException", (e) => {
        Log.Default.error(e.message, { error: e })
      })
      process.on("unhandledRejection", (e) => {
        Log.Default.error(e instanceof Error ? e.message : String(e), { error: e })
      })
      process.on("SIGUSR2", async () => {
        await client?.call("reload", undefined)
      })

      // Use direct RPC communication (no HTTP)
      url = "http://opencode.internal"
      customFetch = createWorkerFetch(client)
      events = createEventSource(client)
      onExit = async () => {
        await client?.call("shutdown", undefined)
      }

      setTimeout(() => {
        client?.call("checkUpgrade", { directory: cwd }).catch(() => {})
      }, 1000)
    }

    const tuiPromise = tui({
      url,
      directory: cwd,
      fetch: customFetch,
      events,
      args: {
        continue: args.continue,
        sessionID: args.session,
        agent: args.agent,
        model: args.model,
        prompt,
      },
      onExit,
    })

    await tuiPromise
  },
})
