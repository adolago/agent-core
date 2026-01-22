import type { PersonaId } from "../../agents/agent-core-embedded.js";
import type { ZeeConfig } from "../../config/config.js";
import type { MsgContext } from "../templating.js";

// Valid personas for routing
const PERSONA_PATTERNS: Record<string, PersonaId> = {
  stanley: "stanley",
  stan: "stanley",
  johny: "johny",
  john: "johny",
  johnny: "johny",
  zee: "zee",
};
const MAX_MENTION_PATTERN_LENGTH = 200;

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function isRegexQuantifierStart(
  ch: string,
  pattern: string,
  index: number,
): boolean {
  if (ch === "*" || ch === "+" || ch === "?") return true;
  if (ch !== "{") return false;
  const end = pattern.indexOf("}", index + 1);
  if (end === -1) return false;
  const body = pattern.slice(index + 1, end);
  return /^[0-9,\s]+$/.test(body);
}

// Reject nested quantifiers to reduce worst-case backtracking.
function hasNestedQuantifiers(pattern: string): boolean {
  const stack: Array<{ hasQuantifier: boolean }> = [];
  let escaped = false;
  let inClass = false;

  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (inClass) {
      if (ch === "]") inClass = false;
      continue;
    }
    if (ch === "[") {
      inClass = true;
      continue;
    }
    if (ch === "(") {
      stack.push({ hasQuantifier: false });
      continue;
    }
    if (ch === ")") {
      const group = stack.pop();
      if (group?.hasQuantifier) {
        const next = pattern[i + 1];
        if (next && isRegexQuantifierStart(next, pattern, i + 1)) {
          return true;
        }
      }
      continue;
    }
    if (ch === "?" && pattern[i - 1] === "(") {
      continue;
    }
    if (isRegexQuantifierStart(ch, pattern, i)) {
      for (const group of stack) {
        group.hasQuantifier = true;
      }
    }
  }

  return false;
}

function isSafeMentionPattern(pattern: string): boolean {
  if (!pattern) return false;
  if (pattern.length > MAX_MENTION_PATTERN_LENGTH) return false;
  if (hasControlChars(pattern)) return false;
  if (hasNestedQuantifiers(pattern)) return false;
  return true;
}

/**
 * Detect if the message mentions a specific persona (@stanley, @johny, etc.)
 * Returns the detected persona or "zee" as default
 */
export function detectPersonaMention(text: string): PersonaId {
  if (!text) return "zee";

  const normalized = normalizeMentionText(text);

  // Check for @mentions of personas
  for (const [pattern, persona] of Object.entries(PERSONA_PATTERNS)) {
    // Match @persona at word boundary
    const regex = new RegExp(`@${pattern}\\b`, "i");
    if (regex.test(normalized)) {
      return persona;
    }
  }

  return "zee";
}

/**
 * Strip persona mentions from text (after detection)
 */
export function stripPersonaMentions(text: string): string {
  if (!text) return text;

  let result = text;
  for (const pattern of Object.keys(PERSONA_PATTERNS)) {
    // Remove @persona mentions
    const regex = new RegExp(`@${pattern}\\b`, "gi");
    result = result.replace(regex, "");
  }

  return result.replace(/\s+/g, " ").trim();
}

export function buildMentionRegexes(cfg: ZeeConfig | undefined): RegExp[] {
  const patterns = cfg?.routing?.groupChat?.mentionPatterns ?? [];
  return patterns
    .map((pattern) => {
      const trimmed = pattern.trim();
      if (!isSafeMentionPattern(trimmed)) return null;
      try {
        return new RegExp(trimmed, "i");
      } catch {
        return null;
      }
    })
    .filter((value): value is RegExp => Boolean(value));
}

export function normalizeMentionText(text: string): string {
  return (text ?? "")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, "")
    .toLowerCase();
}

export function matchesMentionPatterns(
  text: string,
  mentionRegexes: RegExp[],
): boolean {
  if (mentionRegexes.length === 0) return false;
  const cleaned = normalizeMentionText(text ?? "");
  if (!cleaned) return false;
  return mentionRegexes.some((re) => re.test(cleaned));
}

export function stripStructuralPrefixes(text: string): string {
  // Ignore wrapper labels, timestamps, and sender prefixes so directive-only
  // detection still works in group batches that include history/context.
  const marker = "[Current message - respond to this]";
  const afterMarker = text.includes(marker)
    ? text.slice(text.indexOf(marker) + marker.length)
    : text;
  return afterMarker
    .replace(/\[[^\]]+\]\s*/g, "")
    .replace(/^[ \t]*[A-Za-z0-9+()\-_. ]+:\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripMentions(
  text: string,
  ctx: MsgContext,
  cfg: ZeeConfig | undefined,
): string {
  let result = text;
  const patterns = cfg?.routing?.groupChat?.mentionPatterns ?? [];
  for (const p of patterns) {
    const trimmed = p.trim();
    if (!isSafeMentionPattern(trimmed)) continue;
    try {
      const re = new RegExp(trimmed, "gi");
      result = result.replace(re, " ");
    } catch {
      // ignore invalid regex
    }
  }
  const selfE164 = (ctx.To ?? "").replace(/^whatsapp:/, "");
  if (selfE164) {
    const esc = selfE164.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result
      .replace(new RegExp(esc, "gi"), " ")
      .replace(new RegExp(`@${esc}`, "gi"), " ");
  }
  // Generic mention patterns like @123456789 or plain digits
  result = result.replace(/@[0-9+]{5,}/g, " ");
  // Discord-style mentions (<@123> or <@!123>)
  result = result.replace(/<@!?\d+>/g, " ");
  return result.replace(/\s+/g, " ").trim();
}
