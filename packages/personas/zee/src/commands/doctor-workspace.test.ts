import path from "node:path";

import { describe, expect, it } from "vitest";

import { detectLegacyWorkspaceDirs } from "./doctor-workspace.js";

describe("detectLegacyWorkspaceDirs", () => {
  it("ignores ~/zee when it doesn't look like a workspace (e.g. install dir)", () => {
    const home = "/home/user";
    const workspaceDir = path.join(home, ".zee"); // Active workspace is ~/.zee
    const candidate = path.join(home, "zee"); // Check ~/zee

    const detection = detectLegacyWorkspaceDirs({
      workspaceDir,
      homedir: () => home,
      exists: (value) => value === candidate, // ~/zee exists but has no markers
    });

    expect(detection.activeWorkspace).toBe(path.resolve(workspaceDir));
    expect(detection.legacyDirs).toEqual([]); // Not flagged because no workspace markers
  });

  it("flags ~/zee when it contains workspace markers", () => {
    const home = "/home/user";
    const workspaceDir = path.join(home, ".zee"); // Active workspace is ~/.zee
    const candidate = path.join(home, "zee"); // Legacy dir is ~/zee
    const agentsPath = path.join(candidate, "AGENTS.md");

    const detection = detectLegacyWorkspaceDirs({
      workspaceDir,
      homedir: () => home,
      exists: (value) => value === candidate || value === agentsPath,
    });

    expect(detection.legacyDirs).toEqual([candidate]);
  });
});
