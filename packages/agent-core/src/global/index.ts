import fs from "fs/promises"
import path from "path"
import os from "os"

const app = "agent-core"

// Compute XDG paths dynamically to support test isolation
// Tests set XDG_* env vars in preload.ts, so we must read them at access time
function getXdgDataHome() {
  return process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share")
}
function getXdgCacheHome() {
  return process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache")
}
function getXdgConfigHome() {
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config")
}
function getXdgStateHome() {
  return process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state")
}

export namespace Global {
  export const Path = {
    // Allow override for test isolation (AGENT_CORE_TEST_HOME preferred, OPENCODE_TEST_HOME for compat)
    get home() {
      return process.env.AGENT_CORE_TEST_HOME || process.env.OPENCODE_TEST_HOME || os.homedir()
    },
    get source() {
      return process.env.AGENT_CORE_SOURCE || path.join(this.home, ".local", "src", "agent-core")
    },
    get data() {
      return path.join(getXdgDataHome(), app)
    },
    get bin() {
      return path.join(this.data, "bin")
    },
    get log() {
      return path.join(this.data, "log")
    },
    get cache() {
      return path.join(getXdgCacheHome(), app)
    },
    get config() {
      return path.join(getXdgConfigHome(), app)
    },
    get state() {
      return path.join(getXdgStateHome(), app)
    },
    get tmp() {
        return path.join(os.tmpdir(), app)
    },
  }
}

await Promise.all([
  fs.mkdir(Global.Path.data, { recursive: true }),
  fs.mkdir(Global.Path.config, { recursive: true }),
  fs.mkdir(Global.Path.state, { recursive: true }),
  fs.mkdir(Global.Path.log, { recursive: true }),
  fs.mkdir(Global.Path.bin, { recursive: true }),
  fs.mkdir(Global.Path.tmp, { recursive: true }),
])

const CACHE_VERSION = "18"

const version = await Bun.file(path.join(Global.Path.cache, "version"))
  .text()
  .catch(() => "0")

if (version !== CACHE_VERSION) {
  try {
    const contents = await fs.readdir(Global.Path.cache)
    await Promise.all(
      contents.map((item) =>
        fs.rm(path.join(Global.Path.cache, item), {
          recursive: true,
          force: true,
        }),
      ),
    )
  } catch (e) {
    // Ignore ENOENT (cache dir doesn't exist) - expected on first run
    // Log other errors for debugging
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[agent-core] Cache cleanup failed:", e)
    }
  }
  await Bun.file(path.join(Global.Path.cache, "version")).write(CACHE_VERSION)
}
