/**
 * Daemon Setup Check
 *
 * Validates required infrastructure and credentials on daemon startup.
 * Provides clear error messages for common setup issues.
 */

import { Log } from "../util/log"
import { Global } from "../global"
import path from "path"
import fs from "fs/promises"
import net from "net"

const log = Log.create({ service: "setup-check" })

export interface SetupCheckResult {
  ok: boolean
  qdrant: {
    available: boolean
    url: string
    error?: string
  }
  googleApiKey: {
    available: boolean
    source?: "env:GEMINI_API_KEY" | "env:GOOGLE_API_KEY" | "auth.json"
    error?: string
  }
  warnings: string[]
  errors: string[]
}

const AUTH_JSON_PATH = path.join(Global.Path.data, "auth.json")

/**
 * Check if Qdrant is reachable at the given URL
 */
async function checkQdrantConnectivity(url: string): Promise<{ available: boolean; error?: string }> {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname
    const port = Number.parseInt(parsed.port || "6333", 10)

    return new Promise((resolve) => {
      const socket = new net.Socket()
      const timeout = setTimeout(() => {
        socket.destroy()
        resolve({ available: false, error: "Connection timeout (3s)" })
      }, 3000)

      socket.once("connect", () => {
        clearTimeout(timeout)
        socket.end()
        resolve({ available: true })
      })

      socket.once("error", (err) => {
        clearTimeout(timeout)
        const code = (err as NodeJS.ErrnoException).code
        const errorMsg = code === "ECONNREFUSED"
          ? "Connection refused"
          : code === "ENOTFOUND"
            ? "Host not found"
            : err.message || code || "Connection failed"
        resolve({ available: false, error: errorMsg })
      })

      socket.connect(port, host)
    })
  } catch (err) {
    return { available: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Check if Google API key is available from any source
 */
async function checkGoogleApiKey(): Promise<{
  available: boolean
  source?: "env:GEMINI_API_KEY" | "env:GOOGLE_API_KEY" | "auth.json"
  error?: string
}> {
  if (process.env.GEMINI_API_KEY?.trim()) {
    return { available: true, source: "env:GEMINI_API_KEY" }
  }

  if (process.env.GOOGLE_API_KEY?.trim()) {
    return { available: true, source: "env:GOOGLE_API_KEY" }
  }

  try {
    const content = await fs.readFile(AUTH_JSON_PATH, "utf-8")
    const auth = JSON.parse(content)
    if (auth.google?.key || auth.google?.type === "api") {
      return { available: true, source: "auth.json" }
    }
  } catch {
    // auth.json doesn't exist or can't be read
  }

  return {
    available: false,
    error: "No Google API key found. Set GEMINI_API_KEY or GOOGLE_API_KEY, or store in auth.json",
  }
}

/**
 * Get the default Qdrant URL
 */
function getQdrantUrl(): string {
  const configUrl = process.env.QDRANT_URL?.trim()
  if (configUrl) return configUrl

  // Try to read from config file
  const configPath = path.join(Global.Path.config, "agent-core.jsonc")
  try {
    const content = require("fs").readFileSync(configPath, "utf-8")
    // Simple regex to extract qdrant URL - not full JSONC parser
    const match = content.match(/"qdrantUrl"\s*:\s*"([^"]+)"/)
    if (match?.[1]) return match[1]
  } catch {
    // Config file doesn't exist
  }

  return "http://localhost:6333"
}

/**
 * Run all setup checks and return results
 */
export async function runSetupCheck(): Promise<SetupCheckResult> {
  const warnings: string[] = []
  const errors: string[] = []

  const qdrantUrl = getQdrantUrl()
  const qdrantCheck = await checkQdrantConnectivity(qdrantUrl)
  const googleCheck = await checkGoogleApiKey()

  if (!qdrantCheck.available) {
    errors.push(`Qdrant not available at ${qdrantUrl}: ${qdrantCheck.error}`)
    errors.push("  Run: docker compose up -d   OR   agent-core setup")
  }

  if (!googleCheck.available) {
    errors.push("Google API key not found (required for embeddings)")
    errors.push("  Set GEMINI_API_KEY or GOOGLE_API_KEY in your environment, or")
    errors.push(`  Store in: ${AUTH_JSON_PATH}`)
    errors.push('  Format: {"google":{"type":"api","key":"YOUR_KEY"}}')
  }

  const ok = qdrantCheck.available && googleCheck.available

  const result: SetupCheckResult = {
    ok,
    qdrant: {
      available: qdrantCheck.available,
      url: qdrantUrl,
      error: qdrantCheck.error,
    },
    googleApiKey: {
      available: googleCheck.available,
      source: googleCheck.source,
      error: googleCheck.error,
    },
    warnings,
    errors,
  }

  if (ok) {
    log.info("Setup check passed", {
      qdrantUrl,
      googleSource: googleCheck.source,
    })
  } else {
    log.warn("Setup check failed", { errors })
  }

  return result
}

/**
 * Format setup check result for console output
 */
export function formatSetupCheckResult(result: SetupCheckResult): string {
  const lines: string[] = []

  lines.push("Setup Check")
  lines.push("===========")

  // Qdrant status
  if (result.qdrant.available) {
    lines.push(`Qdrant:   OK (${result.qdrant.url})`)
  } else {
    lines.push(`Qdrant:   MISSING (${result.qdrant.url})`)
    lines.push(`          ${result.qdrant.error}`)
  }

  // Google API key status
  if (result.googleApiKey.available) {
    lines.push(`Google:   OK (${result.googleApiKey.source})`)
  } else {
    lines.push("Google:   MISSING (API key for embeddings)")
  }

  lines.push("")

  // Summary
  if (result.ok) {
    lines.push("Status: Ready")
  } else {
    lines.push("Status: Setup required")
    lines.push("")
    for (const error of result.errors) {
      lines.push(error)
    }
  }

  return lines.join("\n")
}

/**
 * Run setup check and optionally exit if failed
 *
 * @param exitOnFail - If true, exit process on failure (default: false for graceful degradation)
 * @param verbose - If true, always print status (default: only on failure)
 */
export async function validateSetup(options: {
  exitOnFail?: boolean
  verbose?: boolean
} = {}): Promise<SetupCheckResult> {
  const result = await runSetupCheck()

  if (!result.ok || options.verbose) {
    console.log("")
    console.log(formatSetupCheckResult(result))
    console.log("")
  }

  if (!result.ok && options.exitOnFail) {
    process.exit(1)
  }

  return result
}
