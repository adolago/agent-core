import { describe, expect, test, mock } from "bun:test"
import { Instance } from "../../src/project/instance"
import { Pty } from "../../src/pty"
import path from "path"

// Mock bun-pty
mock.module("bun-pty", () => {
  return {
    spawn: () => {
        return (command: string, args: string[], options: any) => {
            // We can add some logic here if needed, but for now just return a dummy process
            return {
                pid: 1234,
                onData: () => {},
                onExit: () => {},
                kill: () => {},
                resize: () => {},
                write: () => {},
            }
        }
    }
  }
})

describe("Pty Security", () => {
  test("should prevent creating PTY in directory outside project", async () => {
    // Use a temporary directory for the project
    const projectDir = path.resolve(process.cwd(), "temp-project-pty")

    await Instance.provide({
      directory: projectDir,
      fn: async () => {
        const outsideDir = path.resolve(projectDir, "../") // Parent directory

        // Attempts to create PTY in parent directory
        // This is expected to FAIL once we implement the fix.
        // Currently it might succeed (so this test fails to catch it, or rather passes if I wrote it to expect success).
        // I want to write the test such that it fails NOW (proving vulnerability) and passes LATER.

        // If the vulnerability exists, this will NOT throw.
        // So `expect(...).rejects.toThrow()` will fail.

        await expect(Pty.create({
            cwd: outsideDir,
            command: "echo"
        })).rejects.toThrow("Access denied")
      }
    })
  })
})
