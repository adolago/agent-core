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

    const flags = Flag.ALL_FLAGS.map((flag) => {
      const agentCoreKey = `AGENT_CORE_${flag.name}`
      const opencodeKey = `OPENCODE_${flag.name}`
      const agentCoreValue = process.env[agentCoreKey]
      const opencodeValue = process.env[opencodeKey]

      return {
        name: flag.name,
        type: flag.type,
        description: flag.description,
        agentCoreEnv: agentCoreKey,
        legacyEnv: opencodeKey,
        value: agentCoreValue ?? opencodeValue ?? null,
        source: agentCoreValue ? "AGENT_CORE" : opencodeValue ? "OPENCODE (legacy)" : null,
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

    const setFlags = flags.filter((f) => f.value !== null)
    const unsetFlags = flags.filter((f) => f.value === null)

    if (setFlags.length > 0) {
      console.log("Currently Set:")
      for (const flag of setFlags) {
        console.log(`  ${flag.name.padEnd(40)} = ${flag.value} (${flag.source})`)
        console.log(`    ${flag.description}`)
      }
      console.log("")
    }

    console.log("Available Flags:")
    for (const flag of unsetFlags) {
      const prefix = flag.type === "boolean" ? "[bool]  " : flag.type === "number" ? "[num]   " : "[string]"
      console.log(`  ${prefix} ${flag.name.padEnd(40)} ${flag.description}`)
    }
  },
})
