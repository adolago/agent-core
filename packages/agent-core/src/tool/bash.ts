import z from "zod"
import { spawn } from "child_process"
import { Tool } from "./tool"
import path from "path"
import DESCRIPTION from "./bash.txt"
import { Log } from "../util/log"
import { Instance } from "../project/instance"
import { lazy } from "@/util/lazy"
import { Language } from "web-tree-sitter"

import { $ } from "bun"
import { Filesystem } from "@/util/filesystem"
import { fileURLToPath } from "url"
import { Flag } from "@/flag/flag.ts"
import { Shell } from "@/shell/shell"

import { BashArity } from "@/permission/arity"
import { Truncate } from "./truncation"

const MAX_METADATA_LENGTH = 30_000
const DEFAULT_TIMEOUT = Flag.OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS || 2 * 60 * 1000

export const log = Log.create({ service: "bash-tool" })
// HOLD mode validation - detect file-modifying commands
const FILE_MODIFYING_COMMANDS = new Set([
  'rm', 'mv', 'cp', 'mkdir', 'rmdir', 'touch', 'chmod', 'chown',
  'ln', 'unlink', 'install', 'shred', 'tee', 'dd', 'truncate',
  'patch', 'ed', 'ex',
])

const FILE_MODIFYING_GIT_SUBCOMMANDS = new Set([
  'add', 'commit', 'push', 'pull', 'merge', 'rebase', 'reset', 'checkout',
  'branch', 'tag', 'stash', 'cherry-pick', 'revert', 'am', 'apply',
  'mv', 'rm', 'clean', 'restore', 'switch',
])

export function isFileModifyingCommand(command: string): { modifying: boolean; reason?: string } {
  const trimmed = command.trim()
  
  // Check for output redirection (> or >>) - but not stderr redirection (2>)
  if (/(?<![2&])>>?\s*[^\s&|;]/.test(trimmed)) {
    return { modifying: true, reason: 'output redirection to file' }
  }
  
  // Check for pipe to tee
  if (/\|\s*tee\s+/.test(trimmed)) {
    return { modifying: true, reason: 'pipe to tee (writes to file)' }
  }
  
  // Parse commands (handle pipes and &&)
  const commands = trimmed.split(/\s*[|&;]\s*/).filter(Boolean)
  
  for (const part of commands) {
    const parts = part.trim().split(/\s+/)
    const cmd = parts[0]?.replace(/^.*\//, '') // Remove path prefix
    
    if (!cmd) continue
    
    // Check sed with -i flag
    if (cmd === 'sed' && (parts.includes('-i') || parts.some(p => p.startsWith('-i')))) {
      return { modifying: true, reason: 'sed with in-place edit (-i)' }
    }
    
    // Check git subcommands
    if (cmd === 'git') {
      const subcommand = parts[1]
      if (subcommand && FILE_MODIFYING_GIT_SUBCOMMANDS.has(subcommand)) {
        return { modifying: true, reason: `git ${subcommand} modifies repository` }
      }
      continue
    }
    
    // Check other file-modifying commands
    if (FILE_MODIFYING_COMMANDS.has(cmd)) {
      return { modifying: true, reason: `${cmd} modifies filesystem` }
    }
  }
  
  return { modifying: false }
}


const resolveWasm = (asset: string) => {
  if (asset.startsWith("file://")) return fileURLToPath(asset)
  if (asset.startsWith("/") || /^[a-z]:/i.test(asset)) return asset
  const url = new URL(asset, import.meta.url)
  return fileURLToPath(url)
}

export const parser = lazy(async () => {
  const { Parser } = await import("web-tree-sitter")
  const { default: treeWasm } = await import("web-tree-sitter/tree-sitter.wasm" as string, {
    with: { type: "wasm" },
  })
  const treePath = resolveWasm(treeWasm)
  await Parser.init({
    locateFile() {
      return treePath
    },
  })
  const { default: bashWasm } = await import("tree-sitter-bash/tree-sitter-bash.wasm" as string, {
    with: { type: "wasm" },
  })
  const bashPath = resolveWasm(bashWasm)
  const bashLanguage = await Language.load(bashPath)
  const p = new Parser()
  p.setLanguage(bashLanguage)
  return p
})

// NOTE: Tool is named 'bash' for backwards compatibility, but it uses the system's
// preferred shell (detected by Shell.acceptable()). Renaming would break existing prompts.
export const BashTool = Tool.define("bash", async () => {
  const shell = Shell.acceptable()
  log.info("bash tool using shell", { shell })

  return {
    description: DESCRIPTION.replaceAll("${directory}", Instance.directory)
      .replaceAll("${maxLines}", String(Truncate.MAX_LINES))
      .replaceAll("${maxBytes}", String(Truncate.MAX_BYTES)),
    parameters: z.object({
      command: z.string().describe("The command to execute"),
      timeout: z.number().describe("Optional timeout in milliseconds").optional(),
      workdir: z
        .string()
        .describe(
          `The working directory to run the command in. Defaults to ${Instance.directory}. Use this instead of 'cd' commands.`,
        )
        .optional(),
      description: z
        .string()
        .describe(
          "Clear, concise description of what this command does in 5-10 words. Examples:\nInput: ls\nOutput: Lists files in current directory\n\nInput: git status\nOutput: Shows working tree status\n\nInput: npm install\nOutput: Installs package dependencies\n\nInput: mkdir foo\nOutput: Creates directory 'foo'",
        ),
    }),
    async execute(params, ctx) {
      const cwd = params.workdir || Instance.directory

      // HOLD mode validation - block file-modifying commands
      if (ctx.extra?.holdMode === true) {
        const check = isFileModifyingCommand(params.command)
        if (check.modifying) {
          log.info("blocked file-modifying command in HOLD mode", { 
            command: params.command, 
            reason: check.reason 
          })
          const blockedOutput = `HOLD MODE: Command blocked because it would modify files (${check.reason}).\n\nIn HOLD mode, you cannot:\n- Edit files (sed -i, etc.)\n- Create/delete files (touch, rm, mkdir, etc.)\n- Use output redirection (>, >>)\n- Modify git state (git add, commit, push, etc.)\n\nYou can:\n- Read files (cat, head, tail)\n- Search (grep, find, rg)\n- View git state (git status, log, diff)\n- Run tests and builds\n\nTo modify files, the user must switch to RELEASE mode.`
          return {
            title: "Blocked in HOLD mode",
            metadata: {
              output: blockedOutput,
              exit: 1 as number | null,
              description: params.description,
            },
            output: blockedOutput,
          }
        }
      }

      if (params.timeout !== undefined && params.timeout < 0) {
        throw new Error(`Invalid timeout value: ${params.timeout}. Timeout must be a positive number.`)
      }
      const timeout = params.timeout ?? DEFAULT_TIMEOUT
      const tree = await parser().then((p) => p.parse(params.command))
      if (!tree) {
        throw new Error("Failed to parse command")
      }
      const directories = new Set<string>()
      if (!Instance.containsPath(cwd)) directories.add(cwd)
      const patterns = new Set<string>()
      const always = new Set<string>()

      for (const node of tree.rootNode.descendantsOfType("command")) {
        if (!node) continue
        const command = []
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i)
          if (!child) continue
          if (
            child.type !== "command_name" &&
            child.type !== "word" &&
            child.type !== "string" &&
            child.type !== "raw_string" &&
            child.type !== "concatenation"
          ) {
            continue
          }
          command.push(child.text)
        }

        // not an exhaustive list, but covers most common cases
        if (["cd", "rm", "cp", "mv", "mkdir", "touch", "chmod", "chown"].includes(command[0])) {
          for (const arg of command.slice(1)) {
            if (arg.startsWith("-") || (command[0] === "chmod" && arg.startsWith("+"))) continue
            const resolved = await $`realpath ${arg}`
              .cwd(cwd)
              .quiet()
              .nothrow()
              .text()
              .then((x) => x.trim())
            log.info("resolved path", { arg, resolved })
            if (resolved) {
              // Git Bash on Windows returns Unix-style paths like /c/Users/...
              const normalized =
                process.platform === "win32" && resolved.match(/^\/[a-z]\//)
                  ? resolved.replace(/^\/([a-z])\//, (_, drive) => `${drive.toUpperCase()}:\\`).replace(/\//g, "\\")
                  : resolved
              if (!Instance.containsPath(normalized)) directories.add(normalized)
            }
          }
        }

        // cd covered by above check
        if (command.length && command[0] !== "cd") {
          patterns.add(command.join(" "))
          always.add(BashArity.prefix(command).join(" ") + "*")
        }
      }

      if (directories.size > 0) {
        await ctx.ask({
          permission: "external_directory",
          patterns: Array.from(directories),
          always: Array.from(directories).map((x) => path.dirname(x) + "*"),
          metadata: {},
        })
      }

      if (patterns.size > 0) {
        await ctx.ask({
          permission: "bash",
          patterns: Array.from(patterns),
          always: Array.from(always),
          metadata: {},
        })
      }

      const proc = spawn(params.command, {
        shell,
        cwd,
        env: {
          ...process.env,
        },
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
      })

      let output = ""

      // Initialize metadata with empty output
      ctx.metadata({
        metadata: {
          output: "",
          description: params.description,
        },
      })

      const append = (chunk: Buffer) => {
        output += chunk.toString()
        ctx.metadata({
          metadata: {
            // truncate the metadata to avoid GIANT blobs of data (has nothing to do w/ what agent can access)
            output: output.length > MAX_METADATA_LENGTH ? output.slice(0, MAX_METADATA_LENGTH) + "\n\n..." : output,
            description: params.description,
          },
        })
      }

      proc.stdout?.on("data", append)
      proc.stderr?.on("data", append)

      let timedOut = false
      let aborted = false
      let exited = false

      const kill = () => Shell.killTree(proc, { exited: () => exited })

      if (ctx.abort.aborted) {
        aborted = true
        await kill()
      }

      const abortHandler = () => {
        aborted = true
        void kill()
      }

      ctx.abort.addEventListener("abort", abortHandler, { once: true })

      const timeoutTimer = setTimeout(() => {
        timedOut = true
        void kill()
      }, timeout + 100)

      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timeoutTimer)
          ctx.abort.removeEventListener("abort", abortHandler)
        }

        proc.once("exit", () => {
          exited = true
          cleanup()
          resolve()
        })

        proc.once("error", (error) => {
          exited = true
          cleanup()
          reject(error)
        })
      })

      const resultMetadata: string[] = []

      if (timedOut) {
        resultMetadata.push(`bash tool terminated command after exceeding timeout ${timeout} ms`)
      }

      if (aborted) {
        resultMetadata.push("User aborted the command")
      }

      if (resultMetadata.length > 0) {
        output += "\n\n<bash_metadata>\n" + resultMetadata.join("\n") + "\n</bash_metadata>"
      }

      return {
        title: params.description,
        metadata: {
          output: output.length > MAX_METADATA_LENGTH ? output.slice(0, MAX_METADATA_LENGTH) + "\n\n..." : output,
          exit: proc.exitCode,
          description: params.description,
        },
        output,
      }
    },
  }
})
