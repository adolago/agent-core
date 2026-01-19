import { cmd } from "@/cli/cmd/cmd"
import { tui } from "./app"
import { Rpc } from "@/util/rpc"
import { type rpc } from "./worker"
import path from "path"
import { spawnSync } from "child_process"
import { UI } from "@/cli/ui"
import { iife } from "@/util/iife"
import { Log } from "@/util/log"
import { withNetworkOptions, resolveNetworkOptions, type NetworkOptions } from "@/cli/network"
import { Daemon } from "@/cli/cmd/daemon"
import { Config } from "@/config/config"
import type { Event } from "@opencode-ai/sdk/v2"
import type { EventSource } from "./context/sdk"

declare global {
  const OPENCODE_WORKER_PATH: string
}

type RpcClient = ReturnType<typeof Rpc.client<typeof rpc>>

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
    on: (handler) => client.on<Event>("event", handler),
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

function resolveDaemonUrl(network: NetworkOptions, state?: Daemon.DaemonState | null): string {
  if (process.env.AGENT_CORE_URL) return process.env.AGENT_CORE_URL
  const hostname = normalizeDaemonHost(state?.hostname ?? network.hostname)
  const port = state?.port ?? (network.port && network.port !== 0 ? network.port : DEFAULT_DAEMON_PORT)
  return `http://${hostname}:${port}`
}

async function checkDaemonHealth(url: string): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1500)
  try {
    const response = await fetch(`${url}${DAEMON_HEALTH_PATH}`, { signal: controller.signal })
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

async function ensureDaemonRunning(
  network: NetworkOptions,
  _directory: string,
  options?: { systemdOnly?: boolean },
): Promise<string> {
  const systemdOnly = options?.systemdOnly ?? false
  const systemd = getSystemdServiceState()

  if (systemd.available && systemd.installed) {
    const url = resolveDaemonUrl(network, await Daemon.readPidFile())
    if (!systemd.active) {
      UI.error("Systemd service 'agent-core' is installed but not running.")
      UI.info("Start it with: sudo systemctl start agent-core")
      UI.info("Or run locally with: agent-core --no-daemon")
      process.exit(1)
    }
    if (await checkDaemonHealth(url)) return url
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
  const state = await Daemon.readPidFile()
  let url = resolveDaemonUrl(network, state)

  if (running) {
    if (await checkDaemonHealth(url)) return url
    const refreshed = await Daemon.readPidFile()
    url = resolveDaemonUrl(network, refreshed)
    if (await checkDaemonHealth(url)) return url
    UI.error("Daemon appears to be running but is not healthy. Check `agent-core daemon-status`.")
    process.exit(1)
  }

  UI.error("Daemon is not running.")
  UI.info("Start it with: systemctl start agent-core")
  UI.info("If not installed: ./scripts/systemd/install.sh --polkit")
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
