import { cmd } from "./cmd"
import { UI } from "../ui"
import { Global } from "../../global"
import path from "path"
import fs from "fs"
import { Log } from "../../util/log"
import { spawn } from "child_process"
import { promisify } from "util"

export const BugReportCommand = cmd({
  command: "bug-report",
  describe: "generate a zip file with logs and diagnostics",
  async handler() {
    UI.header("Bug Report Generator")

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const reportDir = path.join(Global.Path.tmp, `report-${timestamp}`)
    const zipPath = path.join(process.cwd(), `agent-core-report-${timestamp}.zip`)

    fs.mkdirSync(reportDir, { recursive: true })

    // 1. Collect Logs
    UI.info("Collecting logs...")
    const logDir = Global.Path.log
    if (fs.existsSync(logDir)) {
        const destLogDir = path.join(reportDir, "logs")
        fs.mkdirSync(destLogDir)
        // Copy last 5 log files
        const files = fs.readdirSync(logDir)
            .filter(f => f.endsWith(".log"))
            .sort()
            .slice(-5)
        
        for (const file of files) {
            fs.copyFileSync(path.join(logDir, file), path.join(destLogDir, file))
        }
    } else {
        UI.warn("No logs found.")
    }

    // 2. Collect System Info (Docker, Env)
    UI.info("Collecting system info...")
    const sysInfoPath = path.join(reportDir, "system-info.txt")
    let sysInfo = `Timestamp: ${new Date().toISOString()}\n`
    sysInfo += `OS: ${process.platform} ${process.arch}\n`
    sysInfo += `Node: ${process.version}\n`
    
    // Check Docker
    try {
        const dockerProc = Bun.spawnSync(["docker", "info"])
        sysInfo += `\nDocker Info:\n${dockerProc.stdout.toString()}\n`
    } catch (e) {
        sysInfo += `\nDocker check failed: ${e}\n`
    }

    fs.writeFileSync(sysInfoPath, sysInfo)

    // 3. Zip it up
    UI.info(`Creating archive at ${zipPath}...`)
    // Using zip command if available, otherwise we might need a library, but relying on system zip is simpler for now
    // or just tar.
    try {
        // Try 'zip' first
        const zipProc = Bun.spawnSync(["zip", "-r", zipPath, "."], { cwd: reportDir })
        if (zipProc.exitCode !== 0) {
            // Fallback to tar
            const tarPath = zipPath.replace(".zip", ".tar.gz")
            const tarProc = Bun.spawnSync(["tar", "-czf", tarPath, "."], { cwd: reportDir })
            if (tarProc.exitCode === 0) {
                 UI.success(`Report created: ${tarPath}`)
                 return
            } else {
                throw new Error("Failed to zip or tar.")
            }
        }
    } catch (e) {
        UI.error("Failed to create archive. Please zip the following directory manually:")
        UI.info(reportDir)
        return
    }

    UI.success(`Report created: ${zipPath}`)
    UI.info("Please attach this file when reporting an issue.")
  },
})
