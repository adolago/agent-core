// IMPORTANT: Set env vars BEFORE any imports from src/ directory
// xdg-basedir reads env vars at import time, so we must set these first
import os from "os"
import path from "path"
import fs from "fs/promises"
import fsSync from "fs"
import { afterAll, afterEach } from "bun:test"

const dir = path.join(os.tmpdir(), "opencode-test-data-" + process.pid)
await fs.mkdir(dir, { recursive: true })
afterAll(() => {
  fsSync.rmSync(dir, { recursive: true, force: true })
})
// Set test home directory to isolate tests from user's actual home directory
// This prevents tests from picking up real user configs/skills from ~/.claude/skills
const testHome = path.join(dir, "home")
await fs.mkdir(testHome, { recursive: true })
process.env["OPENCODE_TEST_HOME"] = testHome
process.env["AGENT_CORE_TEST_HOME"] = testHome

process.env["XDG_DATA_HOME"] = path.join(dir, "share")
process.env["XDG_CACHE_HOME"] = path.join(dir, "cache")
process.env["XDG_CONFIG_HOME"] = path.join(dir, "config")
process.env["XDG_STATE_HOME"] = path.join(dir, "state")

// Server auth breaks most unit tests (they don't send Authorization headers).
process.env["AGENT_CORE_DISABLE_SERVER_AUTH"] = "true"

// Pre-fetch models.json so tests don't need the macro fallback
// Also write the cache version file to prevent global/index.ts from clearing the cache
// Note: Must use "agent-core" to match Global.Path.cache which uses app = "agent-core"
const cacheDir = path.join(dir, "cache", "agent-core")
await fs.mkdir(cacheDir, { recursive: true })
await fs.writeFile(path.join(cacheDir, "version"), "16")
const response = await fetch("https://models.dev/api.json")
if (response.ok) {
  await fs.writeFile(path.join(cacheDir, "models.json"), await response.text())
} else {
  console.error(`[preload] Failed to fetch models.dev: ${response.status}`)
}
// Disable models.dev refresh to avoid race conditions during tests
process.env["OPENCODE_DISABLE_MODELS_FETCH"] = "true"

// Clear config override env vars to ensure clean test state
// These flags can override project config and interfere with permission tests
delete process.env["OPENCODE_PERMISSION"]
delete process.env["OPENCODE_CONFIG"]
delete process.env["OPENCODE_CONFIG_CONTENT"]
delete process.env["OPENCODE_CONFIG_DIR"]

// Clear provider env vars to ensure clean test state
delete process.env["ANTHROPIC_API_KEY"]
delete process.env["OPENAI_API_KEY"]
delete process.env["GOOGLE_API_KEY"]
delete process.env["GOOGLE_GENERATIVE_AI_API_KEY"]
delete process.env["AZURE_OPENAI_API_KEY"]
delete process.env["AWS_ACCESS_KEY_ID"]
delete process.env["AWS_PROFILE"]
delete process.env["AWS_REGION"]
delete process.env["AWS_BEARER_TOKEN_BEDROCK"]
delete process.env["OPENROUTER_API_KEY"]
delete process.env["GROQ_API_KEY"]
delete process.env["MISTRAL_API_KEY"]
delete process.env["PERPLEXITY_API_KEY"]
delete process.env["TOGETHER_API_KEY"]
delete process.env["XAI_API_KEY"]
delete process.env["DEEPSEEK_API_KEY"]
delete process.env["FIREWORKS_API_KEY"]
delete process.env["CEREBRAS_API_KEY"]
delete process.env["SAMBANOVA_API_KEY"]

// Now safe to import from src/
const { Log } = await import("../src/util/log")
const { Instance } = await import("../src/project/instance")
const { State } = await import("../src/project/state")
const { Config } = await import("../src/config/config")
const { GlobalBus } = await import("../src/bus/global")
const { Scheduler } = await import("../src/scheduler")
const { ProcessRegistry } = await import("../src/process/registry")
const { ServerState } = await import("../src/server/state")
const { CircuitBreaker } = await import("../src/provider/circuit-breaker")
const { ModelEquivalence } = await import("../src/provider/equivalence")
const { Storage } = await import("../src/storage/storage")
const { parser: bashParser } = await import("../src/tool/bash")
const { Ripgrep } = await import("../src/file/ripgrep")

Log.init({
  print: false,
  dev: true,
  level: "DEBUG",
})

// Clean up global state between tests to prevent state pollution
afterEach(async () => {
  // 1. Dispose all Instance contexts and their associated State
  await Instance.disposeAll()

  // 2. Clear any remaining State entries not tied to Instance
  State.clear()

  // 3. Reset Config.global lazy cache
  Config.global.reset()

  // 4. Clear GlobalBus listeners to prevent cross-test event handling
  GlobalBus.removeAllListeners()

  // 5. Clear Scheduler global registry
  Scheduler.resetGlobal()

  // 6. Shutdown ProcessRegistry singleton
  ProcessRegistry.getInstance().shutdown()

  // 7. Reset ServerState URL
  ServerState.reset()

  // 8. Reset CircuitBreaker state
  await CircuitBreaker.resetAll()

  // 9. Reset ModelEquivalence tier configuration
  ModelEquivalence.reset()

  // 10. Reset Storage lazy cache (prevents cross-test state pollution)
  Storage.state.reset()

  // 11. Reset Server.App lazy cache (Hono app instance) - import dynamically to avoid circular deps
  const { Server } = await import("../src/server/server")
  Server.App.reset()

  // 12. Reset Bash parser lazy cache (tree-sitter)
  bashParser.reset()

  // 13. Reset Ripgrep state lazy cache
  Ripgrep.state.reset()
})
