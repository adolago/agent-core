import { UI } from "../ui"
import { Global } from "../../global"
import { Auth } from "../../auth"
import * as prompts from "@clack/prompts"
import fs from "fs"
import os from "os"
import path from "path"

export async function checkEnvironment() {
  UI.header("Doctor Diagnostics")
  let issues = 0

  // 1. System Resources
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const memUsage = ((totalMem - freeMem) / totalMem) * 100
  
  if (memUsage > 90) {
    UI.warn(`High memory usage detected: ${memUsage.toFixed(1)}% used.`)
    issues++
  } else {
    UI.success(`Memory: ${(freeMem / 1024 / 1024 / 1024).toFixed(2)}GB free / ${(totalMem / 1024 / 1024 / 1024).toFixed(2)}GB total`)
  }

  // Disk write check (simple)
  try {
    const testFile = path.join(process.cwd(), ".agent-core-write-test")
    fs.writeFileSync(testFile, "test")
    fs.unlinkSync(testFile)
    UI.success("Write permissions: OK")
  } catch (e) {
    UI.error("Write permissions: FAILED (Current Directory)")
    issues++
  }
  
  try {
    if (!fs.existsSync(Global.Path.config)) {
       fs.mkdirSync(Global.Path.config, { recursive: true })
    }
    const testFile = path.join(Global.Path.config, ".write-test")
    fs.writeFileSync(testFile, "test")
    fs.unlinkSync(testFile)
    UI.success("Config directory access: OK")
  } catch (e) {
     UI.error(`Config directory access: FAILED (${Global.Path.config})`)
     issues++
  }

  // 2. Auth Check
  const auths = await Auth.all()
  if (Object.keys(auths).length === 0) {
    UI.warn("No authentication providers found.")
    issues++
    
    // Only prompt if interactive and not running as part of another command that might suppress input
    if (process.stdout.isTTY) {
        const shouldSetup = await prompts.confirm({
        message: "Do you want to set up an API key now (Anthropic/OpenAI)?",
        initialValue: true
        })
        
        if (shouldSetup && !prompts.isCancel(shouldSetup)) {
            UI.info("Please run 'agent-core auth login' to configure your provider.")
        }
    }
  } else {
      UI.success(`Providers configured: ${Object.keys(auths).join(", ")}`)
      
      // Basic connectivity check for common providers
      const commonEndpoints = {
          "anthropic": "https://api.anthropic.com/v1/models", // roughly
          "openai": "https://api.openai.com/v1/models",
          "google": "https://generativelanguage.googleapis.com"
      }

      for (const [provider, token] of Object.entries(auths)) {
          // Rudimentary connectivity check (just pinging the domain, not full auth)
          // We map provider names to endpoints if known
          let url = ""
          if (provider.includes("anthropic")) url = "https://api.anthropic.com"
          else if (provider.includes("openai")) url = "https://api.openai.com"
          else if (provider.includes("google")) url = "https://generativelanguage.googleapis.com"
          
          if (url) {
              try { 
                  const start = performance.now()
                  await fetch(url, { method: "HEAD" }) 
                  const latency = (performance.now() - start).toFixed(0)
                  UI.success(`${provider} connectivity: OK (${latency}ms)`)
              } catch (e) {
                  UI.warn(`${provider} connectivity: Unreachable (${url})`)
                  issues++
              }
          }
      }
  }

  // 3. Qdrant Check
  try {
    const resp = await fetch("http://localhost:6333/healthz")
    if (!resp.ok) throw new Error("Not OK")
    UI.success("Vector Database (Qdrant): OK")
  } catch (e) {
    if (!process.argv.includes("setup")) {
         UI.warn("Vector Database (Qdrant): Unreachable (localhost:6333)")
         UI.info("Run 'agent-core setup' to start the infrastructure.")
         issues++
    }
  }

  if (issues === 0) {
      UI.success("All checks passed! System is ready.")
  } else {
      UI.warn(`Found ${issues} potential issue(s).`)
  }
}
