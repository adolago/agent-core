import { Server } from "../../server/server"
import { getAuthConfig } from "../../server/auth"
import { cmd } from "./cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"

export const ServeCommand = cmd({
  command: "serve",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "starts a headless agent-core server",
  handler: async (args) => {
    const authConfig = getAuthConfig()
    if (authConfig.disabled) {
      console.log("Warning: server auth is disabled via AGENT_CORE_DISABLE_SERVER_AUTH.")
    } else if (!authConfig.password) {
      console.error(
        "Error: AGENT_CORE_SERVER_PASSWORD is not set. Set it (or OPENCODE_SERVER_PASSWORD) or set AGENT_CORE_DISABLE_SERVER_AUTH=1.",
      )
      process.exit(1)
    }
    const opts = await resolveNetworkOptions(args)
    const server = Server.listen(opts)
    // Use "opencode server listening" for @opencode-ai/sdk compatibility
    console.log(`opencode server listening on http://${server.hostname}:${server.port}`)
    await new Promise(() => {})
    await server.stop()
  },
})
