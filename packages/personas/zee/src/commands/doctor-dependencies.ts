import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ZeeConfig } from "../config/config.js";
import { note } from "../terminal/note.js";
import { loadWorkspaceSkillEntries } from "../agents/skills/workspace.js";
import type { SkillEntry, SkillInstallSpec } from "../agents/skills/types.js";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import type { DoctorPrompter } from "./doctor-prompter.js";

export type PackageManager =
  | "pacman"
  | "yay"
  | "brew"
  | "apt"
  | "dnf"
  | "cargo"
  | "go"
  | "node"
  | "uv";

export type PlatformInfo = {
  os: "linux" | "darwin" | "win32" | "unknown";
  distro?: "arch" | "debian" | "ubuntu" | "fedora" | "rhel" | "unknown";
  availableManagers: PackageManager[];
  preferredManager?: PackageManager;
};

/**
 * Detect the current platform and available package managers
 */
export function detectPlatform(): PlatformInfo {
  const platform = os.platform();
  const info: PlatformInfo = {
    os: platform === "linux" || platform === "darwin" || platform === "win32" ? platform : "unknown",
    availableManagers: [],
  };

  // Detect Linux distro
  if (platform === "linux") {
    try {
      const osRelease = fs.readFileSync("/etc/os-release", "utf-8");
      if (osRelease.includes("arch") || osRelease.includes("Arch")) {
        info.distro = "arch";
      } else if (osRelease.includes("debian") || osRelease.includes("Debian")) {
        info.distro = "debian";
      } else if (osRelease.includes("ubuntu") || osRelease.includes("Ubuntu")) {
        info.distro = "ubuntu";
      } else if (osRelease.includes("fedora") || osRelease.includes("Fedora")) {
        info.distro = "fedora";
      } else if (osRelease.includes("rhel") || osRelease.includes("Red Hat")) {
        info.distro = "rhel";
      } else {
        info.distro = "unknown";
      }
    } catch {
      info.distro = "unknown";
    }
  }

  // Check for available package managers
  const managers: PackageManager[] = ["pacman", "yay", "brew", "apt", "dnf", "cargo", "go", "node", "uv"];
  for (const manager of managers) {
    if (hasBinary(manager === "node" ? "npm" : manager)) {
      info.availableManagers.push(manager);
    }
  }

  // Set preferred manager based on platform/distro
  if (info.distro === "arch") {
    info.preferredManager = info.availableManagers.includes("yay") ? "yay" : "pacman";
  } else if (info.distro === "debian" || info.distro === "ubuntu") {
    info.preferredManager = "apt";
  } else if (info.distro === "fedora" || info.distro === "rhel") {
    info.preferredManager = "dnf";
  } else if (platform === "darwin") {
    info.preferredManager = "brew";
  }

  return info;
}

/**
 * Check if a binary exists in PATH
 */
export function hasBinary(name: string): boolean {
  try {
    const result = spawnSync("which", [name], { encoding: "utf-8", timeout: 5000 });
    return result.status === 0;
  } catch {
    return false;
  }
}

export type MissingDependency = {
  binary: string;
  skillName: string;
  skillDescription?: string;
  installSpecs: SkillInstallSpec[];
};

/**
 * Scan skills and find missing binary dependencies
 */
export function findMissingDependencies(params: {
  entries: SkillEntry[];
}): MissingDependency[] {
  const missing: MissingDependency[] = [];
  const checkedBinaries = new Map<string, boolean>();

  for (const entry of params.entries) {
    const requiredBins = entry.zee?.requires?.bins ?? [];
    const installSpecs = entry.zee?.install ?? [];

    for (const bin of requiredBins) {
      // Check cache first
      let exists = checkedBinaries.get(bin);
      if (exists === undefined) {
        exists = hasBinary(bin);
        checkedBinaries.set(bin, exists);
      }

      if (!exists) {
        // Find existing entry or create new one
        const existing = missing.find((m) => m.binary === bin);
        if (existing) {
          // Merge install specs from this skill
          for (const spec of installSpecs) {
            if (spec.bins?.includes(bin) && !existing.installSpecs.some((s) => s.id === spec.id)) {
              existing.installSpecs.push(spec);
            }
          }
        } else {
          missing.push({
            binary: bin,
            skillName: entry.skill.name,
            skillDescription: entry.skill.description,
            installSpecs: installSpecs.filter((s: SkillInstallSpec) => s.bins?.includes(bin)),
          });
        }
      }
    }
  }

  return missing;
}

/**
 * Get the install command for a given spec and package manager
 */
export function getInstallCommand(spec: SkillInstallSpec, platform: PlatformInfo): string | null {
  switch (spec.kind) {
    case "pacman":
      if (!platform.availableManagers.includes("pacman")) return null;
      return `sudo pacman -S ${spec.package ?? spec.bins?.[0]}`;

    case "yay":
      if (!platform.availableManagers.includes("yay")) return null;
      return `yay -S ${spec.package ?? spec.bins?.[0]}`;

    case "brew":
      if (!platform.availableManagers.includes("brew")) return null;
      return `brew install ${spec.formula ?? spec.package ?? spec.bins?.[0]}`;

    case "apt":
      if (!platform.availableManagers.includes("apt")) return null;
      return `sudo apt install ${spec.package ?? spec.bins?.[0]}`;

    case "dnf":
      if (!platform.availableManagers.includes("dnf")) return null;
      return `sudo dnf install ${spec.package ?? spec.bins?.[0]}`;

    case "cargo":
      if (!platform.availableManagers.includes("cargo")) return null;
      return `cargo install ${spec.crate ?? spec.package ?? spec.bins?.[0]}`;

    case "go":
      if (!platform.availableManagers.includes("go")) return null;
      return `go install ${spec.module ?? spec.package}`;

    case "node":
      if (!platform.availableManagers.includes("node")) return null;
      return `npm install -g ${spec.package ?? spec.bins?.[0]}`;

    case "uv":
      if (!platform.availableManagers.includes("uv")) return null;
      return `uv tool install ${spec.package ?? spec.bins?.[0]}`;

    case "download":
      // Download specs require manual handling
      return null;

    default:
      return null;
  }
}

/**
 * Find the best install spec for the current platform
 */
export function findBestInstallSpec(
  specs: SkillInstallSpec[],
  platform: PlatformInfo,
): SkillInstallSpec | null {
  // Priority order based on platform
  const priorityOrder: SkillInstallSpec["kind"][] = [];

  if (platform.distro === "arch") {
    priorityOrder.push("pacman", "yay", "cargo", "brew", "node", "go", "uv");
  } else if (platform.distro === "debian" || platform.distro === "ubuntu") {
    priorityOrder.push("apt", "cargo", "brew", "node", "go", "uv");
  } else if (platform.distro === "fedora" || platform.distro === "rhel") {
    priorityOrder.push("dnf", "cargo", "brew", "node", "go", "uv");
  } else if (platform.os === "darwin") {
    priorityOrder.push("brew", "cargo", "node", "go", "uv");
  } else {
    priorityOrder.push("cargo", "brew", "node", "go", "uv", "pacman", "apt", "dnf");
  }

  for (const kind of priorityOrder) {
    const spec = specs.find((s) => s.kind === kind);
    if (spec && getInstallCommand(spec, platform)) {
      return spec;
    }
  }

  // Fall back to any available spec
  for (const spec of specs) {
    if (getInstallCommand(spec, platform)) {
      return spec;
    }
  }

  return null;
}

/**
 * Execute an install command
 */
export function executeInstall(command: string): { success: boolean; output: string } {
  try {
    const output = execSync(command, {
      encoding: "utf-8",
      stdio: ["inherit", "pipe", "pipe"],
      timeout: 300_000, // 5 minute timeout
    });
    return { success: true, output };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, output: message };
  }
}

/**
 * Check and report missing skill dependencies
 */
export async function checkSkillDependencies(params: {
  cfg: ZeeConfig;
  prompter: DoctorPrompter;
  fix?: boolean;
}): Promise<{ installed: string[]; failed: string[]; skipped: string[] }> {
  const { cfg, prompter, fix } = params;
  const result = { installed: [] as string[], failed: [] as string[], skipped: [] as string[] };

  // Load skill entries
  const workspaceDir = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
  const entries = loadWorkspaceSkillEntries(workspaceDir, { config: cfg });

  // Find missing dependencies
  const missing = findMissingDependencies({ entries });

  if (missing.length === 0) {
    return result;
  }

  // Detect platform
  const platform = detectPlatform();

  // Report missing dependencies
  const lines: string[] = [];
  for (const dep of missing) {
    const bestSpec = findBestInstallSpec(dep.installSpecs, platform);
    const installCmd = bestSpec ? getInstallCommand(bestSpec, platform) : null;
    const installHint = installCmd ? ` (${installCmd})` : "";
    lines.push(`- ${dep.binary}: required by ${dep.skillName}${installHint}`);
  }
  note(lines.join("\n"), "Missing skill dependencies");

  if (!fix) {
    note('Run "zee doctor --fix" to install missing dependencies.', "Hint");
    result.skipped = missing.map((d) => d.binary);
    return result;
  }

  // Offer to install each missing dependency
  for (const dep of missing) {
    const bestSpec = findBestInstallSpec(dep.installSpecs, platform);
    if (!bestSpec) {
      note(`No install method available for ${dep.binary} on this platform.`, "Skip");
      result.skipped.push(dep.binary);
      continue;
    }

    const installCmd = getInstallCommand(bestSpec, platform);
    if (!installCmd) {
      result.skipped.push(dep.binary);
      continue;
    }

    const shouldInstall = await prompter.confirmRepair({
      message: `Install ${dep.binary}? (${installCmd})`,
      initialValue: true,
    });

    if (!shouldInstall) {
      result.skipped.push(dep.binary);
      continue;
    }

    note(`Installing ${dep.binary}...`, "Install");
    const installResult = executeInstall(installCmd);

    if (installResult.success) {
      note(`Installed ${dep.binary} successfully.`, "Success");
      result.installed.push(dep.binary);
    } else {
      note(`Failed to install ${dep.binary}: ${installResult.output}`, "Error");
      result.failed.push(dep.binary);
    }
  }

  return result;
}

/**
 * Note missing skill dependencies (non-interactive check only)
 */
export function noteSkillDependencies(params: {
  cfg: ZeeConfig;
}): MissingDependency[] {
  const { cfg } = params;

  // Load skill entries
  const workspaceDir = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
  const entries = loadWorkspaceSkillEntries(workspaceDir, { config: cfg });

  // Find missing dependencies
  const missing = findMissingDependencies({ entries });

  if (missing.length === 0) {
    return [];
  }

  // Detect platform
  const platform = detectPlatform();

  // Report missing dependencies
  const lines: string[] = [];
  for (const dep of missing) {
    const bestSpec = findBestInstallSpec(dep.installSpecs, platform);
    const installCmd = bestSpec ? getInstallCommand(bestSpec, platform) : null;
    const installHint = installCmd ? ` (${installCmd})` : "";
    lines.push(`- ${dep.binary}: required by ${dep.skillName}${installHint}`);
  }
  note(lines.join("\n"), "Missing skill dependencies");
  note('Run "zee doctor --fix" to install missing dependencies.', "Hint");

  return missing;
}
