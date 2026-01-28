import JSON5 from "json5";
import type { Skill } from "@mariozechner/pi-coding-agent";

import { parseFrontmatterBlock } from "../../markdown/frontmatter.js";
import { parseBooleanValue } from "../../utils/boolean.js";
import type {
  ZeeSkillMetadata,
  ParsedSkillFrontmatter,
  SkillEntry,
  SkillInstallSpec,
  SkillInvocationPolicy,
} from "./types.js";

export function parseFrontmatter(content: string): ParsedSkillFrontmatter {
  return parseFrontmatterBlock(content);
}

function normalizeStringList(input: unknown): string[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((value) => String(value).trim()).filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return [];
}

function parseInstallSpec(input: unknown): SkillInstallSpec | undefined {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as Record<string, unknown>;
  const kindRaw =
    typeof raw.kind === "string" ? raw.kind : typeof raw.type === "string" ? raw.type : "";
  const kind = kindRaw.trim().toLowerCase();
  const validKinds = ["brew", "node", "go", "uv", "download", "pacman", "cargo", "apt", "dnf", "yay"];
  if (!validKinds.includes(kind)) {
    return undefined;
  }

  const spec: SkillInstallSpec = {
    kind: kind as SkillInstallSpec["kind"],
  };

  if (typeof raw.id === "string") spec.id = raw.id;
  if (typeof raw.label === "string") spec.label = raw.label;
  const bins = normalizeStringList(raw.bins);
  if (bins.length > 0) spec.bins = bins;
  const osList = normalizeStringList(raw.os);
  if (osList.length > 0) spec.os = osList;
  if (typeof raw.formula === "string") spec.formula = raw.formula;
  if (typeof raw.package === "string") spec.package = raw.package;
  if (typeof raw.module === "string") spec.module = raw.module;
  if (typeof raw.url === "string") spec.url = raw.url;
  if (typeof raw.archive === "string") spec.archive = raw.archive;
  if (typeof raw.extract === "boolean") spec.extract = raw.extract;
  if (typeof raw.stripComponents === "number") spec.stripComponents = raw.stripComponents;
  if (typeof raw.targetDir === "string") spec.targetDir = raw.targetDir;
  if (typeof raw.crate === "string") spec.crate = raw.crate;

  return spec;
}

function getFrontmatterValue(frontmatter: ParsedSkillFrontmatter, key: string): string | undefined {
  const raw = frontmatter[key];
  return typeof raw === "string" ? raw : undefined;
}

function parseFrontmatterBool(value: string | undefined, fallback: boolean): boolean {
  const parsed = parseBooleanValue(value);
  return parsed === undefined ? fallback : parsed;
}

export function resolveZeeMetadata(
  frontmatter: ParsedSkillFrontmatter,
): ZeeSkillMetadata | undefined {
  const raw = getFrontmatterValue(frontmatter, "metadata");
  if (!raw) return undefined;
  try {
    const parsed = JSON5.parse(raw) as { zee?: unknown };
    if (!parsed || typeof parsed !== "object") return undefined;
    const zee = parsed.zee;
    if (!zee || typeof zee !== "object") return undefined;
    const zeeObj = zee as Record<string, unknown>;
    const requiresRaw =
      typeof zeeObj.requires === "object" && zeeObj.requires !== null
        ? (zeeObj.requires as Record<string, unknown>)
        : undefined;
    const installRaw = Array.isArray(zeeObj.install) ? (zeeObj.install as unknown[]) : [];
    const install = installRaw
      .map((entry) => parseInstallSpec(entry))
      .filter((entry): entry is SkillInstallSpec => Boolean(entry));
    const osRaw = normalizeStringList(zeeObj.os);
    return {
      always: typeof zeeObj.always === "boolean" ? zeeObj.always : undefined,
      emoji: typeof zeeObj.emoji === "string" ? zeeObj.emoji : undefined,
      homepage: typeof zeeObj.homepage === "string" ? zeeObj.homepage : undefined,
      skillKey: typeof zeeObj.skillKey === "string" ? zeeObj.skillKey : undefined,
      primaryEnv: typeof zeeObj.primaryEnv === "string" ? zeeObj.primaryEnv : undefined,
      os: osRaw.length > 0 ? osRaw : undefined,
      requires: requiresRaw
        ? {
            bins: normalizeStringList(requiresRaw.bins),
            anyBins: normalizeStringList(requiresRaw.anyBins),
            env: normalizeStringList(requiresRaw.env),
            config: normalizeStringList(requiresRaw.config),
          }
        : undefined,
      install: install.length > 0 ? install : undefined,
    };
  } catch {
    return undefined;
  }
}

export function resolveSkillInvocationPolicy(
  frontmatter: ParsedSkillFrontmatter,
): SkillInvocationPolicy {
  return {
    userInvocable: parseFrontmatterBool(getFrontmatterValue(frontmatter, "user-invocable"), true),
    disableModelInvocation: parseFrontmatterBool(
      getFrontmatterValue(frontmatter, "disable-model-invocation"),
      false,
    ),
  };
}

export function resolveSkillKey(skill: Skill, entry?: SkillEntry): string {
  return entry?.zee?.skillKey ?? skill.name;
}
