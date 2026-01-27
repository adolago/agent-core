import path from "path"
import { Instance } from "../project/instance"
import { Filesystem } from "../util/filesystem"

/**
 * Dynamic instruction loading for AGENTS.md files.
 *
 * As the agent explores the codebase and reads files, this module auto-loads
 * any AGENTS.md files found in the accessed directories or their parents
 * (up to the project root). This allows subdirectories to have their own
 * specialized instructions that are loaded on-demand.
 */
export namespace InstructionPrompt {
  const INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md"]

  /**
   * Tracks which instruction file paths have been loaded per session.
   * Uses a Map keyed by sessionID to avoid re-loading the same file.
   */
  const loadedInstructions = Instance.state(
    () => new Map<string, Set<string>>(),
    async (state) => state.clear()
  )

  /**
   * Resolve any new instruction files for a given file path.
   * Looks for AGENTS.md or CLAUDE.md files in the directory of the file
   * and its parent directories up to the project root.
   *
   * @param sessionID - The session ID to track loaded instructions
   * @param filepath - The absolute path to the file being accessed
   * @returns Array of instruction content strings (with source header) for newly discovered files
   */
  export async function resolve(sessionID: string, filepath: string): Promise<string[]> {
    const state = loadedInstructions()
    let sessionLoaded = state.get(sessionID)
    if (!sessionLoaded) {
      sessionLoaded = new Set()
      state.set(sessionID, sessionLoaded)
    }

    const instructions: string[] = []
    const projectRoot = Instance.directory
    const worktree = Instance.worktree

    // Get the directory of the file being accessed
    const fileDir = path.dirname(filepath)

    // Only look for instructions if the file is within the project
    if (!Filesystem.contains(projectRoot, filepath) && !Filesystem.contains(worktree, filepath)) {
      return instructions
    }

    // Walk up from the file's directory to the project root
    // looking for instruction files that haven't been loaded yet
    let currentDir = fileDir
    const root = worktree !== "/" ? worktree : projectRoot

    while (Filesystem.contains(root, currentDir) || currentDir === root) {
      for (const instructionFile of INSTRUCTION_FILES) {
        const instructionPath = path.join(currentDir, instructionFile)

        // Skip if already loaded for this session
        if (sessionLoaded.has(instructionPath)) continue

        // Check if the file exists
        const file = Bun.file(instructionPath)
        if (await file.exists()) {
          try {
            const content = await file.text()
            if (content.trim()) {
              sessionLoaded.add(instructionPath)

              // Format with source path for transparency
              const relativePath = path.relative(projectRoot, instructionPath)
              instructions.push(
                `<dynamic-instruction source="${relativePath}">\n${content}\n</dynamic-instruction>`
              )
            }
          } catch {
            // Ignore read errors
          }
        }
      }

      // Move to parent directory
      const parentDir = path.dirname(currentDir)
      if (parentDir === currentDir) break // Reached filesystem root
      currentDir = parentDir
    }

    return instructions
  }

  /**
   * Clear loaded instructions for a session.
   * Called when a session is reset or reverted.
   */
  export function clear(sessionID: string): void {
    const state = loadedInstructions()
    state.delete(sessionID)
  }

  /**
   * Check if any instructions have been loaded for a session.
   */
  export function hasLoaded(sessionID: string): boolean {
    const state = loadedInstructions()
    const loaded = state.get(sessionID)
    return loaded !== undefined && loaded.size > 0
  }

  /**
   * Get the count of loaded instruction files for a session.
   */
  export function loadedCount(sessionID: string): number {
    const state = loadedInstructions()
    return state.get(sessionID)?.size ?? 0
  }
}
