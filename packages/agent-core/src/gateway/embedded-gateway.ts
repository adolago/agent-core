import { Log } from "../util/log"

import { loadConfig, readConfigFileSnapshot, resolveGatewayPort } from "../../../personas/zee/src/config/config"
import { startGatewayServer, type GatewayServer } from "../../../personas/zee/src/gateway/server"
import { acquireGatewayLock, type GatewayLockHandle } from "../../../personas/zee/src/infra/gateway-lock"

const log = Log.create({ service: "gateway:embedded" })

export type EmbeddedGatewayState = {
  running: boolean
  port?: number
  pid?: number
  lockPath?: string
  lockConfigPath?: string
}

export type EmbeddedGatewayConfigSnapshot = Awaited<ReturnType<typeof readConfigFileSnapshot>>

type EmbeddedGatewayStartOptions = {
  port?: number
  daemonUrl?: string
}

let gatewayServer: GatewayServer | null = null
let gatewayLock: GatewayLockHandle | null = null
let gatewayPort: number | undefined
let injectedAgentCoreUrl = false
let previousAgentCoreUrl: string | undefined

function maybeInjectAgentCoreUrl(daemonUrl?: string) {
  if (!daemonUrl) return
  if (process.env.AGENT_CORE_URL?.trim()) return
  previousAgentCoreUrl = process.env.AGENT_CORE_URL
  process.env.AGENT_CORE_URL = daemonUrl
  injectedAgentCoreUrl = true
}

function restoreAgentCoreUrl() {
  if (!injectedAgentCoreUrl) return
  if (previousAgentCoreUrl) {
    process.env.AGENT_CORE_URL = previousAgentCoreUrl
  } else {
    delete process.env.AGENT_CORE_URL
  }
  injectedAgentCoreUrl = false
  previousAgentCoreUrl = undefined
}

export function resolveEmbeddedGatewayPort(): number {
  const cfg = loadConfig()
  return resolveGatewayPort(cfg)
}

export async function readEmbeddedGatewayConfigSnapshot(): Promise<EmbeddedGatewayConfigSnapshot> {
  return await readConfigFileSnapshot()
}

export async function startEmbeddedGateway(options: EmbeddedGatewayStartOptions = {}): Promise<void> {
  if (gatewayServer) return

  maybeInjectAgentCoreUrl(options.daemonUrl)

  const port = options.port ?? resolveEmbeddedGatewayPort()
  gatewayPort = port

  gatewayLock = await acquireGatewayLock()
  try {
    gatewayServer = await startGatewayServer(port)
    log.info("embedded gateway started", { port })
  } catch (error) {
    await gatewayLock?.release().catch(() => undefined)
    gatewayLock = null
    restoreAgentCoreUrl()
    throw error
  }
}

export async function stopEmbeddedGateway(options: { reason?: string } = {}): Promise<void> {
  const reason = options.reason ?? "gateway stopping"
  const port = gatewayPort

  if (gatewayServer) {
    try {
      await gatewayServer.close({ reason, restartExpectedMs: null })
    } catch (error) {
      log.warn("embedded gateway shutdown error", { error: String(error), port })
    } finally {
      gatewayServer = null
    }
  }

  await gatewayLock?.release().catch(() => undefined)
  gatewayLock = null
  restoreAgentCoreUrl()
}

export function getEmbeddedGatewayState(): EmbeddedGatewayState {
  return {
    running: gatewayServer !== null,
    port: gatewayPort,
    pid: gatewayServer ? process.pid : undefined,
    lockPath: gatewayLock?.lockPath,
    lockConfigPath: gatewayLock?.configPath,
  }
}
