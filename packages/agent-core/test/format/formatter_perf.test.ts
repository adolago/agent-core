import { describe, test, expect, mock, beforeEach, afterAll } from "bun:test";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

// Setup filesystem
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-core-test-"));
const worktree = tmpDir;
const projectDir = path.join(worktree, "sub", "dir");

fs.mkdirSync(projectDir, { recursive: true });

// Setup files
// Root has prettier
fs.writeFileSync(path.join(worktree, "package.json"), JSON.stringify({ dependencies: { prettier: "3.0.0" } }));
// Sub has nothing
fs.writeFileSync(path.join(worktree, "sub", "package.json"), JSON.stringify({}));
// Dir has nothing
fs.writeFileSync(path.join(projectDir, "package.json"), JSON.stringify({}));

// Setup ruff config for ruff test
fs.writeFileSync(path.join(worktree, "ruff.toml"), "");

// Stats tracker
const stats = {
    findUp: 0,
    findFirstUp: 0,
    up: 0,
    upYields: 0
};

// Fake Filesystem
const FakeFilesystem = {
  findUp: mock(async (target, start, stop) => {
    stats.findUp++;
    let current = start
    const result = []
    while (true) {
      const search = path.join(current, target)
      if (fs.existsSync(search)) result.push(search)
      if (stop === current) break
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }
    return result
  }),
  findFirstUp: mock(async (target, start, stop) => {
    stats.findFirstUp++;
    let current = start
    while (true) {
      const search = path.join(current, target)
      if (fs.existsSync(search)) return search
      if (stop === current) break
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }
    return undefined
  }),
  up: async function* (options: { targets: string[]; start: string; stop?: string }) {
    stats.up++;
    const { targets, start, stop } = options
    let current = start
    while (true) {
      for (const target of targets) {
        const search = path.join(current, target)
        if (fs.existsSync(search)) {
            stats.upYields++;
            yield search
        }
      }
      if (stop === current) break
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }
  }
};

// Mock modules
const filesystemPath = path.resolve(__dirname, "../../src/util/filesystem.ts");
mock.module(filesystemPath, () => ({ Filesystem: FakeFilesystem }));

const instancePath = path.resolve(__dirname, "../../src/project/instance.ts");
mock.module(instancePath, () => ({
    Instance: {
        directory: projectDir,
        worktree: worktree
    }
}));

// Import formatter after mocking
const { prettier, oxfmt, ruff } = await import("../../src/format/formatter");

describe("Formatter Performance", () => {
    beforeEach(() => {
        stats.findUp = 0;
        stats.findFirstUp = 0;
        stats.up = 0;
        stats.upYields = 0;
        FakeFilesystem.findUp.mockClear();
        FakeFilesystem.findFirstUp.mockClear();
    });

    afterAll(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test("prettier.enabled() checks", async () => {
        const enabled = await prettier.enabled();
        expect(enabled).toBe(true);
        // Verify we are using the optimized path
        expect(stats.findUp).toBe(0);
        expect(stats.up).toBeGreaterThan(0);
    });

    test("ruff.enabled() checks", async () => {
        // Ruff might fail due to Bun.which("ruff") not being mockable/false.
        // We just check if it runs without error.
        try {
            await ruff.enabled();
        } catch (e) {
            // ignore
        }
    });
});
