import { describe, it, expect } from "vitest";
import {
  containsShellMetacharacters,
  isValidPathValue,
  getDefaultPath,
  sanitizeEnvForShell,
  validateUserEnv,
} from "./env-sanitize.js";

describe("containsShellMetacharacters", () => {
  it("returns false for safe strings", () => {
    expect(containsShellMetacharacters("/usr/local/bin")).toBe(false);
    expect(containsShellMetacharacters("PATH_VAR")).toBe(false);
    expect(containsShellMetacharacters("normal text")).toBe(false);
  });

  it("returns true for command substitution", () => {
    expect(containsShellMetacharacters("$(whoami)")).toBe(true);
    expect(containsShellMetacharacters("`id`")).toBe(true);
  });

  it("returns true for shell metacharacters", () => {
    expect(containsShellMetacharacters("foo|bar")).toBe(true);
    expect(containsShellMetacharacters("foo;bar")).toBe(true);
    expect(containsShellMetacharacters("foo&bar")).toBe(true);
    expect(containsShellMetacharacters("foo>bar")).toBe(true);
    expect(containsShellMetacharacters("foo<bar")).toBe(true);
    expect(containsShellMetacharacters("$(rm -rf /)")).toBe(true);
  });
});

describe("isValidPathValue", () => {
  it("returns true for valid Unix paths", () => {
    expect(isValidPathValue("/usr/local/bin:/usr/bin:/bin")).toBe(true);
    expect(isValidPathValue("/home/user/.local/bin")).toBe(true);
    expect(isValidPathValue("/opt/homebrew/bin")).toBe(true);
  });

  it("returns true for valid Windows paths", () => {
    expect(isValidPathValue("C:\\Windows\\System32;C:\\Windows")).toBe(true);
    expect(isValidPathValue("C:\\Program Files\\node")).toBe(true);
  });

  it("returns true for paths with spaces", () => {
    expect(isValidPathValue("/path/with spaces/bin")).toBe(true);
  });

  it("returns false for paths with command substitution", () => {
    expect(isValidPathValue("/usr/bin:$(touch /tmp/pwned)")).toBe(false);
    expect(isValidPathValue("`rm -rf /`:bin")).toBe(false);
  });

  it("returns false for paths with shell metacharacters", () => {
    expect(isValidPathValue("/usr/bin|/etc")).toBe(false);
    expect(isValidPathValue("/usr/bin;rm -rf /")).toBe(false);
  });
});

describe("getDefaultPath", () => {
  it("returns platform-appropriate default", () => {
    const defaultPath = getDefaultPath();
    if (process.platform === "win32") {
      expect(defaultPath).toContain("Windows");
    } else {
      expect(defaultPath).toContain("/usr/bin");
    }
  });
});

describe("sanitizeEnvForShell", () => {
  it("preserves safe environment", () => {
    const env = { PATH: "/usr/bin:/bin", HOME: "/home/user" };
    const result = sanitizeEnvForShell(env);
    expect(result.env.PATH).toBe("/usr/bin:/bin");
    expect(result.env.HOME).toBe("/home/user");
    expect(result.warnings).toHaveLength(0);
  });

  it("replaces dangerous PATH with default", () => {
    const env = { PATH: "/usr/bin:$(whoami)", HOME: "/home/user" };
    const result = sanitizeEnvForShell(env);
    expect(result.env.PATH).not.toContain("$(whoami)");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("removes variables with command substitution", () => {
    const env = { PATH: "/usr/bin", MALICIOUS: "$(rm -rf /)" };
    const result = sanitizeEnvForShell(env);
    expect(result.env.MALICIOUS).toBeUndefined();
    expect(result.warnings.some((w) => w.includes("MALICIOUS"))).toBe(true);
  });

  it("removes variables with backtick substitution", () => {
    const env = { PATH: "/usr/bin", EVIL: "`id`" };
    const result = sanitizeEnvForShell(env);
    expect(result.env.EVIL).toBeUndefined();
  });
});

describe("validateUserEnv", () => {
  it("allows safe environment variables", () => {
    const userEnv = { MY_VAR: "safe_value", ANOTHER: "also_safe" };
    const result = validateUserEnv(userEnv);
    expect(result.MY_VAR).toBe("safe_value");
    expect(result.ANOTHER).toBe("also_safe");
  });

  it("allows undefined input", () => {
    const result = validateUserEnv(undefined);
    expect(result).toEqual({});
  });

  it("rejects PATH with shell metacharacters", () => {
    const userEnv = { PATH: "/usr/bin:$(whoami)" };
    expect(() => validateUserEnv(userEnv)).toThrow("Invalid PATH value");
  });

  it("rejects values with command substitution", () => {
    const userEnv = { EVIL: "$(rm -rf /)" };
    expect(() => validateUserEnv(userEnv)).toThrow("command substitution");
  });

  it("rejects values with backtick substitution", () => {
    const userEnv = { EVIL: "`id`" };
    expect(() => validateUserEnv(userEnv)).toThrow("command substitution");
  });

  it("handles case-insensitive PATH validation", () => {
    const userEnv = { path: "$(whoami)" };
    expect(() => validateUserEnv(userEnv)).toThrow("Invalid PATH value");
  });
});
