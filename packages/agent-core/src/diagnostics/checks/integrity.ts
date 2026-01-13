/**
 * @file Integrity Checks
 * @description Runtime integrity and state validation checks
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import type { CheckResult, CheckOptions } from "../types";

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

function getStateDir(): string {
  return process.env.AGENT_CORE_STATE_DIR || 
    path.join(os.homedir(), ".local", "state", "agent-core");
}

async function checkStaleLocks(): Promise<CheckResult> {
  const start = Date.now();
  const stateDir = getStateDir();

  try {
    const files = await fs.readdir(stateDir, { recursive: true });
    const lockFiles = files.filter((f) => String(f).endsWith(".lock"));
    const now = Date.now();
    const staleLocks: string[] = [];

    for (const lockFile of lockFiles) {
      const fullPath = path.join(stateDir, String(lockFile));
      try {
        const stat = await fs.stat(fullPath);
        const age = now - stat.mtimeMs;
        if (age > STALE_THRESHOLD_MS) {
          staleLocks.push(fullPath);
        }
      } catch {
        // File may have been deleted
      }
    }

    if (staleLocks.length === 0) {
      return {
        id: "integrity.stale-locks",
        name: "Lock Files",
        category: "integrity",
        status: "pass",
        message: "No stale lock files",
        severity: "info",
        durationMs: Date.now() - start,
        autoFixable: false,
      };
    }

    return {
      id: "integrity.stale-locks",
      name: "Lock Files",
      category: "integrity",
      status: "warn",
      message: `${staleLocks.length} stale lock file(s)`,
      details: staleLocks.map((f) => path.basename(f)).join(", "),
      severity: "warning",
      durationMs: Date.now() - start,
      autoFixable: true,
      fix: async () => {
        for (const lockFile of staleLocks) {
          await fs.unlink(lockFile);
        }
        return { success: true, message: `Removed ${staleLocks.length} stale lock(s)` };
      },
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        id: "integrity.stale-locks",
        name: "Lock Files",
        category: "integrity",
        status: "pass",
        message: "No state directory yet",
        severity: "info",
        durationMs: Date.now() - start,
        autoFixable: false,
      };
    }
    return {
      id: "integrity.stale-locks",
      name: "Lock Files",
      category: "integrity",
      status: "skip",
      message: "Could not check lock files",
      severity: "info",
      durationMs: Date.now() - start,
      autoFixable: false,
    };
  }
}

async function checkOrphanedProcesses(): Promise<CheckResult> {
  const start = Date.now();
  const pidFile = path.join(getStateDir(), "daemon.pid");

  try {
    const pidContent = await fs.readFile(pidFile, "utf-8");
    const storedPid = parseInt(pidContent.trim(), 10);

    try {
      process.kill(storedPid, 0); // Signal 0 = check if process exists

      // Process exists, verify it's agent-core (Linux only)
      try {
        const cmdline = await fs.readFile(`/proc/${storedPid}/cmdline`, "utf-8");
        if (cmdline.includes("agent-core") || cmdline.includes("bun")) {
          return {
            id: "integrity.orphan-procs",
            name: "Daemon Process",
            category: "integrity",
            status: "pass",
            message: `Daemon running (PID ${storedPid})`,
            severity: "info",
            durationMs: Date.now() - start,
            autoFixable: false,
            metadata: { pid: storedPid },
          };
        }

        return {
          id: "integrity.orphan-procs",
          name: "Daemon Process",
          category: "integrity",
          status: "warn",
          message: "PID file points to wrong process",
          severity: "warning",
          durationMs: Date.now() - start,
          autoFixable: true,
          fix: async () => {
            await fs.unlink(pidFile);
            return { success: true, message: "Removed stale PID file" };
          },
        };
      } catch {
        // Can't read /proc (macOS or permission issue), assume it's valid
        return {
          id: "integrity.orphan-procs",
          name: "Daemon Process",
          category: "integrity",
          status: "pass",
          message: `Process ${storedPid} exists`,
          severity: "info",
          durationMs: Date.now() - start,
          autoFixable: false,
        };
      }
    } catch {
      return {
        id: "integrity.orphan-procs",
        name: "Daemon Process",
        category: "integrity",
        status: "warn",
        message: "PID file exists but process not running",
        severity: "warning",
        durationMs: Date.now() - start,
        autoFixable: true,
        fix: async () => {
          await fs.unlink(pidFile);
          return { success: true, message: "Removed orphaned PID file" };
        },
      };
    }
  } catch {
    return {
      id: "integrity.orphan-procs",
      name: "Daemon Process",
      category: "integrity",
      status: "pass",
      message: "No daemon PID file (daemon not running)",
      severity: "info",
      durationMs: Date.now() - start,
      autoFixable: false,
    };
  }
}

async function checkCorruptedSessions(): Promise<CheckResult> {
  const start = Date.now();
  const sessionsDir = path.join(getStateDir(), "sessions");

  try {
    const files = await fs.readdir(sessionsDir);
    const sessionFiles = files.filter((f) => f.endsWith(".json"));
    const corrupted: string[] = [];

    for (const file of sessionFiles) {
      try {
        const content = await fs.readFile(path.join(sessionsDir, file), "utf-8");
        JSON.parse(content);
      } catch {
        corrupted.push(file);
      }
    }

    if (corrupted.length === 0) {
      return {
        id: "integrity.corrupt-session",
        name: "Session Files",
        category: "integrity",
        status: "pass",
        message: `${sessionFiles.length} session file(s) valid`,
        severity: "info",
        durationMs: Date.now() - start,
        autoFixable: false,
      };
    }

    return {
      id: "integrity.corrupt-session",
      name: "Session Files",
      category: "integrity",
      status: "warn",
      message: `${corrupted.length} corrupted session file(s)`,
      details: corrupted.join(", "),
      severity: "warning",
      durationMs: Date.now() - start,
      autoFixable: true,
      fix: async () => {
        const backupDir = path.join(sessionsDir, ".corrupted");
        await fs.mkdir(backupDir, { recursive: true });
        for (const file of corrupted) {
          const src = path.join(sessionsDir, file);
          const dest = path.join(backupDir, `${file}.${Date.now()}`);
          await fs.rename(src, dest);
        }
        return { success: true, message: `Moved ${corrupted.length} file(s) to .corrupted/` };
      },
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        id: "integrity.corrupt-session",
        name: "Session Files",
        category: "integrity",
        status: "pass",
        message: "No sessions directory",
        severity: "info",
        durationMs: Date.now() - start,
        autoFixable: false,
      };
    }
    return {
      id: "integrity.corrupt-session",
      name: "Session Files",
      category: "integrity",
      status: "skip",
      message: "Could not check sessions",
      severity: "info",
      durationMs: Date.now() - start,
      autoFixable: false,
    };
  }
}

export async function runIntegrityChecks(options: CheckOptions): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  
  results.push(await checkStaleLocks());
  results.push(await checkOrphanedProcesses());
  
  if (options.full) {
    results.push(await checkCorruptedSessions());
  }

  return results;
}
