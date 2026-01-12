/**
 * Council Module
 *
 * Multi-LLM/Agent deliberation system for agent-core.
 * Implements Karpathy's llm-council 3-stage consensus algorithm.
 */

// Auth utilities
export * from "./auth/index.js";

// Export from local council modules
export {
  CouncilCoordinator,
  getDefaultCouncilCoordinator,
  resetDefaultCouncilCoordinator,
} from "./council-coordinator.js";

export type {
  CouncilConfig,
  CouncilMember,
  CouncilMode,
  CouncilResult,
  CouncilSession,
  LLMMember,
  AgentMember,
  CouncilStage,
  CouncilResponse,
  PeerReview,
  ReviewAggregate,
  ChairmanSynthesis,
  ChairmanConfig,
  PeerReviewConfig,
  CouncilProviderType,
  CouncilProviderConfig,
  CouncilMemberType,
} from "./council-types.js";

export {
  createDefaultCouncilConfig,
  generateCouncilId,
  validateCouncilConfig,
  DEFAULT_REVIEW_CRITERIA,
  DEFAULT_PEER_REVIEW_CONFIG,
  DEFAULT_CHAIRMAN_CONFIG,
} from "./council-types.js";

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Execute a full council deliberation.
 *
 * @param question - The question for the council to deliberate
 * @param config - Council configuration (members, chairman, etc.)
 * @param options - Additional options
 * @returns The council result with final answer
 */
export async function council(
  question: string,
  config: Partial<import("./council-types.js").CouncilConfig>,
  options?: {
    context?: string;
    includeDebug?: boolean;
  }
): Promise<import("./council-types.js").CouncilResult> {
  const coordinator = await getDefaultCouncilCoordinator();
  return coordinator.deliberate(question, config, options);
}

/**
 * Execute a quick consensus (Stage 1 only, skip peer review).
 *
 * @param question - The question for quick consensus
 * @param models - Model identifiers to use
 * @returns Quick consensus result
 */
export async function quickCouncil(
  question: string,
  models?: string[]
): Promise<{
  question: string;
  responses: Array<{ model: string; response: string; error?: string }>;
  consensus?: string;
  agreement: "strong" | "moderate" | "weak" | "none";
}> {
  const coordinator = await getDefaultCouncilCoordinator();
  return coordinator.quickConsensus(question, models);
}

// =============================================================================
// MCP Tool Definition
// =============================================================================

/**
 * Tool definition for exposing council as an MCP tool.
 */
export const CouncilCoordinatorDefinition = {
  name: "council_deliberate",
  description:
    "Execute a multi-LLM council deliberation using Karpathy's 3-stage algorithm. " +
    "Multiple LLMs or agents provide independent answers, peer review each other, " +
    "and a chairman synthesizes the final answer.",
  inputSchema: {
    type: "object" as const,
    properties: {
      question: {
        type: "string",
        description: "The question for the council to deliberate",
      },
      mode: {
        type: "string",
        enum: ["raw_llm", "agent", "hybrid"],
        description: "Council operation mode",
        default: "raw_llm",
      },
      models: {
        type: "array",
        items: { type: "string" },
        description:
          'LLM models to use (OpenRouter format, e.g., "anthropic/claude-3-opus")',
      },
      agents: {
        type: "array",
        items: { type: "string" },
        description: "Agent types to include (e.g., market_analyst, researcher)",
      },
      context: {
        type: "string",
        description: "Additional context for the deliberation",
      },
      quick: {
        type: "boolean",
        description: "Use quick consensus (skip peer review)",
        default: false,
      },
    },
    required: ["question"],
  },
};

/**
 * Create an MCP tool handler for council deliberation.
 */
export function createCouncilCoordinatorTool() {
  return {
    definition: CouncilCoordinatorDefinition,
    handler: async (params: {
      question: string;
      mode?: "raw_llm" | "agent" | "hybrid";
      models?: string[];
      agents?: string[];
      context?: string;
      quick?: boolean;
    }) => {
      const coordinator = await getDefaultCouncilCoordinator();

      if (params.quick) {
        // Quick consensus mode
        const result = await coordinator.quickConsensus(
          params.question,
          params.models
        );
        return {
          success: true,
          question: result.question,
          consensus: result.consensus,
          agreement: result.agreement,
          responses: result.responses,
        };
      }

      // Full deliberation mode
      const members: import("./council-types.js").CouncilMember[] = [];

      // Add LLM members
      if (params.models && params.models.length > 0) {
        for (let i = 0; i < params.models.length; i++) {
          members.push({
            type: "llm" as const,
            id: `llm-${i}`,
            provider: "openrouter" as const,
            model: params.models[i],
            modelRoute: params.models[i],
          });
        }
      }

      // Add agent members
      if (params.agents && params.agents.length > 0) {
        for (let i = 0; i < params.agents.length; i++) {
          members.push({
            type: "agent" as const,
            id: `agent-${i}`,
            agentType: params.agents[i] as import("../agent-types.js").SpecializedAgentType,
          });
        }
      }

      // Default to some models if none specified
      if (members.length === 0) {
        members.push(
          {
            type: "llm" as const,
            id: "claude",
            provider: "openrouter" as const,
            model: "anthropic/claude-3-opus",
            modelRoute: "anthropic/claude-3-opus",
          },
          {
            type: "llm" as const,
            id: "gpt4",
            provider: "openrouter" as const,
            model: "openai/gpt-4-turbo",
            modelRoute: "openai/gpt-4-turbo",
          }
        );
      }

      const result = await coordinator.deliberate(
        params.question,
        {
          mode: params.mode ?? (params.agents ? "hybrid" : "raw_llm"),
          members,
          chairman: { mode: "highest_scorer" },
        },
        {
          context: params.context,
          includeDebug: false,
        }
      );

      return {
        success: result.success,
        sessionId: result.sessionId,
        finalAnswer: result.finalAnswer,
        summary: result.summary,
      };
    },
  };
}
