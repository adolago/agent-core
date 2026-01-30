import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  resolveDefaultConfigCandidates,
  resolveConfigPath,
  resolveOAuthDir,
  resolveOAuthPath,
  resolveStateDir,
} from "./paths.js";

describe("oauth paths", () => {
  it("prefers ZEE_OAUTH_DIR over ZEE_STATE_DIR", () => {
    const env = {
      ZEE_OAUTH_DIR: "/custom/oauth",
      ZEE_STATE_DIR: "/custom/state",
    } as NodeJS.ProcessEnv;

    expect(resolveOAuthDir(env, "/custom/state")).toBe(path.resolve("/custom/oauth"));
    expect(resolveOAuthPath(env, "/custom/state")).toBe(
      path.join(path.resolve("/custom/oauth"), "oauth.json"),
    );
  });

  it("derives oauth path from ZEE_STATE_DIR when unset", () => {
    const env = {
      ZEE_STATE_DIR: "/custom/state",
    } as NodeJS.ProcessEnv;

    expect(resolveOAuthDir(env, "/custom/state")).toBe(path.join("/custom/state", "credentials"));
    expect(resolveOAuthPath(env, "/custom/state")).toBe(
      path.join("/custom/state", "credentials", "oauth.json"),
    );
  });
});

describe("state + config path candidates", () => {
  it("prefers ZEE_STATE_DIR over legacy state dir env", () => {
    const env = {
      ZEE_STATE_DIR: "/new/state",
      ZEE_STATE_DIR: "/legacy/state",
    } as NodeJS.ProcessEnv;

    expect(resolveStateDir(env, () => "/home/test")).toBe(path.resolve("/new/state"));
  });

  it("orders default config candidates as new then legacy", () => {
    const home = "/home/test";
    const candidates = resolveDefaultConfigCandidates({} as NodeJS.ProcessEnv, () => home);
    expect(candidates[0]).toBe(path.join(home, ".zee", "zee.json"));
    expect(candidates[1]).toBe(path.join(home, ".zee", "zee.json"));
    expect(candidates[2]).toBe(path.join(home, ".zee", "zee.json"));
    expect(candidates[3]).toBe(path.join(home, ".zee", "zee.json"));
  });

  it("prefers ~/.zee when it exists and legacy dir is missing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "zee-state-"));
    try {
      const newDir = path.join(root, ".zee");
      await fs.mkdir(newDir, { recursive: true });
      const resolved = resolveStateDir({} as NodeJS.ProcessEnv, () => root);
      expect(resolved).toBe(newDir);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("CONFIG_PATH prefers existing legacy filename when present", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "zee-config-"));
    const previousHome = process.env.HOME;
    const previousUserProfile = process.env.USERPROFILE;
    const previousHomeDrive = process.env.HOMEDRIVE;
    const previousHomePath = process.env.HOMEPATH;
    const previousZeeConfig = process.env.ZEE_CONFIG_PATH;
    const previousZeeConfig = process.env.ZEE_CONFIG_PATH;
    const previousZeeState = process.env.ZEE_STATE_DIR;
    const previousZeeState = process.env.ZEE_STATE_DIR;
    try {
      const legacyDir = path.join(root, ".zee");
      await fs.mkdir(legacyDir, { recursive: true });
      const legacyPath = path.join(legacyDir, "zee.json");
      await fs.writeFile(legacyPath, "{}", "utf-8");

      process.env.HOME = root;
      if (process.platform === "win32") {
        process.env.USERPROFILE = root;
        const parsed = path.win32.parse(root);
        process.env.HOMEDRIVE = parsed.root.replace(/\\$/, "");
        process.env.HOMEPATH = root.slice(parsed.root.length - 1);
      }
      delete process.env.ZEE_CONFIG_PATH;
      delete process.env.ZEE_CONFIG_PATH;
      delete process.env.ZEE_STATE_DIR;
      delete process.env.ZEE_STATE_DIR;

      vi.resetModules();
      const { CONFIG_PATH } = await import("./paths.js");
      expect(CONFIG_PATH).toBe(legacyPath);
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
      if (previousUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = previousUserProfile;
      if (previousHomeDrive === undefined) delete process.env.HOMEDRIVE;
      else process.env.HOMEDRIVE = previousHomeDrive;
      if (previousHomePath === undefined) delete process.env.HOMEPATH;
      else process.env.HOMEPATH = previousHomePath;
      if (previousZeeConfig === undefined) delete process.env.ZEE_CONFIG_PATH;
      else process.env.ZEE_CONFIG_PATH = previousZeeConfig;
      if (previousZeeConfig === undefined) delete process.env.ZEE_CONFIG_PATH;
      else process.env.ZEE_CONFIG_PATH = previousZeeConfig;
      if (previousZeeState === undefined) delete process.env.ZEE_STATE_DIR;
      else process.env.ZEE_STATE_DIR = previousZeeState;
      if (previousZeeState === undefined) delete process.env.ZEE_STATE_DIR;
      else process.env.ZEE_STATE_DIR = previousZeeState;
      await fs.rm(root, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it("respects state dir overrides when config is missing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "zee-config-override-"));
    try {
      const legacyDir = path.join(root, ".zee");
      await fs.mkdir(legacyDir, { recursive: true });
      const legacyConfig = path.join(legacyDir, "zee.json");
      await fs.writeFile(legacyConfig, "{}", "utf-8");

      const overrideDir = path.join(root, "override");
      const env = { ZEE_STATE_DIR: overrideDir } as NodeJS.ProcessEnv;
      const resolved = resolveConfigPath(env, overrideDir, () => root);
      expect(resolved).toBe(path.join(overrideDir, "zee.json"));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
