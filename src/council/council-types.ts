/**
 * Type definitions for the LLM Council multi-model deliberation system.
 *
 * Implements Karpathy's llm-council 3-stage consensus algorithm:
 * 1. Stage 1: Parallel independent responses from all council members
 * 2. Stage 2: Anonymous peer review and ranking
 * 3. Stage 3: Chairman synthesizes final answer
 */

import type { SpecializedAgentType } from "../agent-types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Council Mode Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Council operation modes.
 * - raw_llm: Different LLM models answer the same question
 * - agent: Specialized agents provide domain-expert responses
 * - hybrid: Mixed LLM and agent participation
 */
export type CouncilMode = "raw_llm" | "agent" | "hybrid";

/**
 * Member types that can participate in the council.
 */
export type CouncilMemberType = "llm" | "agent";

/**
 * Supported provider types for council members.
 */
export type CouncilProviderType =
  | "openrouter" // Single gateway to 100+ LLMs
  | "opencode_zen" // OpenCode curated models (GPT-5.2, Claude 4.5, etc.)
  | "google_antigravity" // Free Gemini via Google OAuth (Antigravity)
  | "anthropic" // Direct Anthropic API
  | "openai" // Direct OpenAI API
  | "google" // Direct Google Gemini API
  | "zai" // Direct ZAI API
  | "custom"; // Custom OpenAI-compatible endpoint

// ─────────────────────────────────────────────────────────────────────────────
// Council Member Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Provider configuration for an LLM member.
 */
export interface CouncilProviderConfig {
  /** Provider type */
  type: CouncilProviderType;
  /** API key (if not using env var) */
  apiKey?: string;
  /** Environment variable containing API key */
  apiKeyEnv?: string;
  /** Base URL for custom providers */
  baseUrl?: string;
  /** Additional headers */
  headers?: Record<string, string>;
}

/**
 * An LLM member of the council.
 */
export interface LLMMember {
  type: "llm";
  /** Unique identifier for this member */
  id: string;
  /** Provider type (e.g., "anthropic", "openai", "openrouter") */
  provider: CouncilProviderType;
  /** Model ID (e.g., "claude-3-opus-20240229", "gpt-4-turbo") */
  model: string;
  /** OpenRouter-specific model route (e.g., "anthropic/claude-3-opus") */
  modelRoute?: string;
  /** Human-readable display name */
  displayName?: string;
  /** Voting weight (default: 1.0) */
  weight?: number;
  /** Optional system prompt override */
  systemPrompt?: string;
  /** Temperature (0-1) */
  temperature?: number;
  /** Max output tokens */
  maxTokens?: number;
  /** Role in council deliberations */
  role?: "primary" | "reviewer" | "specialist";
}

/**
 * An agent member of the council (uses existing specialized agents).
 */
export interface AgentMember {
  type: "agent";
  /** Unique identifier for this member */
  id: string;
  /** Type of specialized agent */
  agentType: SpecializedAgentType;
  /** Human-readable display name */
  displayName?: string;
  /** Voting weight (default: 1.0) */
  weight?: number;
  /** Additional context to pass to the agent */
  context?: Record<string, unknown>;
  /** Role in council deliberations */
  role?: "primary" | "reviewer" | "specialist";
}

/**
 * Union type for all council member types.
 */
export type CouncilMember = LLMMember | AgentMember;

// ─────────────────────────────────────────────────────────────────────────────
// Council Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Chairman configuration - who synthesizes the final answer.
 */
export interface ChairmanConfig {
  /** Chairman selection mode */
  mode: "designated" | "rotating" | "random" | "highest_scorer";
  /** Specific member ID if mode is "designated" */
  memberId?: string;
  /** LLM config if chairman is a separate model */
  llmConfig?: {
    provider: CouncilProviderType;
    model: string;
    modelRoute?: string;
  };
}

/**
 * Stage 2 (peer review) configuration.
 */
export interface PeerReviewConfig {
  /** Whether reviews are anonymous (hide author identities) */
  anonymous: boolean;
  /** Ranking method */
  method: "score" | "ranking" | "pairwise";
  /** Criteria for evaluation */
  criteria: string[];
  /** Allow self-review */
  allowSelfReview: boolean;
}

/**
 * Full council configuration.
 */
export interface CouncilConfig {
  /** Council operation mode */
  mode: CouncilMode;
  /** Council members */
  members: CouncilMember[];
  /** Chairman configuration */
  chairman: ChairmanConfig;
  /** Peer review settings */
  peerReview: PeerReviewConfig;
  /** Default provider for members without explicit config */
  defaultProvider?: CouncilProviderConfig;
  /** Timeout for each stage in ms */
  stageTimeoutMs?: number;
  /** Minimum responses required to proceed (quorum) */
  quorum?: number;
  /** Maximum parallel executions */
  maxParallel?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage Results
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stage 1: Individual response from a council member.
 */
export interface CouncilResponse {
  /** Member ID who provided this response */
  memberId: string;
  /** Type of member (llm or agent) */
  memberType: CouncilMemberType;
  /** The actual response text */
  response: string;
  /** Optional reasoning explanation */
  reasoning?: string;
  /** Confidence level (0-1) */
  confidence?: number;
  /** Metadata about the response */
  metadata?: {
    provider?: string;
    model?: string;
    agentType?: string;
    durationMs: number;
    tokenUsage?: {
      input: number;
      output: number;
    };
  };
  /** Error if the response failed */
  error?: string;
}

/**
 * Stage 2: Peer review of a response.
 */
export interface PeerReview {
  /** ID of the member doing the review */
  reviewerId: string;
  /** ID of the response being reviewed */
  targetResponseId: string;
  /** Score (0-100) */
  score: number;
  /** Key strengths identified */
  strengths: string[];
  /** Key weaknesses identified */
  weaknesses: string[];
  /** Position if using ranking method */
  ranking?: number;
  /** Recommendation */
  recommendation: "accept" | "revise" | "reject";
  /** Additional comments */
  comments?: string;
}

/**
 * Aggregated review results for a response.
 */
export interface ReviewAggregate {
  /** Response ID */
  responseId: string;
  /** Member ID who provided the response */
  memberId: string;
  /** Simple average of all scores */
  averageScore: number;
  /** Weighted average (by reviewer weight) */
  weightedScore: number;
  /** Number of reviews received */
  reviewCount: number;
  /** All rankings received */
  rankings: number[];
  /** Consensus level */
  consensus: "strong" | "moderate" | "weak" | "split";
}

/**
 * Stage 3: Chairman synthesis result.
 */
export interface ChairmanSynthesis {
  /** ID of the chairman who synthesized */
  chairmanId: string;
  /** The final synthesized response */
  finalResponse: string;
  /** Methodology used for synthesis */
  methodology: string;
  /** Member IDs whose content was incorporated */
  sourcesUsed: string[];
  /** Key insights extracted */
  keyInsights: string[];
  /** Notable minority/dissenting opinions */
  dissent?: string;
  /** Confidence in the final answer (0-1) */
  confidence: number;
  /** Metadata about the synthesis */
  metadata: {
    durationMs: number;
    tokenUsage?: {
      input: number;
      output: number;
    };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Council Session
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Current stage of a council session.
 */
export type CouncilStage =
  | "pending"
  | "stage1"
  | "stage2"
  | "stage3"
  | "complete"
  | "failed";

/**
 * Complete council deliberation session.
 */
export interface CouncilSession {
  /** Unique session ID */
  id: string;
  /** Council configuration used */
  config: CouncilConfig;
  /** The question being deliberated */
  question: string;
  /** Optional context provided */
  context?: string;
  /** Current stage */
  stage: CouncilStage;

  /** Stage 1 results: individual responses */
  responses: CouncilResponse[];

  /** Stage 2 results: peer reviews */
  reviews: PeerReview[];
  /** Stage 2 results: aggregated scores */
  reviewAggregates: ReviewAggregate[];

  /** Stage 3 result: chairman synthesis */
  synthesis?: ChairmanSynthesis;

  /** Timestamp when session was created */
  createdAt: number;
  /** Timestamp when Stage 1 completed */
  stage1CompletedAt?: number;
  /** Timestamp when Stage 2 completed */
  stage2CompletedAt?: number;
  /** Timestamp when session completed */
  completedAt?: number;
  /** Error message if session failed */
  error?: string;
}

/**
 * Council execution result (returned to caller).
 */
export interface CouncilResult {
  /** Session ID */
  sessionId: string;
  /** Whether deliberation succeeded */
  success: boolean;
  /** The final answer */
  finalAnswer: string;
  /** Full synthesis details */
  synthesis: ChairmanSynthesis;
  /** Summary statistics */
  summary: {
    totalMembers: number;
    respondedMembers: number;
    topScorer: string;
    consensusLevel: string;
    totalDurationMs: number;
  };
  /** Debug information (optional) */
  debug?: {
    responses: CouncilResponse[];
    reviews: PeerReview[];
    aggregates: ReviewAggregate[];
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Configuration Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default peer review criteria.
 */
export const DEFAULT_REVIEW_CRITERIA: string[] = [
  "Accuracy and correctness",
  "Completeness of answer",
  "Clarity and organization",
  "Quality of reasoning",
  "Practical applicability",
];

/**
 * Default peer review configuration.
 */
export const DEFAULT_PEER_REVIEW_CONFIG: PeerReviewConfig = {
  anonymous: true,
  method: "score",
  criteria: DEFAULT_REVIEW_CRITERIA,
  allowSelfReview: false,
};

/**
 * Default chairman configuration.
 */
export const DEFAULT_CHAIRMAN_CONFIG: ChairmanConfig = {
  mode: "highest_scorer",
};

/**
 * Create a default council configuration with minimal required fields.
 */
export function createDefaultCouncilConfig(
  partial: Partial<CouncilConfig>,
): CouncilConfig {
  return {
    mode: partial.mode ?? "raw_llm",
    members: partial.members ?? [],
    chairman: partial.chairman ?? DEFAULT_CHAIRMAN_CONFIG,
    peerReview: partial.peerReview ?? DEFAULT_PEER_REVIEW_CONFIG,
    defaultProvider: partial.defaultProvider,
    stageTimeoutMs: partial.stageTimeoutMs ?? 60000,
    quorum: partial.quorum,
    maxParallel: partial.maxParallel ?? 5,
  };
}

/**
 * Generate a unique council session ID.
 */
export function generateCouncilId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `council-${timestamp}-${random}`;
}

/**
 * Validate a council configuration.
 */
export function validateCouncilConfig(config: CouncilConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (config.members.length === 0) {
    errors.push("Council must have at least one member");
  }

  if (config.members.length < 2 && config.mode !== "agent") {
    errors.push("Council needs at least 2 members for meaningful deliberation");
  }

  // Check for duplicate member IDs
  const memberIds = config.members.map((m) => m.id);
  const duplicateIds = memberIds.filter(
    (id, index) => memberIds.indexOf(id) !== index,
  );
  if (duplicateIds.length > 0) {
    errors.push(`Duplicate member IDs: ${duplicateIds.join(", ")}`);
  }

  // Validate chairman if designated
  if (
    config.chairman.mode === "designated" &&
    config.chairman.memberId &&
    !memberIds.includes(config.chairman.memberId)
  ) {
    errors.push(
      `Designated chairman "${config.chairman.memberId}" is not a council member`,
    );
  }

  // Validate member types match mode
  if (config.mode === "raw_llm") {
    const agentMembers = config.members.filter((m) => m.type === "agent");
    if (agentMembers.length > 0) {
      errors.push("raw_llm mode should not have agent members");
    }
  }

  if (config.mode === "agent") {
    const llmMembers = config.members.filter((m) => m.type === "llm");
    if (llmMembers.length > 0) {
      errors.push("agent mode should not have llm members");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
