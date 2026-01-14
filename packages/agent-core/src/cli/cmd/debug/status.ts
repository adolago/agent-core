import { cmd } from "../cmd"
import { bootstrap } from "../../bootstrap"
import { Installation } from "../../../installation"
import { Config } from "../../../config/config"
import { Global } from "../../../global"
import { Flag } from "../../../flag/flag"
import fs from "fs/promises"
import path from "path"
import net from "net"
import { Zee } from "../../../paths"

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

export const StatusCommand = cmd({
  command: "status",
  describe: "show agent-core system status and diagnostics",
  builder: (yargs) =>
    yargs
      .option("json", {
        type: "boolean",
        default: false,
        describe: "output as JSON",
      })
      .option("verbose", {
        alias: "v",
        type: "boolean",
        default: false,
        describe: "show verbose details",
      }),
  async handler(args) {
    await bootstrap(process.cwd(), async () => {
      const status = await collectStatus(args.verbose)

      if (args.json) {
        console.log(JSON.stringify(status, null, 2))
        return
      }

      printStatus(status, args.verbose)
    })
  },
})

interface SystemStatus {
  version: string
  binary: {
    path: string
    exists: boolean
    modifiedAt?: string
    modifiedTs?: number
  }
  daemon: {
    running: boolean
    pid?: number
    port?: number
    version?: string
    healthy?: boolean
    error?: string
  }
  processes: Array<{
    pid: number
    type: string
    cmd: string
  }>
  tools: {
    directories: string[]
    loaded: string[]
  }
  config: {
    directories: string[]
    provider?: string
    model?: string
  }
  gateway: {
    configured: boolean
    port: number
    listening: boolean
    configPath?: string
    envHints: string[]
    processes: Array<{
      pid: number
      cmd: string
    }>
    issues: string[]
  }
  sources: Array<{
    file: string
    modifiedAt: string
    modifiedTs: number
    newerThanBinary: boolean
  }>
  issues: string[]
}

async function collectStatus(verbose: boolean): Promise<SystemStatus> {
  const status: SystemStatus = {
    version: Installation.VERSION,
    binary: {
      path: process.execPath,
      exists: false,
    },
    daemon: {
      running: false,
    },
    processes: [],
    tools: {
      directories: [],
      loaded: [],
    },
    config: {
      directories: [],
    },
    gateway: {
      configured: false,
      port: 18789,
      listening: false,
      envHints: [],
      processes: [],
      issues: [],
    },
    sources: [],
    issues: [],
  }

  // Binary info
  const binaryPath = path.join(process.env.HOME || "", "bin", "agent-core")
  try {
    const stat = await fs.stat(binaryPath)
    status.binary = {
      path: binaryPath,
      exists: true,
      modifiedAt: stat.mtime.toISOString(),
      modifiedTs: stat.mtime.getTime(),
    }
  } catch {
    status.binary = { path: binaryPath, exists: false }
    status.issues.push("Binary not found at ~/bin/agent-core")
  }

  // Check for running processes
  try {
    const { execSync } = await import("child_process")
    const psOutput = execSync("pgrep -af agent-core 2>/dev/null || true", { encoding: "utf-8" })
    const lines = psOutput.trim().split("\n").filter(Boolean)

    for (const line of lines) {
      const match = line.match(/^(\d+)\s+(.*)$/)
      if (!match) continue
      const pid = parseInt(match[1])
      const cmd = match[2]

      // Skip ourselves and grep
      if (cmd.includes("pgrep") || cmd.includes("status")) continue

      let type = "unknown"
      if (cmd.includes("daemon")) type = "daemon"
      else if (cmd.includes("print-logs") || cmd.match(/\/bin\/agent-core$/)) type = "tui"

      status.processes.push({ pid, type, cmd })

      if (type === "daemon") {
        status.daemon.running = true
        status.daemon.pid = pid
      }
    }
  } catch {
    // Ignore process check errors
  }

  // Daemon health check
  const daemonPort = parseInt(process.env.AGENT_CORE_PORT || "3210")
  const daemonHost = process.env.AGENT_CORE_HOST || "127.0.0.1"
  status.daemon.port = daemonPort

  try {
    const response = await fetch(`http://${daemonHost}:${daemonPort}/global/health`, {
      signal: AbortSignal.timeout(2000),
    })
    if (response.ok) {
      const health = (await response.json()) as { healthy: boolean; version: string }
      status.daemon.healthy = health.healthy
      status.daemon.version = health.version

      // Check version mismatch
      if (health.version !== Installation.VERSION) {
        status.issues.push(
          `Daemon version (${health.version}) differs from binary (${Installation.VERSION}) - restart needed`,
        )
      }
    }
  } catch (e) {
    status.daemon.healthy = false
    status.daemon.error = e instanceof Error ? e.message : String(e)
    if (status.daemon.running) {
      status.issues.push("Daemon process running but health check failed")
    }
  }

  // Gateway status
  const gatewayPort = getGatewayPort()
  status.gateway.port = gatewayPort
  status.gateway.envHints = getGatewayEnvHints()
  status.gateway.configPath = await findZeeConfig()
  status.gateway.configured = Boolean(status.gateway.configPath || status.gateway.envHints.length > 0)

  try {
    status.gateway.listening = await isPortOpen("127.0.0.1", gatewayPort)
  } catch {
    status.gateway.listening = false
  }

  try {
    const { execSync } = await import("child_process")
    const gatewayOutput = execSync('pgrep -af "zee.*gateway" 2>/dev/null || true', { encoding: "utf-8" })
    const lines = gatewayOutput.trim().split("\n").filter(Boolean)
    status.gateway.processes = lines
      .map((line) => {
        const match = line.match(/^(\d+)\s+(.*)$/)
        if (!match) return null
        const cmd = match[2]
        if (cmd.includes("pgrep")) return null
        return { pid: Number.parseInt(match[1], 10), cmd }
      })
      .filter((entry): entry is { pid: number; cmd: string } => Boolean(entry))
  } catch {
    // Ignore gateway process check errors
  }

  if (status.gateway.configured && !status.gateway.listening) {
    status.gateway.issues.push("Gateway configured but not listening")
    status.issues.push("Gateway configured but not listening")
  }

  // Tool directories
  const configDirs = await Config.directories()
  status.config.directories = configDirs

  for (const dir of configDirs) {
    const toolDir = path.join(dir, "tool")
    try {
      const files = await fs.readdir(toolDir)
      const tsFiles = files.filter((f) => f.endsWith(".ts") || f.endsWith(".js"))
      if (tsFiles.length > 0) {
        status.tools.directories.push(toolDir)
        status.tools.loaded.push(...tsFiles.map((f) => path.join(toolDir, f)))
      }
    } catch {
      // Tool directory doesn't exist, that's fine
    }
  }

  // Check source file timestamps (for rebuild detection)
  if (verbose && status.binary.modifiedTs) {
    const srcRoot = path.join(Global.Path.source, "packages", "agent-core", "src")
    const keyFiles = ["provider/transform.ts", "provider/provider.ts", "server/server.ts"]

    for (const file of keyFiles) {
      const fullPath = path.join(srcRoot, file)
      try {
        const stat = await fs.stat(fullPath)
        const newerThanBinary = stat.mtime.getTime() > status.binary.modifiedTs!
        status.sources.push({
          file,
          modifiedAt: stat.mtime.toISOString(),
          modifiedTs: stat.mtime.getTime(),
          newerThanBinary,
        })

        if (newerThanBinary) {
          status.issues.push(`Source ${file} is newer than binary - rebuild needed`)
        }
      } catch {
        // File doesn't exist
      }
    }
  }

  // Config info
  try {
    const config = await Config.get()
    // config.model is a string in format "provider/model", e.g. "anthropic/claude-2"
    if (config.model) {
      const [providerPart, modelPart] = config.model.split("/")
      status.config.provider = providerPart
      status.config.model = modelPart || config.model
    }
  } catch {
    // Ignore config errors
  }

  return status
}

function printStatus(status: SystemStatus, verbose: boolean) {
  const GREEN = "\x1b[32m"
  const RED = "\x1b[31m"
  const YELLOW = "\x1b[33m"
  const BLUE = "\x1b[34m"
  const DIM = "\x1b[2m"
  const RESET = "\x1b[0m"

  const ok = (s: string) => `${GREEN}✓${RESET} ${s}`
  const err = (s: string) => `${RED}✗${RESET} ${s}`
  const warn = (s: string) => `${YELLOW}!${RESET} ${s}`

  console.log("")
  console.log("═══════════════════════════════════════════════════════════════")
  console.log("                    AGENT-CORE STATUS")
  console.log("═══════════════════════════════════════════════════════════════")
  console.log("")

  // Version
  console.log(`${BLUE}Version:${RESET} ${status.version}`)
  console.log("")

  // Binary
  console.log(`${BLUE}Binary:${RESET}`)
  if (status.binary.exists) {
    console.log(`  ${ok(`${status.binary.path}`)}`)
    if (status.binary.modifiedAt) {
      console.log(`  ${DIM}Modified: ${new Date(status.binary.modifiedAt).toLocaleString()}${RESET}`)
    }
  } else {
    console.log(`  ${err("Not found at " + status.binary.path)}`)
  }
  console.log("")

  // Processes
  console.log(`${BLUE}Processes:${RESET}`)
  if (status.processes.length === 0) {
    console.log(`  ${warn("No agent-core processes running")}`)
  } else {
    for (const proc of status.processes) {
      const typeLabel = proc.type.charAt(0).toUpperCase() + proc.type.slice(1)
      console.log(`  ${ok(`${typeLabel}: PID ${proc.pid}`)}`)
      if (verbose) {
        console.log(`    ${DIM}${proc.cmd}${RESET}`)
      }
    }
  }
  console.log("")

  // Daemon
  console.log(`${BLUE}Daemon:${RESET}`)
  console.log(`  Port: ${status.daemon.port}`)
  if (status.daemon.healthy) {
    console.log(`  ${ok(`Healthy (version: ${status.daemon.version})`)}`)
  } else if (status.daemon.running) {
    console.log(`  ${warn("Process running but not healthy")}`)
    if (status.daemon.error) {
      console.log(`  ${DIM}Error: ${status.daemon.error}${RESET}`)
    }
  } else {
    console.log(`  ${err("Not running")}`)
  }
  console.log("")

  // Gateway
  console.log(`${BLUE}Gateway:${RESET}`)
  console.log(`  Port: ${status.gateway.port}`)
  if (status.gateway.listening) {
    console.log(`  ${ok("Listening")}`)
  } else if (status.gateway.configured) {
    console.log(`  ${warn("Configured but not listening")}`)
  } else {
    console.log(`  ${warn("Not configured")}`)
  }
  if (status.gateway.configPath) {
    console.log(`  Config: ${status.gateway.configPath}`)
  }
  if (status.gateway.envHints.length > 0) {
    console.log(`  Env: ${status.gateway.envHints.join(", ")}`)
  }
  if (verbose) {
    if (status.gateway.processes.length > 0) {
      console.log("  Processes:")
      for (const proc of status.gateway.processes) {
        console.log(`    ${DIM}${proc.pid} ${proc.cmd}${RESET}`)
      }
    } else {
      console.log(`  ${DIM}Processes: none${RESET}`)
    }
  }
  console.log("")

  // Tools
  console.log(`${BLUE}Tools:${RESET}`)
  if (status.tools.directories.length === 0) {
    console.log(`  ${warn("No tool directories found")}`)
  } else {
    for (const dir of status.tools.directories) {
      const tools = status.tools.loaded.filter((t) => t.startsWith(dir))
      console.log(`  ${ok(dir)} (${tools.length} tools)`)
      if (verbose) {
        for (const tool of tools) {
          console.log(`    ${DIM}- ${path.basename(tool)}${RESET}`)
        }
      }
    }
  }
  console.log("")

  // Source timestamps (verbose only)
  if (verbose && status.sources.length > 0) {
    console.log(`${BLUE}Sources:${RESET}`)
    for (const src of status.sources) {
      const modified = new Date(src.modifiedAt).toLocaleTimeString()
      if (src.newerThanBinary) {
        console.log(`  ${warn(`${src.file} (${modified}) - NEWER than binary`)}`)
      } else {
        console.log(`  ${ok(`${src.file} (${modified})`)}`)
      }
    }
    console.log("")
  }

  // Issues
  if (status.issues.length > 0) {
    console.log(`${BLUE}Issues:${RESET}`)
    for (const issue of status.issues) {
      console.log(`  ${err(issue)}`)
    }
    console.log("")
  }

  console.log("═══════════════════════════════════════════════════════════════")

  // Quick fix suggestions
  if (status.issues.length > 0) {
    console.log("")
    console.log(`${BLUE}Quick fixes:${RESET}`)
    if (status.issues.some((i) => i.includes("rebuild"))) {
      console.log(`  Rebuild: ${Global.Path.source}/scripts/reload.sh`)
    }
    if (status.issues.some((i) => i.includes("restart"))) {
      console.log(`  Restart: ${Global.Path.source}/scripts/reload.sh --no-build`)
    }
  }
}

function getGatewayPort(): number {
  const portRaw = Number.parseInt(process.env.ZEE_GATEWAY_PORT || "", 10)
  return Number.isFinite(portRaw) ? portRaw : 18789
}

function getGatewayEnvHints(): string[] {
  return GATEWAY_ENV_HINTS.filter((key) => Boolean(process.env[key]?.trim()))
}

async function findZeeConfig(): Promise<string | undefined> {
  const candidates = ["zee.json", "zee.jsonc"].map((file) => path.join(Zee.dataDir(), file))
  for (const candidate of candidates) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // Ignore missing config path
    }
  }
  return undefined
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
