/**
 * Council Coordinator - Multi-LLM/Agent deliberation system.
 *
 * Implements Karpathy's llm-council 3-stage algorithm:
 * 1. Parallel independent responses from all council members
 * 2. Anonymous peer review and ranking
 * 3. Chairman synthesis of final answer
 *
 * Supports three modes:
 * - raw_llm: Different LLM models answer the same question
 * - agent: Specialized agents provide domain-expert responses
 * - hybrid: Mixed LLM and agent participation
 */

import type { AgentOrchestrator } from "../tiara.js";
import type { ModelCatalogEntry } from "../../model-catalog.js";
import { loadModelCatalog } from "../../model-catalog.js";
import type { SpecializedAgentType } from "../agent-types.js";
import type {
  CouncilConfig,
  CouncilMember,
  CouncilMode,
  CouncilResult,
  CouncilSession,
  CouncilStage,
  LLMMember,
} from "./council-types.js";
import {
  createDefaultCouncilConfig,
  generateCouncilId,
  validateCouncilConfig,
} from "./council-types.js";
import {
  executeStage1Parallel,
  executeStage2PeerReview,
  executeStage3Synthesis,
} from "./council-stages.js";

// ─────────────────────────────────────────────────────────────────────────────
// In-Memory Session Store
// ─────────────────────────────────────────────────────────────────────────────

const councilSessions = new Map<string, CouncilSession>();

// ─────────────────────────────────────────────────────────────────────────────
// Council Coordinator Class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main coordinator class for LLM Council deliberations.
 */
export class CouncilCoordinator {
  private readonly tiara?: AgentOrchestrator;
  private readonly modelCatalog: ModelCatalogEntry[];

  constructor(params?: {
    tiara?: AgentOrchestrator;
    modelCatalog?: ModelCatalogEntry[];
  }) {
    this.tiara = params?.tiara;
    this.modelCatalog = params?.modelCatalog ?? [];
  }

  /**
   * Create a CouncilCoordinator with model catalog loaded.
   */
  static async create(params?: {
    tiara?: AgentOrchestrator;
  }): Promise<CouncilCoordinator> {
    const catalog = await loadModelCatalog();
    return new CouncilCoordinator({
      tiara: params?.tiara,
      modelCatalog: catalog,
    });
  }

  /**
   * Get available models for council participation.
   */
  getAvailableModels(): ModelCatalogEntry[] {
    return this.modelCatalog;
  }

  /**
   * Get available agents for council participation.
   */
  getAvailableAgents(): SpecializedAgentType[] {
    return [
      "inbox_manager",
      "scheduler",
      "research_assistant",
      "task_coordinator",
    ];
  }

  /**
   * Create a new council session.
   */
  createSession(
    question: string,
    config: Partial<CouncilConfig>,
    context?: string,
  ): CouncilSession {
    const id = generateCouncilId();
    const fullConfig = createDefaultCouncilConfig(config);

    const validation = validateCouncilConfig(fullConfig);
    if (!validation.valid) {
      throw new Error(
        `Invalid council config: ${validation.errors.join(", ")}`,
      );
    }

    const session: CouncilSession = {
      id,
      config: fullConfig,
      question,
      context,
      stage: "pending",
      responses: [],
      reviews: [],
      reviewAggregates: [],
      createdAt: Date.now(),
    };

    councilSessions.set(id, session);
    return session;
  }

  /**
   * Execute the full 3-stage council deliberation.
   *
   * @param question - The question for the council to deliberate
   * @param config - Council configuration
   * @param options - Additional options
   * @returns The council result with final answer and synthesis
   */
  async deliberate(
    question: string,
    config: Partial<CouncilConfig>,
    options?: {
      context?: string;
      includeDebug?: boolean;
    },
  ): Promise<CouncilResult> {
    const session = this.createSession(question, config, options?.context);
    const startTime = Date.now();

    try {
      // Stage 1: Collect parallel responses
      session.stage = "stage1";
      session.responses = await executeStage1Parallel({
        session,
        tiara: this.tiara,
      });
      session.stage1CompletedAt = Date.now();

      // Check quorum
      const successfulResponses = session.responses.filter((r) => !r.error);
      const quorum =
        session.config.quorum ??
        Math.ceil(session.config.members.length / 2);

      if (successfulResponses.length < quorum) {
        throw new Error(
          `Quorum not met: ${successfulResponses.length}/${quorum} responses required`,
        );
      }

      // Stage 2: Peer review
      session.stage = "stage2";
      const { reviews, aggregates } = await executeStage2PeerReview({
        session,
        tiara: this.tiara,
      });
      session.reviews = reviews;
      session.reviewAggregates = aggregates;
      session.stage2CompletedAt = Date.now();

      // Stage 3: Chairman synthesis
      session.stage = "stage3";
      session.synthesis = await executeStage3Synthesis({
        session,
        tiara: this.tiara,
      });
      session.completedAt = Date.now();
      session.stage = "complete";

      // Build result
      const topScorer =
        session.reviewAggregates.length > 0
          ? session.reviewAggregates.reduce((best, curr) =>
              curr.weightedScore > best.weightedScore ? curr : best,
            )
          : null;

      const result: CouncilResult = {
        sessionId: session.id,
        success: true,
        finalAnswer: session.synthesis.finalResponse,
        synthesis: session.synthesis,
        summary: {
          totalMembers: session.config.members.length,
          respondedMembers: successfulResponses.length,
          topScorer: topScorer?.memberId ?? "unknown",
          consensusLevel: topScorer?.consensus ?? "unknown",
          totalDurationMs: Date.now() - startTime,
        },
      };

      if (options?.includeDebug) {
        result.debug = {
          responses: session.responses,
          reviews: session.reviews,
          aggregates: session.reviewAggregates,
        };
      }

      return result;
    } catch (error) {
      session.stage = "failed";
      session.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * Quick consensus - simplified 2-stage deliberation without peer review.
   * Useful for faster decisions when full deliberation is not needed.
   *
   * @param question - The question for quick consensus
   * @param models - Model identifiers to use (OpenRouter format)
   * @returns Quick consensus result
   */
  async quickConsensus(
    question: string,
    models: string[] = ["anthropic/claude-3-opus", "openai/gpt-4-turbo"],
  ): Promise<{
    question: string;
    responses: Array<{ model: string; response: string; error?: string }>;
    consensus?: string;
    agreement: "strong" | "moderate" | "weak" | "none";
  }> {
    // Create LLM members from model list
    const members: LLMMember[] = models.map((model, i) => ({
      type: "llm" as const,
      id: `model-${i}`,
      provider: "openrouter",
      model,
      modelRoute: model,
    }));

    const config: Partial<CouncilConfig> = {
      mode: "raw_llm",
      members,
      chairman: { mode: "highest_scorer" },
      peerReview: {
        anonymous: true,
        method: "score",
        criteria: ["Accuracy", "Completeness", "Clarity"],
        allowSelfReview: false,
      },
    };

    // Stage 1 only (skip peer review)
    const session = this.createSession(question, config);
    session.stage = "stage1";
    session.responses = await executeStage1Parallel({ session });

    const successfulResponses = session.responses.filter((r) => !r.error);

    // Simple consensus detection by checking similarity
    let agreement: "strong" | "moderate" | "weak" | "none" = "none";
    let consensus: string | undefined;

    if (successfulResponses.length >= 2) {
      // Use first response as baseline for simple comparison
      consensus = successfulResponses[0].response;

      // This is a simplified agreement check
      // A more sophisticated version would use semantic similarity
      const responseTexts = successfulResponses.map((r) =>
        r.response.toLowerCase().trim(),
      );
      const uniqueResponses = new Set(responseTexts);

      if (uniqueResponses.size === 1) {
        agreement = "strong";
      } else if (uniqueResponses.size <= responseTexts.length / 2) {
        agreement = "moderate";
      } else if (uniqueResponses.size < responseTexts.length) {
        agreement = "weak";
      }
    } else if (successfulResponses.length === 1) {
      consensus = successfulResponses[0].response;
      agreement = "weak"; // Single response can't have consensus
    }

    return {
      question,
      responses: session.responses.map((r) => ({
        model: r.metadata?.model ?? r.memberId,
        response: r.response,
        error: r.error,
      })),
      consensus,
      agreement,
    };
  }

  /**
   * Get a session by ID.
   */
  getSession(sessionId: string): CouncilSession | undefined {
    return councilSessions.get(sessionId);
  }

  /**
   * List all sessions with optional filtering.
   */
  listSessions(options?: {
    limit?: number;
    status?: CouncilStage;
  }): CouncilSession[] {
    let sessions = Array.from(councilSessions.values());

    if (options?.status) {
      sessions = sessions.filter((s) => s.stage === options.status);
    }

    sessions.sort((a, b) => b.createdAt - a.createdAt);

    if (options?.limit) {
      sessions = sessions.slice(0, options.limit);
    }

    return sessions;
  }

  /**
   * Delete a session by ID.
   */
  deleteSession(sessionId: string): boolean {
    return councilSessions.delete(sessionId);
  }

  /**
   * Clear all sessions.
   */
  clearSessions(): void {
    councilSessions.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Instance
// ─────────────────────────────────────────────────────────────────────────────

let defaultCoordinator: CouncilCoordinator | null = null;

/**
 * Get or create the default council coordinator.
 */
export async function getDefaultCouncilCoordinator(): Promise<CouncilCoordinator> {
  if (!defaultCoordinator) {
    defaultCoordinator = await CouncilCoordinator.create();
  }
  return defaultCoordinator;
}

/**
 * Reset the default coordinator (useful for testing).
 */
export function resetDefaultCouncilCoordinator(): void {
  defaultCoordinator = null;
}
