import { Global } from "../../../global"
import { bootstrap } from "../../bootstrap"
import { cmd } from "../cmd"
import { ConfigCommand } from "./config"
import { ErrorsCommand } from "./errors"
import { FileCommand } from "./file"
import { LSPCommand } from "./lsp"
import { LogsCommand } from "./logs"
import { MemoryCommand } from "./memory"
import { MigrateCommand } from "./migrate"
import { RipgrepCommand } from "./ripgrep"
import { ScrapCommand } from "./scrap"
import { SkillCommand } from "./skill"
import { SnapshotCommand } from "./snapshot"
import { TasksCommand } from "./tasks"
import { AgentCommand } from "./agent"

export const DebugCommand = cmd({
  command: "debug",
  describe: "debugging and troubleshooting tools",
  builder: (yargs) =>
    yargs
      .command(ConfigCommand)
      .command(ErrorsCommand)
      .command(LSPCommand)
      .command(LogsCommand)
      .command(MemoryCommand)
      .command(MigrateCommand)
      .command(RipgrepCommand)
      .command(FileCommand)
      .command(ScrapCommand)
      .command(SkillCommand)
      .command(SnapshotCommand)
      .command(TasksCommand)
      .command(AgentCommand)
      .command(PathsCommand)
      .command(FlagsCommand)
      .command({
        command: "wait",
        describe: "wait indefinitely (for debugging)",
        async handler() {
          await bootstrap(process.cwd(), async () => {
            await new Promise((resolve) => setTimeout(resolve, 1_000 * 60 * 60 * 24))
          })
        },
      })
      .demandCommand(),
  async handler() {},
})

const PathsCommand = cmd({
  command: "paths",
  describe: "show global paths (data, config, cache, state)",
  handler() {
    for (const [key, value] of Object.entries(Global.Path)) {
      console.log(key.padEnd(10), value)
    }
  },
})

const FlagsCommand = cmd({
  command: "flags",
  describe: "list all environment flags and their current values",
  builder: (yargs) =>
    yargs.option("json", {
      type: "boolean",
      default: false,
      describe: "output as JSON",
    }),
  async handler(args) {
    const { Flag } = await import("../../../flag/flag")

    // List known flag names (extracted from Flag namespace)
    const flagNames = [
      "AUTO_SHARE",
      "GIT_BASH_PATH",
      "CONFIG",
      "CONFIG_DIR",
      "CONFIG_CONTENT",
      "DISABLE_AUTOUPDATE",
      "DISABLE_PRUNE",
      "DISABLE_TERMINAL_TITLE",
      "PERMISSION",
      "DISABLE_DEFAULT_PLUGINS",
      "DISABLE_LSP_DOWNLOAD",
      "ENABLE_EXPERIMENTAL_MODELS",
      "DISABLE_AUTOCOMPACT",
      "DISABLE_MODELS_FETCH",
      "DISABLE_CLAUDE_CODE",
      "DISABLE_CLAUDE_CODE_PROMPT",
      "DISABLE_CLAUDE_CODE_SKILLS",
      "FAKE_VCS",
      "CLIENT",
      "EXPERIMENTAL",
      "EXPERIMENTAL_FILEWATCHER",
      "EXPERIMENTAL_DISABLE_FILEWATCHER",
      "EXPERIMENTAL_ICON_DISCOVERY",
      "EXPERIMENTAL_DISABLE_COPY_ON_SELECT",
      "ENABLE_EXA",
      "EXPERIMENTAL_BASH_MAX_OUTPUT_LENGTH",
      "EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS",
      "EXPERIMENTAL_OUTPUT_TOKEN_MAX",
      "EXPERIMENTAL_OXFMT",
      "EXPERIMENTAL_LSP_TY",
      "EXPERIMENTAL_LSP_TOOL",
    ]

    const flags = flagNames.map((name) => {
      const agentCoreKey = `AGENT_CORE_${name}`
      const opencodeKey = `OPENCODE_${name}`
      const agentCoreValue = process.env[agentCoreKey]
      const opencodeValue = process.env[opencodeKey]
      // Get value from Flag namespace if available
      const flagKey = `OPENCODE_${name}` as keyof typeof Flag
      const computedValue = Flag[flagKey]

      return {
        name,
        agentCoreEnv: agentCoreKey,
        legacyEnv: opencodeKey,
        envValue: agentCoreValue ?? opencodeValue ?? null,
        computedValue: computedValue !== undefined ? String(computedValue) : null,
        source: agentCoreValue ? "AGENT_CORE" : opencodeValue ? "OPENCODE" : null,
      }
    })

    if (args.json) {
      console.log(JSON.stringify(flags, null, 2))
      return
    }

    console.log("Environment Flags")
    console.log("=================")
    console.log("")
    console.log("Use either AGENT_CORE_* or OPENCODE_* prefix (AGENT_CORE_* takes precedence)")
    console.log("")

    const setFlags = flags.filter((f) => f.envValue !== null || f.computedValue === "true")
    const unsetFlags = flags.filter((f) => f.envValue === null && f.computedValue !== "true")

    if (setFlags.length > 0) {
      console.log("Currently Set:")
      for (const flag of setFlags) {
        const value = flag.envValue ?? flag.computedValue
        const source = flag.source ?? "default"
        console.log(`  ${flag.name.padEnd(45)} = ${value} (${source})`)
      }
      console.log("")
    }

    console.log("Available Flags:")
    for (const flag of unsetFlags) {
      console.log(`  ${flag.name}`)
    }
  },
})
