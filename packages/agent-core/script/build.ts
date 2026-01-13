#!/usr/bin/env bun

import solidPlugin from "../node_modules/@opentui/solid/scripts/solid-plugin"
import path from "path"
import fs from "fs"
import { $ } from "bun"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

import pkg from "../package.json"
import { Script } from "@opencode-ai/script"

const personasRoot = path.resolve(dir, "..", "..", "vendor", "personas")
const zeeRoot = path.join(personasRoot, "zee")

async function ensureZeeDependencies() {
  const nodeModules = path.join(zeeRoot, "node_modules")
  if (fs.existsSync(nodeModules)) return
  if (!fs.existsSync(path.join(zeeRoot, "package.json"))) return
  console.log("installing zee dependencies for bundling")
  await $`pnpm install --prod --ignore-scripts`.cwd(zeeRoot)
}

function bundlePersonas(distRoot: string) {
  if (!fs.existsSync(personasRoot)) return
  const destRoot = path.join(distRoot, "vendor", "personas")
  fs.mkdirSync(destRoot, { recursive: true })
  for (const entry of fs.readdirSync(personasRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const src = path.join(personasRoot, entry.name)
    const dest = path.join(destRoot, entry.name)
    fs.cpSync(src, dest, {
      recursive: true,
      dereference: true,
      filter: (srcPath) => {
        const base = path.basename(srcPath)
        if (entry.name === "zee") {
          return base !== ".git" && base !== ".venv" && base !== "venv"
        }
        return base !== ".git" && base !== "node_modules" && base !== ".venv" && base !== "venv"
      },
    })
  }
}

const singleFlag = process.argv.includes("--single")
const baselineFlag = process.argv.includes("--baseline")
const skipInstall = process.argv.includes("--skip-install")
const binarySuffix = process.env.OPENCODE_BINARY_SUFFIX?.trim()
const targetsArg =
  process.env.OPENCODE_TARGETS ??
  (() => {
    const idx = process.argv.indexOf("--targets")
    if (idx === -1) return undefined
    return process.argv[idx + 1]
  })()

const allTargets: {
  os: string
  arch: "arm64" | "x64"
  abi?: "musl"
  avx2?: false
}[] = [
  {
    os: "linux",
    arch: "arm64",
  },
  {
    os: "linux",
    arch: "x64",
  },
  {
    os: "linux",
    arch: "x64",
    avx2: false,
  },
  {
    os: "linux",
    arch: "arm64",
    abi: "musl",
  },
  {
    os: "linux",
    arch: "x64",
    abi: "musl",
  },
  {
    os: "linux",
    arch: "x64",
    abi: "musl",
    avx2: false,
  },
  {
    os: "darwin",
    arch: "arm64",
  },
  {
    os: "darwin",
    arch: "x64",
  },
  {
    os: "darwin",
    arch: "x64",
    avx2: false,
  },
  {
    os: "win32",
    arch: "x64",
  },
  {
    os: "win32",
    arch: "x64",
    avx2: false,
  },
]

const targetsFilter = (() => {
  if (!targetsArg) return undefined
  const requested = targetsArg
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.split("-"))
  return (item: (typeof allTargets)[number]) => {
    return requested.some(([os, arch, variant]) => {
      if (os && item.os !== os) return false
      if (arch && item.arch !== arch) return false
      if (variant === "baseline") return item.avx2 === false
      if (variant === "musl") return item.abi === "musl"
      return item.avx2 !== false && item.abi === undefined
    })
  }
})()

const targets = targetsFilter
  ? allTargets.filter(targetsFilter)
  : singleFlag
    ? allTargets.filter((item) => {
        if (item.os !== process.platform || item.arch !== process.arch) {
          return false
        }

        // When building for the current platform, prefer a single native binary by default.
        // Baseline binaries require additional Bun artifacts and can be flaky to download.
        if (item.avx2 === false) {
          return baselineFlag
        }

        // also skip abi-specific builds for the same reason
        if (item.abi !== undefined) {
          return false
        }

        return true
      })
    : allTargets

await $`rm -rf dist`

const binaries: Record<string, string> = {}
if (!skipInstall) {
  await $`bun install --os="*" --cpu="*" @opentui/core@${pkg.dependencies["@opentui/core"]}`
  await $`bun install --os="*" --cpu="*" @parcel/watcher@${pkg.dependencies["@parcel/watcher"]}`
}
if (fs.existsSync(zeeRoot)) {
  await ensureZeeDependencies()
}

for (const item of targets) {
  const baseName = [
    pkg.name,
    // changing to win32 flags npm for some reason
    item.os === "win32" ? "windows" : item.os,
    item.arch,
    item.avx2 === false ? "baseline" : undefined,
    item.abi === undefined ? undefined : item.abi,
  ]
    .filter(Boolean)
    .join("-")
  const name = [baseName, binarySuffix].filter(Boolean).join("-")
  console.log(`building ${name}`)
  await $`mkdir -p dist/${name}/bin`

  const parserWorker = fs.realpathSync(path.resolve(dir, "./node_modules/@opentui/core/parser.worker.js"))
  const workerPath = "./src/cli/cmd/tui/worker.ts"

  // Use platform-specific bunfs root path based on target OS
  const bunfsRoot = item.os === "win32" ? "B:/~BUN/root/" : "/$bunfs/root/"
  const workerRelativePath = path.relative(dir, parserWorker).replaceAll("\\", "/")

  await Bun.build({
    conditions: ["browser"],
    tsconfig: "./tsconfig.json",
    plugins: [solidPlugin],
    sourcemap: "external",
    compile: {
      autoloadBunfig: false,
      autoloadDotenv: false,
      //@ts-ignore (bun types aren't up to date)
      autoloadTsconfig: true,
      autoloadPackageJson: true,
      target: baseName.replace(pkg.name, "bun") as any,
      outfile: `dist/${name}/bin/agent-core`,
      execArgv: [`--user-agent=agent-core/${Script.version}`, "--use-system-ca", "--"],
      windows: {},
    },
    entrypoints: ["./src/index.ts", parserWorker, workerPath],
    define: {
      OPENCODE_VERSION: `'${Script.version}'`,
      OTUI_TREE_SITTER_WORKER_PATH: bunfsRoot + workerRelativePath,
      OPENCODE_WORKER_PATH: workerPath,
      OPENCODE_CHANNEL: `'${Script.channel}'`,
      OPENCODE_LIBC: item.os === "linux" ? `'${item.abi ?? "glibc"}'` : "",
    },
  })

  await $`rm -rf ./dist/${name}/bin/tui`
  await Bun.file(`dist/${name}/package.json`).write(
    JSON.stringify(
      {
        name,
        version: Script.version,
        os: [item.os],
        cpu: [item.arch],
      },
      null,
      2,
    ),
  )
  // Bundle personas so standalone installs can resolve them via AGENT_CORE_ROOT.
  bundlePersonas(path.join(dir, "dist", name))
  binaries[name] = Script.version
}

export { binaries }
