import { UI } from "../ui"
import { Global } from "../../global"
import { Auth } from "../../auth"
import * as prompts from "@clack/prompts"
import { spawnSync } from "child_process"

export async function checkEnvironment() {
  // 1. Auth Check
  const auths = await Auth.all()
  if (Object.keys(auths).length === 0) {
    UI.warn("No authentication providers found.")
    const shouldSetup = await prompts.confirm({
      message: "Do you want to set up an API key now (Anthropic/OpenAI)?",
      initialValue: true
    })
    
    if (shouldSetup && !prompts.isCancel(shouldSetup)) {
       // We can't easily jump to AuthCommand here without circular deps or complex logic,
       // so we just guide them.
       UI.info("Please run 'agent-core auth login' to configure your provider.")
       // Optional: we could run the auth command logic here if refactored.
    }
  }

  // 2. Qdrant Check
  try {
    const resp = await fetch("http://localhost:6333/healthz")
    if (!resp.ok) throw new Error("Not OK")
  } catch (e) {
    // Qdrant not running
    // Check if we should warn
    // Only warn if they aren't running setup command
    if (!process.argv.includes("setup")) {
         // We might want to be less intrusive if they are just running --help
         // But this is inside RunCommand which implies intent to run.
         UI.warn("Qdrant memory server is not reachable at localhost:6333.")
         UI.info("Run 'agent-core setup' to start the infrastructure.")
    }
  }
}
