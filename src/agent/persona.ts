/**
 * Persona Module - Identity and persona management
 *
 * This module handles loading and managing agent personas from various sources:
 * - Built-in personas (src/agent/personas/)
 * - Identity files (IDENTITY.md, SOUL.md)
 * - Project personas (.agent-core/persona/)
 * - Config overrides
 */

import { z } from "zod";
import { AgentInfo, AgentMode, Permission, parseModelString } from "./agent";

/**
 * Soul layer - Core values and personality traits
 * Loaded from SOUL.md or soul.yaml
 */
export const Soul = z.object({
  /** Core truths/principles the agent follows */
  truths: z.array(z.string()),

  /** Boundaries the agent must respect */
  boundaries: z.array(z.string()),

  /** Personality and communication style */
  vibe: z.object({
    traits: z.array(z.string()),
    communication: z.string().optional(),
  }),

  /** Named directives (e.g., privacy, continuity) */
  directives: z.record(z.string(), z.string()).optional(),

  /** Goal or purpose */
  goal: z.string().optional(),
});
export type Soul = z.infer<typeof Soul>;

/**
 * Identity layer - Who the agent is
 * Loaded from IDENTITY.md or identity.yaml
 */
export const Identity = z.object({
  /** Agent name */
  name: z.string(),

  /** What kind of entity (e.g., "AI companion") */
  creature: z.string().optional(),

  /** Short description of personality/vibe */
  vibe: z.string().optional(),

  /** Optional emoji representation (or "none") */
  emoji: z.string().optional(),

  /** Extended about section */
  about: z.string().optional(),

  /** Infrastructure/context information */
  infrastructure: z.record(z.string(), z.string()).optional(),

  /** How identity persists across sessions */
  continuity: z.string().optional(),

  /** Core values */
  values: z.array(z.string()).optional(),
});
export type Identity = z.infer<typeof Identity>;

/**
 * Persona definition - Role-specific configuration
 * Loaded from persona YAML/MD files
 */
export const PersonaDefinition = z.object({
  // === Identity ===

  /** Persona name/identifier */
  name: z.string(),

  /** Description of when to use this persona */
  description: z.string(),

  /** Operating mode */
  mode: AgentMode.default("primary"),

  // === Categorization ===

  /** Use case category */
  useCase: z.enum(["stanley", "zee", "opencode", "custom"]).optional(),

  /** Display color */
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),

  // === Model Configuration ===

  /** Model in format "provider/model" */
  model: z.string().optional(),

  /** Temperature for generation */
  temperature: z.number().min(0).max(2).optional(),

  /** Top-P sampling */
  topP: z.number().min(0).max(1).optional(),

  /** Maximum agentic steps */
  maxSteps: z.number().int().positive().optional(),

  // === Tools ===

  /** Tool overrides (true = enabled, false = disabled) */
  tools: z.record(z.string(), z.boolean()).optional(),

  // === Permissions ===

  /** Permission overrides */
  permission: z
    .object({
      edit: Permission.optional(),
      bash: z.union([Permission, z.record(z.string(), Permission)]).optional(),
      skill: z.union([Permission, z.record(z.string(), Permission)]).optional(),
      mcp: z.union([Permission, z.record(z.string(), Permission)]).optional(),
      webfetch: Permission.optional(),
      external_directory: Permission.optional(),
      doom_loop: Permission.optional(),
    })
    .optional(),

  // === Prompt ===

  /** System prompt content */
  prompt: z.string().optional(),

  // === Identity Files ===

  /** Paths to identity files to load */
  identityFiles: z.array(z.string()).optional(),

  // === Inheritance ===

  /** Parent persona to extend */
  extends: z.string().optional(),

  // === Visibility ===

  /** Whether to hide from user selection */
  hidden: z.boolean().optional(),

  /** Whether this is the default persona */
  default: z.boolean().optional(),
});
export type PersonaDefinition = z.infer<typeof PersonaDefinition>;

/**
 * Persona configuration for loading
 */
export const PersonaConfig = z.object({
  /** Path to IDENTITY.md file */
  identityPath: z.string().optional(),

  /** Path to SOUL.md file */
  soulPath: z.string().optional(),

  /** Directories to scan for personas */
  personaDirs: z.array(z.string()).optional(),

  /** Active persona name */
  activePersona: z.string().optional(),

  /** Default persona if none specified */
  defaultPersona: z.string().optional(),
});
export type PersonaConfig = z.infer<typeof PersonaConfig>;

/**
 * Loaded identity context
 */
export interface IdentityContext {
  identity?: Identity;
  soul?: Soul;
  prompt?: string;
}

/**
 * Persona namespace for persona management
 */
export namespace Persona {
  /** Schema exports */
  export const Definition = PersonaDefinition;
  export const Config = PersonaConfig;

  /**
   * Parse markdown frontmatter from a persona file
   */
  export function parseFrontmatter(content: string): {
    data: Record<string, unknown>;
    content: string;
  } {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return { data: {}, content: content.trim() };
    }

    // Simple YAML parsing for frontmatter
    const yaml = match[1];
    const body = match[2];
    const data: Record<string, unknown> = {};

    // Parse basic YAML key-value pairs
    const lines = yaml.split("\n");
    let currentKey = "";
    let currentArray: string[] | null = null;
    let currentObject: Record<string, unknown> | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      // Array item
      if (trimmed.startsWith("- ")) {
        if (currentArray) {
          currentArray.push(trimmed.slice(2).trim().replace(/^["']|["']$/g, ""));
        }
        continue;
      }

      // Key-value pair
      const colonIndex = trimmed.indexOf(":");
      if (colonIndex > 0) {
        // Save previous array/object
        if (currentKey && currentArray) {
          if (currentObject) {
            currentObject[currentKey] = currentArray;
          } else {
            data[currentKey] = currentArray;
          }
          currentArray = null;
        }

        const key = trimmed.slice(0, colonIndex).trim();
        const value = trimmed.slice(colonIndex + 1).trim();

        // Check indentation for nested objects
        const indent = line.length - line.trimStart().length;

        if (indent > 0 && currentObject) {
          // Nested key-value
          if (value) {
            currentObject[key] = parseYamlValue(value);
          } else {
            currentKey = key;
            currentArray = [];
          }
        } else {
          // Top-level key
          if (currentObject && currentKey) {
            data[currentKey] = currentObject;
            currentObject = null;
          }

          if (value) {
            data[key] = parseYamlValue(value);
            currentKey = "";
          } else {
            currentKey = key;
            // Check if next line is indented (object) or starts with - (array)
            const nextLineIndex = lines.indexOf(line) + 1;
            if (nextLineIndex < lines.length) {
              const nextLine = lines[nextLineIndex];
              if (nextLine.trim().startsWith("-")) {
                currentArray = [];
              } else if (nextLine.startsWith("  ")) {
                currentObject = {};
              }
            }
          }
        }
      }
    }

    // Save final array/object
    if (currentKey) {
      if (currentArray) {
        if (currentObject) {
          currentObject[currentKey] = currentArray;
          data[currentKey] = currentObject;
        } else {
          data[currentKey] = currentArray;
        }
      } else if (currentObject) {
        data[currentKey] = currentObject;
      }
    }

    return { data, content: body.trim() };
  }

  /**
   * Parse a YAML value string
   */
  function parseYamlValue(value: string): unknown {
    // Remove quotes
    const unquoted = value.replace(/^["']|["']$/g, "");

    // Boolean
    if (unquoted === "true") return true;
    if (unquoted === "false") return false;

    // Number
    const num = Number(unquoted);
    if (!isNaN(num) && unquoted !== "") return num;

    // String
    return unquoted;
  }

  /**
   * Parse IDENTITY.md format
   */
  export function parseIdentityMd(content: string): Identity {
    const result: Partial<Identity> = {};

    // Parse bullet points with bold labels
    const labelRegex = /\*\*([^*]+)\*\*:\s*(.+)/g;
    let match;
    while ((match = labelRegex.exec(content)) !== null) {
      const label = match[1].toLowerCase();
      const value = match[2].trim();

      switch (label) {
        case "name":
          result.name = value;
          break;
        case "creature":
          result.creature = value;
          break;
        case "vibe":
          result.vibe = value;
          break;
        case "emoji":
          result.emoji = value === "(none)" ? undefined : value;
          break;
      }
    }

    // Parse "About Me" section
    const aboutMatch = content.match(/## About Me\s*\n([\s\S]*?)(?=\n##|$)/);
    if (aboutMatch) {
      result.about = aboutMatch[1].trim();
    }

    // Parse values from bullet points
    const valuesMatch = content.match(/I value:\s*\n((?:\s*-\s+\*\*[^*]+\*\*.*\n?)+)/);
    if (valuesMatch) {
      result.values = [];
      const valueRegex = /-\s+\*\*([^*]+)\*\*/g;
      let valueMatch;
      while ((valueMatch = valueRegex.exec(valuesMatch[1])) !== null) {
        result.values.push(valueMatch[1]);
      }
    }

    // Parse infrastructure
    const infraMatch = content.match(/## My Infrastructure\s*\n([\s\S]*?)(?=\n##|$)/);
    if (infraMatch) {
      result.infrastructure = {};
      const infraRegex = /-\s+\*\*([^*]+)\*\*:\s*(.+)/g;
      let infraItem;
      while ((infraItem = infraRegex.exec(infraMatch[1])) !== null) {
        result.infrastructure[infraItem[1].toLowerCase()] = infraItem[2].trim();
      }
    }

    // Parse continuity
    const continuityMatch = content.match(/## Continuity\s*\n([\s\S]*?)(?=\n##|$)/);
    if (continuityMatch) {
      result.continuity = continuityMatch[1].trim();
    }

    return Identity.parse(result);
  }

  /**
   * Parse SOUL.md format
   */
  export function parseSoulMd(content: string): Soul {
    const result: Partial<Soul> = {
      truths: [],
      boundaries: [],
      vibe: { traits: [] },
      directives: {},
    };

    // Parse Core Truths section
    const truthsMatch = content.match(/## Core Truths\s*\n([\s\S]*?)(?=\n##|$)/);
    if (truthsMatch) {
      const truthRegex = /\*\*([^*]+)\*\*/g;
      let truthMatch;
      while ((truthMatch = truthRegex.exec(truthsMatch[1])) !== null) {
        result.truths!.push(truthMatch[1]);
      }
    }

    // Parse Boundaries section
    const boundariesMatch = content.match(/## Boundaries\s*\n([\s\S]*?)(?=\n##|$)/);
    if (boundariesMatch) {
      const boundaryRegex = /-\s+(.+)/g;
      let boundaryMatch;
      while ((boundaryMatch = boundaryRegex.exec(boundariesMatch[1])) !== null) {
        result.boundaries!.push(boundaryMatch[1].trim());
      }
    }

    // Parse Vibe section
    const vibeMatch = content.match(/## Vibe\s*\n([\s\S]*?)(?=\n##|$)/);
    if (vibeMatch) {
      const traitRegex = /-\s+(.+)/g;
      let traitMatch;
      while ((traitMatch = traitRegex.exec(vibeMatch[1])) !== null) {
        result.vibe!.traits.push(traitMatch[1].trim());
      }
    }

    // Parse Privacy Directive
    const privacyMatch = content.match(/## Privacy Directive\s*\n([\s\S]*?)(?=\n##|$)/);
    if (privacyMatch) {
      result.directives!.privacy = privacyMatch[1].trim();
    }

    // Parse Syntony section as goal
    const syntonyMatch = content.match(/## Syntony\s*\n([\s\S]*?)(?=\n##|$)/);
    if (syntonyMatch) {
      result.goal = syntonyMatch[1].trim();
    }

    return Soul.parse(result);
  }

  /**
   * Convert a persona definition to agent info
   */
  export function toAgentInfo(
    persona: PersonaDefinition,
    identity?: IdentityContext
  ): AgentInfo {
    const result: AgentInfo = {
      name: persona.name,
      description: persona.description,
      mode: persona.mode,
      hidden: persona.hidden,
      default: persona.default,
      color: persona.color,
      useCase: persona.useCase,
    };

    // Model configuration
    if (persona.model) {
      result.model = parseModelString(persona.model);
    }

    // Sampling parameters
    if (persona.temperature !== undefined) {
      result.temperature = persona.temperature;
    }
    if (persona.topP !== undefined) {
      result.topP = persona.topP;
    }
    if (persona.maxSteps !== undefined) {
      result.maxSteps = persona.maxSteps;
    }

    // Permissions
    if (persona.permission) {
      result.permission = persona.permission;
    }

    // Tools
    if (persona.tools) {
      result.tools = persona.tools;
    }

    // Compose prompt from identity and persona
    if (identity || persona.prompt) {
      result.prompt = composePrompt(persona, identity);
    }

    return result;
  }

  /**
   * Compose a system prompt from identity context and persona
   */
  function composePrompt(
    persona: PersonaDefinition,
    identity?: IdentityContext
  ): string {
    const parts: string[] = [];

    // Identity header
    if (identity?.identity) {
      const id = identity.identity;
      parts.push(`# ${id.name}`);
      if (id.creature) {
        parts.push(`*${id.creature}*`);
      }
      if (id.vibe) {
        parts.push(`**Vibe:** ${id.vibe}`);
      }
      if (id.about) {
        parts.push(`\n${id.about}`);
      }
      parts.push("");
    }

    // Soul section
    if (identity?.soul) {
      const soul = identity.soul;

      if (soul.truths.length > 0) {
        parts.push("## Core Principles");
        for (const truth of soul.truths) {
          parts.push(`- ${truth}`);
        }
        parts.push("");
      }

      if (soul.boundaries.length > 0) {
        parts.push("## Boundaries");
        for (const boundary of soul.boundaries) {
          parts.push(`- ${boundary}`);
        }
        parts.push("");
      }

      if (soul.goal) {
        parts.push("## Goal");
        parts.push(soul.goal);
        parts.push("");
      }
    }

    // Persona-specific prompt
    if (persona.prompt) {
      parts.push(persona.prompt);
    }

    return parts.join("\n").trim();
  }

  /**
   * Merge two persona definitions
   * Child values override parent values
   */
  export function mergeDefinitions(
    parent: PersonaDefinition,
    child: Partial<PersonaDefinition>
  ): PersonaDefinition {
    const result = { ...parent, ...child };

    // Merge permissions
    if (parent.permission && child.permission) {
      result.permission = { ...parent.permission, ...child.permission };

      // Deep merge pattern-based permissions
      for (const key of ["bash", "skill", "mcp"] as const) {
        const parentVal = parent.permission[key];
        const childVal = child.permission[key];
        if (typeof parentVal === "object" && typeof childVal === "object") {
          (result.permission as any)[key] = { ...parentVal, ...childVal };
        }
      }
    }

    // Merge tools
    if (parent.tools && child.tools) {
      result.tools = { ...parent.tools, ...child.tools };
    }

    // Merge identity files
    if (parent.identityFiles && child.identityFiles) {
      result.identityFiles = [...parent.identityFiles, ...child.identityFiles];
    }

    return PersonaDefinition.parse(result);
  }

  /**
   * Get persona file extension handlers
   */
  export function getFormatHandlers(): Record<
    string,
    (content: string) => PersonaDefinition
  > {
    return {
      ".yaml": (content) => {
        // Parse YAML and validate
        const { data } = parseFrontmatter(`---\n${content}\n---\n`);
        return PersonaDefinition.parse(data);
      },
      ".yml": (content) => {
        const { data } = parseFrontmatter(`---\n${content}\n---\n`);
        return PersonaDefinition.parse(data);
      },
      ".md": (content) => {
        const { data, content: prompt } = parseFrontmatter(content);
        return PersonaDefinition.parse({ ...data, prompt });
      },
    };
  }
}
