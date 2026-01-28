/**
 * Doctor Dependencies - Check and auto-install skill dependencies
 *
 * Detects missing dependencies for skills and optionally installs them
 * using the appropriate package manager for the current platform.
 */

import { exec, execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { ZeeConfig } from "../config/config.js";
import { note } from "../terminal/note.js";
import type { DoctorPrompter } from "./doctor-prompter.js";

const execAsync = promisify(exec);

type Platform = "arch" | "debian" | "ubuntu" | "fedora" | "rhel" | "macos" | "unknown";
type InstallKind = "brew" | "node" | "go" | "uv" | "download" | "pacman" | "cargo" | "apt" | "dnf" | "yay";

interface SkillInstallSpec {
  id?: string;
  kind: InstallKind;
  label?: string;
  bins?: string[];
  os?: string[];
  formula?: string;
  package?: string;
  packages?: string[];
  module?: string;
  url?: string;
  archive?: string;
  extract?: boolean;
  stripComponents?: number;
  targetDir?: string;
  crate?: string;
}

interface SkillFrontmatter {
  name?: string;
  description?: string;
  install?: SkillInstallSpec[];
}

interface MissingDependency {
  skillName: string;
  skillPath: string;
  binary: string;
  installSpecs: SkillInstallSpec[];
}

interface CheckSkillDependenciesOptions {
  cfg: ZeeConfig;
  prompter: DoctorPrompter;
  fix: boolean;
}

/**
 * Detect the current platform/distro
 */
function detectPlatform(): Platform {
  if (process.platform === "darwin") return "macos";
  if (process.platform !== "linux") return "unknown";

  // Check for Linux distro
  try {
    if (existsSync("/etc/os-release")) {
      const osRelease = readFileSync("/etc/os-release", "utf-8");
      const idMatch = osRelease.match(/^ID=(.*)$/m);
      const id = idMatch?.[1]?.replace(/"/g, "").toLowerCase() ?? "";

      if (id === "arch" || id === "manjaro" || id === "endeavouros") return "arch";
      if (id === "debian") return "debian";
      if (id === "ubuntu" || id === "linuxmint" || id === "pop") return "ubuntu";
      if (id === "fedora") return "fedora";
      if (id === "rhel" || id === "centos" || id === "rocky" || id === "almalinux") return "rhel";
    }
  } catch {
    // ignore
  }

  // Check for package managers as fallback
  if (existsSync("/usr/bin/pacman")) return "arch";
  if (existsSync("/usr/bin/apt")) return "debian";
  if (existsSync("/usr/bin/dnf")) return "fedora";

  return "unknown";
}

/**
 * Check if a binary exists in PATH
 */
function hasBinary(bin: string): boolean {
  try {
    execSync(`which ${bin}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse skill frontmatter from SKILL.md
 */
function parseSkillFrontmatter(content: string): SkillFrontmatter | undefined {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return undefined;

  const yaml = match[1];
  const result: SkillFrontmatter = {};

  // Simple YAML parsing for our use case
  const lines = yaml.split("\n");
  let inInstall = false;
  let currentInstall: Partial<SkillInstallSpec> | undefined;
  const installs: SkillInstallSpec[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("name:")) {
      result.name = trimmed.slice(5).trim().replace(/^["']|["']$/g, "");
    } else if (trimmed.startsWith("description:")) {
      result.description = trimmed.slice(12).trim().replace(/^["']|["']$/g, "");
    } else if (trimmed === "install:" || trimmed.startsWith("install:")) {
      inInstall = true;
    } else if (inInstall && trimmed.startsWith("- kind:")) {
      // New install entry
      if (currentInstall?.kind) {
        installs.push(currentInstall as SkillInstallSpec);
      }
      const kind = trimmed.slice(7).trim().replace(/^["']|["']$/g, "") as InstallKind;
      currentInstall = { kind };
    } else if (inInstall && currentInstall && trimmed.startsWith("bins:")) {
      // bins can be inline or multi-line
      const inline = trimmed.slice(5).trim();
      if (inline.startsWith("[")) {
        // Inline array
        const match = inline.match(/\[(.*?)\]/);
        if (match) {
          currentInstall.bins = match[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
        }
      }
    } else if (inInstall && currentInstall && trimmed.startsWith("- ") && !trimmed.startsWith("- kind:")) {
      // Might be bins array item
      const val = trimmed.slice(2).trim().replace(/^["']|["']$/g, "");
      if (!currentInstall.bins) currentInstall.bins = [];
      currentInstall.bins.push(val);
    } else if (inInstall && currentInstall) {
      // Other fields
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx > 0) {
        const key = trimmed.slice(0, colonIdx).trim();
        const val = trimmed.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (key === "package") currentInstall.package = val;
        if (key === "crate") currentInstall.crate = val;
        if (key === "formula") currentInstall.formula = val;
        if (key === "module") currentInstall.module = val;
        if (key === "label") currentInstall.label = val;
      }
    }
  }

  if (currentInstall?.kind) {
    installs.push(currentInstall as SkillInstallSpec);
  }

  if (installs.length > 0) {
    result.install = installs;
  }

  return result;
}

/**
 * Get all skill directories
 */
function getSkillDirs(): string[] {
  const dirs: string[] = [];

  // Project-local skills
  const localSkillsDir = path.join(process.cwd(), ".claude", "skills");
  if (existsSync(localSkillsDir)) {
    try {
      const entries = readdirSync(localSkillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          dirs.push(path.join(localSkillsDir, entry.name));
        }
      }
    } catch {
      // ignore
    }
  }

  // User skills
  const homeDir = process.env.HOME ?? "";
  const userSkillsDir = path.join(homeDir, ".claude", "skills");
  if (existsSync(userSkillsDir)) {
    try {
      const entries = readdirSync(userSkillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          dirs.push(path.join(userSkillsDir, entry.name));
        }
      }
    } catch {
      // ignore
    }
  }

  // Agent-core config skills
  const agentCoreConfigDir = path.join(homeDir, ".config", "agent-core", "skills");
  if (existsSync(agentCoreConfigDir)) {
    try {
      const entries = readdirSync(agentCoreConfigDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          dirs.push(path.join(agentCoreConfigDir, entry.name));
        }
      }
    } catch {
      // ignore
    }
  }

  return dirs;
}

/**
 * Find all missing dependencies from skills
 */
function findMissingDependencies(): MissingDependency[] {
  const missing: MissingDependency[] = [];
  const skillDirs = getSkillDirs();

  for (const skillDir of skillDirs) {
    const skillMdPath = path.join(skillDir, "SKILL.md");
    if (!existsSync(skillMdPath)) continue;

    try {
      const content = readFileSync(skillMdPath, "utf-8");
      const frontmatter = parseSkillFrontmatter(content);
      if (!frontmatter?.install) continue;

      const skillName = frontmatter.name ?? path.basename(skillDir);

      for (const spec of frontmatter.install) {
        const bins = spec.bins ?? [];
        for (const bin of bins) {
          if (!hasBinary(bin)) {
            // Check if we already have this binary in missing list
            const existing = missing.find((m) => m.binary === bin);
            if (existing) {
              // Add this spec if not already present
              if (!existing.installSpecs.some((s) => s.kind === spec.kind)) {
                existing.installSpecs.push(spec);
              }
            } else {
              missing.push({
                skillName,
                skillPath: skillDir,
                binary: bin,
                installSpecs: [spec],
              });
            }
          }
        }
      }
    } catch {
      // ignore parsing errors
    }
  }

  return missing;
}

/**
 * Find the best install spec for the current platform
 */
function findBestInstallSpec(specs: SkillInstallSpec[], platform: Platform): SkillInstallSpec | undefined {
  // Priority order based on platform
  const kindPriority: Record<Platform, InstallKind[]> = {
    arch: ["pacman", "yay", "cargo", "brew", "node", "go", "uv", "download"],
    debian: ["apt", "cargo", "brew", "node", "go", "uv", "download"],
    ubuntu: ["apt", "cargo", "brew", "node", "go", "uv", "download"],
    fedora: ["dnf", "cargo", "brew", "node", "go", "uv", "download"],
    rhel: ["dnf", "cargo", "brew", "node", "go", "uv", "download"],
    macos: ["brew", "cargo", "node", "go", "uv", "download"],
    unknown: ["cargo", "node", "go", "uv", "download"],
  };

  const priority = kindPriority[platform];

  for (const kind of priority) {
    const spec = specs.find((s) => s.kind === kind);
    if (spec) {
      // Check if the package manager is available
      if (kind === "pacman" && !hasBinary("pacman")) continue;
      if (kind === "yay" && !hasBinary("yay")) continue;
      if (kind === "apt" && !hasBinary("apt")) continue;
      if (kind === "dnf" && !hasBinary("dnf")) continue;
      if (kind === "brew" && !hasBinary("brew")) continue;
      if (kind === "cargo" && !hasBinary("cargo")) continue;
      if (kind === "node" && !hasBinary("npm") && !hasBinary("pnpm") && !hasBinary("bun")) continue;
      if (kind === "go" && !hasBinary("go")) continue;
      if (kind === "uv" && !hasBinary("uv")) continue;
      return spec;
    }
  }

  return specs[0]; // Fallback to first spec
}

/**
 * Get the install command for a spec
 */
function getInstallCommand(spec: SkillInstallSpec): string | undefined {
  switch (spec.kind) {
    case "pacman":
      return spec.package ? `sudo pacman -S ${spec.package}` : undefined;
    case "yay":
      return spec.package ? `yay -S ${spec.package}` : undefined;
    case "apt":
      return spec.package ? `sudo apt install ${spec.package}` : undefined;
    case "dnf":
      return spec.package ? `sudo dnf install ${spec.package}` : undefined;
    case "brew":
      return spec.formula ? `brew install ${spec.formula}` : undefined;
    case "cargo":
      return spec.crate ? `cargo install ${spec.crate}` : undefined;
    case "node":
      return spec.module ? `npm install -g ${spec.module}` : undefined;
    case "go":
      return spec.module ? `go install ${spec.module}` : undefined;
    case "uv":
      return spec.module ? `uv tool install ${spec.module}` : undefined;
    default:
      return undefined;
  }
}

/**
 * Execute an install command
 */
async function executeInstall(command: string): Promise<{ success: boolean; error?: string }> {
  try {
    await execAsync(command, { timeout: 300000 }); // 5 min timeout
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
  }
}

/**
 * Check and optionally install missing skill dependencies
 */
export async function checkSkillDependencies(options: CheckSkillDependenciesOptions): Promise<void> {
  const { prompter, fix } = options;

  const missing = findMissingDependencies();
  if (missing.length === 0) return;

  const platform = detectPlatform();

  // Group by binary for cleaner output
  const lines: string[] = [`Found ${missing.length} missing skill dependencies:`];
  for (const dep of missing) {
    const spec = findBestInstallSpec(dep.installSpecs, platform);
    const cmd = spec ? getInstallCommand(spec) : undefined;
    lines.push(`  - ${dep.binary} (required by: ${dep.skillName})${cmd ? ` [${cmd}]` : ""}`);
  }

  note(lines.join("\n"), "Skill Dependencies");

  if (!fix) {
    return;
  }

  // Ask to install each
  for (const dep of missing) {
    const spec = findBestInstallSpec(dep.installSpecs, platform);
    if (!spec) continue;

    const cmd = getInstallCommand(spec);
    if (!cmd) continue;

    const shouldInstall = await prompter.confirmRepair({
      message: `Install ${dep.binary} using: ${cmd}?`,
      initialValue: true,
    });

    if (shouldInstall) {
      note(`Installing ${dep.binary}...`, "Skill Dependencies");
      const result = await executeInstall(cmd);
      if (result.success) {
        note(`Installed ${dep.binary} successfully.`, "Skill Dependencies");
      } else {
        note(`Failed to install ${dep.binary}: ${result.error}`, "Skill Dependencies");
      }
    }
  }
}
