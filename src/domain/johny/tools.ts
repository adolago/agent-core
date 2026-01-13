/**
 * Johny Domain Tools
 *
 * Learning and study tools powered by:
 * - Knowledge graph with topic prerequisites (DAG)
 * - Spaced repetition with Ebbinghaus decay modeling
 * - FIRe (Fractional Implicit Repetition) for implicit review credit
 * - Mastery tracking across 6 levels
 */

import { z } from "zod";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ToolDefinition, ToolExecutionResult } from "../../mcp/types";
import { getSafeEnv } from "../../util/safe-env";

type JohnyResult = {
  ok: boolean;
  command?: string;
  data?: unknown;
  error?: string;
};

function resolvePersonaRepo(name: string): string {
  const root = process.env.AGENT_CORE_ROOT;
  if (root) return join(root, "vendor", "personas", name);
  return join(homedir(), ".local", "src", "agent-core", "vendor", "personas", name);
}

function resolveJohnyCli(): { python: string; cliPath: string } {
  const repo = process.env.JOHNY_REPO || resolvePersonaRepo("johny");
  const cliPath = process.env.JOHNY_CLI || join(repo, "scripts", "johny_cli.py");
  const venvPython = join(repo, ".venv", "bin", "python");
  const python = process.env.JOHNY_PYTHON || (existsSync(venvPython) ? venvPython : "python3");
  return { python, cliPath };
}

function runJohnyCli(args: string[]): JohnyResult {
  const { python, cliPath } = resolveJohnyCli();
  if (!existsSync(cliPath)) {
    return {
      ok: false,
      error: `Johny CLI not found at ${cliPath}. Set JOHNY_REPO or JOHNY_CLI.`,
    };
  }

  const result = spawnSync(python, [cliPath, ...args], {
    encoding: "utf-8",
    env: getSafeEnv(["JOHNY_REPO", "JOHNY_CLI", "JOHNY_PYTHON"]),
    timeout: 30000,
  });

  if (result.error) {
    return { ok: false, error: result.error.message };
  }

  const stdout = result.stdout.trim();
  if (!stdout) {
    const stderr = result.stderr.trim();
    return { ok: false, error: stderr || "Johny CLI returned no output." };
  }

  try {
    return JSON.parse(stdout) as JohnyResult;
  } catch {
    return { ok: false, error: stdout };
  }
}

function renderOutput(title: string, result: JohnyResult): ToolExecutionResult {
  if (!result.ok) {
    return {
      title,
      metadata: { ok: false },
      output: result.error || "Johny CLI failed.",
    };
  }

  return {
    title,
    metadata: { ok: true },
    output: JSON.stringify(result.data ?? result, null, 2),
  };
}

// =============================================================================
// Study Session Tool
// =============================================================================

const StudyParams = z.object({
  action: z.enum(["start", "end", "status", "pause", "resume"]).default("status")
    .describe("Study session action"),
  domain: z.string().optional()
    .describe("Learning domain (math, cs, etc.)"),
  minutes: z.number().optional()
    .describe("Session duration in minutes"),
  sessionId: z.string().optional()
    .describe("Session ID for end/pause/resume actions"),
});

export const studyTool: ToolDefinition = {
  id: "johny:study",
  category: "domain",
  init: async () => ({
    description: `Manage study sessions for deliberate practice.
Actions:
- start: Begin a focused study session with optional duration
- end: End current session and record progress
- status: Check active session and statistics
- pause/resume: Pause or resume a session

Examples:
- Start 30-min math session: { action: "start", domain: "math", minutes: 30 }
- Check status: { action: "status" }
- End session: { action: "end", sessionId: "session-123" }`,
    parameters: StudyParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { action, domain, minutes, sessionId } = args;
      ctx.metadata({ title: `Study: ${action}` });

      const cliArgs = ["session", action];
      if (domain) cliArgs.push("--domain", domain);
      if (minutes) cliArgs.push("--minutes", String(minutes));
      if (sessionId) cliArgs.push("--session-id", sessionId);

      const result = runJohnyCli(cliArgs);
      return renderOutput(`Study Session: ${action}`, result);
    },
  }),
};

// =============================================================================
// Knowledge Graph Tool
// =============================================================================

const KnowledgeParams = z.object({
  action: z.enum(["topics", "prerequisites", "path", "add-topic", "add-prereq", "search"])
    .describe("Knowledge graph action"),
  domain: z.string().optional()
    .describe("Filter by domain (math, cs, etc.)"),
  topicId: z.string().optional()
    .describe("Topic ID for queries"),
  targetId: z.string().optional()
    .describe("Target topic ID for path finding"),
  query: z.string().optional()
    .describe("Search query for topics"),
  topic: z.object({
    id: z.string(),
    name: z.string(),
    domain: z.string(),
    description: z.string().optional(),
  }).optional().describe("Topic to add"),
  prerequisiteId: z.string().optional()
    .describe("Prerequisite topic ID to add"),
});

export const knowledgeTool: ToolDefinition = {
  id: "johny:knowledge",
  category: "domain",
  init: async () => ({
    description: `Interact with the knowledge graph (topic DAG with prerequisites).
Actions:
- topics: List all topics, optionally filtered by domain
- prerequisites: Get prerequisites for a topic
- path: Get learning path from current knowledge to target topic
- add-topic: Add a new topic to the graph
- add-prereq: Add a prerequisite relationship
- search: Search topics by name or description

The knowledge graph is a DAG where edges represent "is prerequisite for" relationships.

Examples:
- List math topics: { action: "topics", domain: "math" }
- Get calculus prerequisites: { action: "prerequisites", topicId: "calculus" }
- Path to integration: { action: "path", targetId: "integration" }`,
    parameters: KnowledgeParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { action, domain, topicId, targetId, query, topic, prerequisiteId } = args;
      ctx.metadata({ title: `Knowledge: ${action}` });

      const cliArgs = ["knowledge", action];
      if (domain) cliArgs.push("--domain", domain);
      if (topicId) cliArgs.push("--topic", topicId);
      if (targetId) cliArgs.push("--target", targetId);
      if (query) cliArgs.push("--query", query);
      if (topic) cliArgs.push("--topic-json", JSON.stringify(topic));
      if (prerequisiteId) cliArgs.push("--prereq", prerequisiteId);

      const result = runJohnyCli(cliArgs);
      return renderOutput(`Knowledge Graph: ${action}`, result);
    },
  }),
};

// =============================================================================
// Mastery Tool
// =============================================================================

const MasteryParams = z.object({
  action: z.enum(["status", "update", "history", "decay", "summary"])
    .describe("Mastery tracking action"),
  topicId: z.string().optional()
    .describe("Topic ID"),
  domain: z.string().optional()
    .describe("Filter by domain"),
  level: z.enum(["unknown", "introduced", "developing", "proficient", "mastered", "fluent"]).optional()
    .describe("Mastery level to set"),
  score: z.number().min(0).max(1).optional()
    .describe("Practice score (0-1) for implicit level update"),
});

export const masteryTool: ToolDefinition = {
  id: "johny:mastery",
  category: "domain",
  init: async () => ({
    description: `Track mastery levels across topics.
Mastery Levels (inspired by MathAcademy):
1. Unknown - Never encountered
2. Introduced - Seen but not practiced
3. Developing - Practicing, making progress
4. Proficient - Can solve with effort
5. Mastered - Reliable recall and application
6. Fluent - Automatic, effortless mastery

Actions:
- status: Get mastery level for a topic or domain
- update: Update mastery based on practice score
- history: Get mastery history for a topic
- decay: Calculate current retention with Ebbinghaus decay
- summary: Overall mastery summary across domains

Examples:
- Check calculus mastery: { action: "status", topicId: "calculus" }
- Update after practice: { action: "update", topicId: "limits", score: 0.85 }
- Domain summary: { action: "summary", domain: "math" }`,
    parameters: MasteryParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { action, topicId, domain, level, score } = args;
      ctx.metadata({ title: `Mastery: ${action}` });

      const cliArgs = ["mastery", action];
      if (topicId) cliArgs.push("--topic", topicId);
      if (domain) cliArgs.push("--domain", domain);
      if (level) cliArgs.push("--level", level);
      if (score !== undefined) cliArgs.push("--score", String(score));

      const result = runJohnyCli(cliArgs);
      return renderOutput(`Mastery: ${action}`, result);
    },
  }),
};

// =============================================================================
// Review Tool (Spaced Repetition)
// =============================================================================

const ReviewParams = z.object({
  action: z.enum(["due", "schedule", "complete", "stats", "optimize"])
    .describe("Review action"),
  topicId: z.string().optional()
    .describe("Topic ID"),
  domain: z.string().optional()
    .describe("Filter by domain"),
  score: z.number().min(0).max(1).optional()
    .describe("Review score (0-1)"),
  limit: z.number().optional()
    .describe("Max items to return"),
});

export const reviewTool: ToolDefinition = {
  id: "johny:review",
  category: "domain",
  init: async () => ({
    description: `Manage spaced repetition reviews using Ebbinghaus decay modeling.
Features:
- Optimal review scheduling based on retention curves
- FIRe (Fractional Implicit Repetition) - practicing advanced topics gives partial credit to prerequisites
- Adaptive intervals based on performance

Actions:
- due: Get topics due for review (sorted by urgency)
- schedule: Schedule a review for a topic
- complete: Record a review completion with score
- stats: Get review statistics
- optimize: Suggest optimal review schedule

FIRe Example:
When you practice "Integration by Parts", you get implicit review credit for:
- Integration (50%)
- Derivatives (25%)
- Limits (12.5%)
This reduces explicit review burden by ~80%.

Examples:
- Get due reviews: { action: "due", limit: 5 }
- Complete review: { action: "complete", topicId: "derivatives", score: 0.9 }`,
    parameters: ReviewParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { action, topicId, domain, score, limit } = args;
      ctx.metadata({ title: `Review: ${action}` });

      const cliArgs = ["review", action];
      if (topicId) cliArgs.push("--topic", topicId);
      if (domain) cliArgs.push("--domain", domain);
      if (score !== undefined) cliArgs.push("--score", String(score));
      if (limit) cliArgs.push("--limit", String(limit));

      const result = runJohnyCli(cliArgs);
      return renderOutput(`Review: ${action}`, result);
    },
  }),
};

// =============================================================================
// Practice Tool
// =============================================================================

const PracticeParams = z.object({
  action: z.enum(["next", "generate", "complete", "skip", "hint"])
    .describe("Practice action"),
  topicId: z.string().optional()
    .describe("Topic ID for practice"),
  domain: z.string().optional()
    .describe("Domain for practice"),
  difficulty: z.enum(["easy", "medium", "hard", "adaptive"]).optional()
    .describe("Problem difficulty"),
  problemId: z.string().optional()
    .describe("Problem ID for complete/skip/hint"),
  score: z.number().min(0).max(1).optional()
    .describe("Score for completion"),
  type: z.enum(["concept", "calculation", "proof", "application"]).optional()
    .describe("Problem type"),
});

export const practiceTool: ToolDefinition = {
  id: "johny:practice",
  category: "domain",
  init: async () => ({
    description: `Get practice problems for deliberate practice.
Actions:
- next: Get the optimal next practice problem (considers mastery, decay, dependencies)
- generate: Generate a practice problem for a specific topic
- complete: Record problem completion with score
- skip: Skip a problem (affects scheduling)
- hint: Get a hint for a problem

Problem Types:
- concept: Conceptual understanding questions
- calculation: Numerical/symbolic computation
- proof: Mathematical proofs
- application: Real-world applications

Difficulty is adaptive by default - targets the edge of your ability.

Examples:
- Get next problem: { action: "next" }
- Generate calculus problem: { action: "generate", topicId: "derivatives", difficulty: "medium" }
- Complete problem: { action: "complete", problemId: "prob-123", score: 1.0 }`,
    parameters: PracticeParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { action, topicId, domain, difficulty, problemId, score, type } = args;
      ctx.metadata({ title: `Practice: ${action}` });

      const cliArgs = ["practice", action];
      if (topicId) cliArgs.push("--topic", topicId);
      if (domain) cliArgs.push("--domain", domain);
      if (difficulty) cliArgs.push("--difficulty", difficulty);
      if (problemId) cliArgs.push("--problem", problemId);
      if (score !== undefined) cliArgs.push("--score", String(score));
      if (type) cliArgs.push("--type", type);

      const result = runJohnyCli(cliArgs);
      return renderOutput(`Practice: ${action}`, result);
    },
  }),
};

// =============================================================================
// Exports
// =============================================================================

export const JOHNY_TOOLS = [
  studyTool,
  knowledgeTool,
  masteryTool,
  reviewTool,
  practiceTool,
];

export function registerJohnyTools(registry: { register: (tool: ToolDefinition, options: { source: string }) => void }): void {
  for (const tool of JOHNY_TOOLS) {
    registry.register(tool, { source: "domain" });
  }
}
