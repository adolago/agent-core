import { BusEvent } from "@/bus/bus-event"
import path from "path"
import { $ } from "bun"
import z from "zod"
import { NamedError } from "@opencode-ai/util/error"
import { Log } from "../util/log"
import { iife } from "@/util/iife"
import { Flag } from "../flag/flag"

declare global {
  const OPENCODE_VERSION: string
  const OPENCODE_CHANNEL: string
}

export namespace Installation {
  const log = Log.create({ service: "installation" })
  const DEFAULT_NPM_PACKAGE = "@adolago/agent-core"
  export const NPM_PACKAGES = Array.from(
    new Set(
      [process.env.AGENT_CORE_NPM_PACKAGE?.trim(), DEFAULT_NPM_PACKAGE, "agent-core-ai"].filter(Boolean),
    ),
  ) as string[]

  function preferredNpmPackage() {
    return NPM_PACKAGES[0] ?? DEFAULT_NPM_PACKAGE
  }

  async function listGlobalPackages(manager: "npm" | "pnpm" | "bun" | "yarn") {
    switch (manager) {
      case "npm":
        return $`npm list -g --depth=0`.throws(false).quiet().text()
      case "pnpm":
        return $`pnpm list -g --depth=0`.throws(false).quiet().text()
      case "bun":
        return $`bun pm ls -g`.throws(false).quiet().text()
      case "yarn":
        return $`yarn global list`.throws(false).quiet().text()
    }
  }

  export async function resolveNpmPackage(method: Method) {
    if (method !== "npm" && method !== "pnpm" && method !== "bun" && method !== "yarn") {
      return preferredNpmPackage()
    }
    const output = await listGlobalPackages(method)
    for (const pkg of NPM_PACKAGES) {
      if (output.includes(pkg)) return pkg
    }
    return preferredNpmPackage()
  }

  export type Method = Awaited<ReturnType<typeof method>>

  export const Event = {
    Updated: BusEvent.define(
      "installation.updated",
      z.object({
        version: z.string(),
      }),
    ),
    UpdateAvailable: BusEvent.define(
      "installation.update-available",
      z.object({
        version: z.string(),
      }),
    ),
  }

  export const Info = z
    .object({
      version: z.string(),
      latest: z.string(),
    })
    .meta({
      ref: "InstallationInfo",
    })
  export type Info = z.infer<typeof Info>

  export async function info() {
    return {
      version: VERSION,
      latest: await latest(),
    }
  }

  export function isPreview() {
    return CHANNEL !== "latest"
  }

  export function isLocal() {
    return CHANNEL === "local"
  }

  export async function method() {
    if (process.execPath.includes(path.join(".agent-core", "bin"))) return "curl"
    if (process.execPath.includes(path.join(".local", "bin"))) return "curl"
    const exec = process.execPath.toLowerCase()

    const checks = [
      {
        name: "npm" as const,
        command: () => $`npm list -g --depth=0`.throws(false).quiet().text(),
      },
      {
        name: "yarn" as const,
        command: () => $`yarn global list`.throws(false).quiet().text(),
      },
      {
        name: "pnpm" as const,
        command: () => $`pnpm list -g --depth=0`.throws(false).quiet().text(),
      },
      {
        name: "bun" as const,
        command: () => $`bun pm ls -g`.throws(false).quiet().text(),
      },
      {
        name: "brew" as const,
        command: () => $`brew list --formula`.throws(false).quiet().text(),
      },
    ]

    checks.sort((a, b) => {
      const aMatches = exec.includes(a.name)
      const bMatches = exec.includes(b.name)
      if (aMatches && !bMatches) return -1
      if (!aMatches && bMatches) return 1
      return 0
    })

    const npmPackages = NPM_PACKAGES
    const brewPackages = ["agent-core", "adolago/tap/agent-core", "opencode"]

    for (const check of checks) {
      const output = await check.command()
      if (check.name === "brew") {
        if (brewPackages.some((pkg) => output.includes(pkg))) return check.name
        continue
      }
      if (npmPackages.some((pkg) => output.includes(pkg))) return check.name
    }

    return "unknown"
  }

  export const UpgradeFailedError = NamedError.create(
    "UpgradeFailedError",
    z.object({
      stderr: z.string(),
    }),
  )

  async function getBrewFormula() {
    const tapFormula = await $`brew list --formula adolago/tap/agent-core`.throws(false).quiet().text()
    if (tapFormula.includes("agent-core")) return "adolago/tap/agent-core"
    const coreFormula = await $`brew list --formula agent-core`.throws(false).quiet().text()
    if (coreFormula.includes("agent-core")) return "agent-core"
    return "agent-core"
  }

  export async function upgrade(method: Method, target: string) {
    let cmd
    switch (method) {
      case "curl":
        cmd = $`curl -fsSL https://raw.githubusercontent.com/adolago/agent-core/dev/install | bash`.env({
          ...process.env,
          VERSION: target,
        })
        break
      case "npm":
        cmd = $`npm install -g ${(await resolveNpmPackage(method))}@${target}`
        break
      case "pnpm":
        cmd = $`pnpm install -g ${(await resolveNpmPackage(method))}@${target}`
        break
      case "bun":
        cmd = $`bun install -g ${(await resolveNpmPackage(method))}@${target}`
        break
      case "brew": {
        const formula = await getBrewFormula()
        cmd = $`brew upgrade ${formula}`.env({
          HOMEBREW_NO_AUTO_UPDATE: "1",
          ...process.env,
        })
        break
      }
      default:
        throw new Error(`Unknown method: ${method}`)
    }
    const result = await cmd.quiet().throws(false)
    if (result.exitCode !== 0) {
      const stderr = result.stderr.toString("utf8")
      throw new UpgradeFailedError({
        stderr: stderr,
      })
    }
    log.info("upgraded", {
      method,
      target,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    })
    await $`${process.execPath} --version`.nothrow().quiet().text()
  }

  // Version format: V0.YYYYMMDD
  export const VERSION = typeof OPENCODE_VERSION === "string" ? OPENCODE_VERSION : "V0.20260109"
  export const CHANNEL = typeof OPENCODE_CHANNEL === "string" ? OPENCODE_CHANNEL : "local"
  export const USER_AGENT = `agent-core/${CHANNEL}/${VERSION}/${Flag.OPENCODE_CLIENT}`

  export async function latest(installMethod?: Method) {
    const detectedMethod = installMethod || (await method())

    if (detectedMethod === "brew") {
      const formula = await getBrewFormula()
      if (formula === "agent-core" || formula === "adolago/tap/agent-core") {
        return fetch("https://formulae.brew.sh/api/formula/agent-core.json")
          .then((res) => {
            if (!res.ok) throw new Error(res.statusText)
            return res.json()
          })
          .then((data: any) => data.versions.stable)
      }
    }

    if (detectedMethod === "npm" || detectedMethod === "bun" || detectedMethod === "pnpm" || detectedMethod === "yarn") {
      const registry = await iife(async () => {
        const r = (await $`npm config get registry`.quiet().nothrow().text()).trim()
        const reg = r || "https://registry.npmjs.org"
        return reg.endsWith("/") ? reg.slice(0, -1) : reg
      })
      const channel = CHANNEL
      const npmPackage = await resolveNpmPackage(detectedMethod)
      const encoded = encodeURIComponent(npmPackage)
      return fetch(`${registry}/${encoded}/${channel}`)
        .then((res) => {
          if (!res.ok) throw new Error(res.statusText)
          return res.json()
        })
        .then((data: any) => data.version)
    }

    return fetch("https://api.github.com/repos/adolago/agent-core/releases/latest")
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText)
        return res.json()
      })
      .then((data: any) => data.tag_name.replace(/^v/, ""))
  }
}
