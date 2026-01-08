/**
 * Council stage execution - implements the 3-stage deliberation algorithm.
 *
 * Stage 1: Parallel independent responses from all council members
 * Stage 2: Anonymous peer review and ranking of responses
 * Stage 3: Chairman synthesizes final answer
 */

import type { AgentOrchestrator } from "../tiara.js";
import type {
  CouncilConfig,
  CouncilMember,
  CouncilResponse,
  CouncilSession,
  PeerReview,
  ReviewAggregate,
  ChairmanSynthesis,
  LLMMember,
  AgentMember,
  CouncilProviderConfig,
} from "./council-types.js";
import {
  type CouncilProvider,
  createProviderForMember,
} from "./council-providers.js";

// ─────────────────────────────────────────────────────────────────────────────
// Stage 1: Parallel Independent Responses
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute Stage 1: Collect parallel independent responses from all members.
 */
export async function executeStage1Parallel(params: {
  session: CouncilSession;
  tiara?: AgentOrchestrator;
}): Promise<CouncilResponse[]> {
  const { session } = params;
  const { config, question, context } = session;

  const responses: CouncilResponse[] = [];
  const maxParallel = config.maxParallel ?? 5;

  // Separate LLM and agent members
  const llmMembers = config.members.filter(
    (m): m is LLMMember => m.type === "llm",
  );
  const agentMembers = config.members.filter(
    (m): m is AgentMember => m.type === "agent",
  );

  // Process LLM members in batches
  for (let i = 0; i < llmMembers.length; i += maxParallel) {
    const batch = llmMembers.slice(i, i + maxParallel);
    const batchResults = await Promise.allSettled(
      batch.map((member) =>
        executeLLMResponse(member, question, context, config),
      ),
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const member = batch[j];

      if (result.status === "fulfilled") {
        responses.push(result.value);
      } else {
        responses.push({
          memberId: member.id,
          memberType: "llm",
          response: "",
          error: result.reason?.message ?? "Unknown error",
          metadata: { durationMs: 0 },
        });
      }
    }
  }

  // Process agent members (if tiara provided)
  if (params.tiara && agentMembers.length > 0) {
    for (let i = 0; i < agentMembers.length; i += maxParallel) {
      const batch = agentMembers.slice(i, i + maxParallel);
      const batchResults = await Promise.allSettled(
        batch.map((member) =>
          executeAgentResponse(
            member,
            question,
            context,
            params.tiara!,
            config.stageTimeoutMs,
          ),
        ),
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const member = batch[j];

        if (result.status === "fulfilled") {
          responses.push(result.value);
        } else {
          responses.push({
            memberId: member.id,
            memberType: "agent",
            response: "",
            error: result.reason?.message ?? "Unknown error",
            metadata: { agentType: member.agentType, durationMs: 0 },
          });
        }
      }
    }
  }

  return responses;
}

/**
 * Execute LLM member response via provider.
 */
async function executeLLMResponse(
  member: LLMMember,
  question: string,
  context: string | undefined,
  config: CouncilConfig,
): Promise<CouncilResponse> {
  const startTime = Date.now();

  try {
    const provider = createProviderForMember(member, config.defaultProvider);
    const prompt = buildStage1Prompt(question, context, member);

    const result = await provider.complete(prompt, {
      systemPrompt: member.systemPrompt,
      temperature: member.temperature ?? 0.7,
      maxTokens: member.maxTokens ?? 4096,
      timeoutMs: config.stageTimeoutMs,
    });

    return {
      memberId: member.id,
      memberType: "llm",
      response: result.text,
      metadata: {
        provider: member.provider,
        model: result.model ?? member.model,
        durationMs: result.durationMs,
        tokenUsage: result.usage
          ? {
              input: result.usage.inputTokens,
              output: result.usage.outputTokens,
            }
          : undefined,
      },
    };
  } catch (error) {
    return {
      memberId: member.id,
      memberType: "llm",
      response: "",
      error: error instanceof Error ? error.message : String(error),
      metadata: {
        provider: member.provider,
        model: member.model,
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Execute agent member response via tiara.
 */
async function executeAgentResponse(
  member: AgentMember,
  question: string,
  context: string | undefined,
  tiara: AgentOrchestrator,
  timeoutMs?: number,
): Promise<CouncilResponse> {
  const startTime = Date.now();

  try {
    // Use the tiara's spawnAgent method to execute the agent
    const prompt = buildStage1Prompt(question, context, member);

    const result = await tiara.spawnAgent({
      agentType: member.agentType,
      action: "respond",
      params: { query: prompt },
      context: member.context ? JSON.stringify(member.context) : undefined,
    });

    return {
      memberId: member.id,
      memberType: "agent",
      response:
        typeof result.result === "string"
          ? result.result
          : JSON.stringify(result.result ?? result.error ?? ""),
      error: result.error,
      metadata: {
        agentType: member.agentType,
        durationMs: result.durationMs ?? Date.now() - startTime,
      },
    };
  } catch (error) {
    return {
      memberId: member.id,
      memberType: "agent",
      response: "",
      error: error instanceof Error ? error.message : String(error),
      metadata: {
        agentType: member.agentType,
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Build the Stage 1 prompt for a council member.
 */
function buildStage1Prompt(
  question: string,
  context: string | undefined,
  member: CouncilMember,
): string {
  const parts: string[] = [];

  if (context) {
    parts.push(`## Context\n${context}\n`);
  }

  parts.push(`## Question\n${question}\n`);

  parts.push(`## Instructions`);
  parts.push(`Provide your independent analysis and answer to this question.`);
  parts.push(`Include your reasoning process and confidence level.`);
  parts.push(`Be thorough but concise.`);

  if (member.type === "agent") {
    parts.push(
      `\nApply your specialized expertise as a ${member.agentType} to this question.`,
    );
  }

  if (member.role === "specialist") {
    parts.push(
      `\nFocus on the aspects where your specialized knowledge is most relevant.`,
    );
  }

  return parts.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 2: Peer Review
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute Stage 2: Peer review of all responses.
 */
export async function executeStage2PeerReview(params: {
  session: CouncilSession;
  tiara?: AgentOrchestrator;
}): Promise<{ reviews: PeerReview[]; aggregates: ReviewAggregate[] }> {
  const { session } = params;
  const { config, question, responses } = session;
  const { anonymous, criteria, allowSelfReview } = config.peerReview;

  const reviews: PeerReview[] = [];
  const successfulResponses = responses.filter((r) => !r.error);

  // Each member reviews other members' responses
  const llmMembers = config.members.filter(
    (m): m is LLMMember => m.type === "llm",
  );

  for (const reviewer of llmMembers) {
    const responsesToReview = allowSelfReview
      ? successfulResponses
      : successfulResponses.filter((r) => r.memberId !== reviewer.id);

    for (const response of responsesToReview) {
      try {
        const review = await executeReview({
          reviewer,
          response,
          question,
          criteria,
          anonymous,
          config,
        });
        if (review) {
          reviews.push(review);
        }
      } catch (error) {
        // Skip failed reviews, they don't contribute to aggregates
        console.warn(
          `Review failed: ${reviewer.id} -> ${response.memberId}:`,
          error,
        );
      }
    }
  }

  // Aggregate reviews per response
  const aggregates = aggregateReviews(reviews, successfulResponses, config.members);

  return { reviews, aggregates };
}

/**
 * Execute a single peer review.
 */
async function executeReview(params: {
  reviewer: LLMMember;
  response: CouncilResponse;
  question: string;
  criteria: string[];
  anonymous: boolean;
  config: CouncilConfig;
}): Promise<PeerReview | null> {
  const { reviewer, response, question, criteria, anonymous, config } = params;

  const provider = createProviderForMember(reviewer, config.defaultProvider);
  const prompt = buildReviewPrompt({
    question,
    response: response.response,
    authorId: anonymous ? undefined : response.memberId,
    criteria,
  });

  const result = await provider.complete(prompt, {
    systemPrompt: `You are a critical reviewer evaluating responses to questions.
Your task is to provide fair, objective assessments based on the given criteria.
Respond in JSON format with the structure specified in the instructions.`,
    temperature: 0.3, // Lower temperature for more consistent reviews
    maxTokens: 2048,
    timeoutMs: config.stageTimeoutMs,
  });

  // Parse the review response
  return parseReviewResponse(reviewer.id, response.memberId, result.text);
}

/**
 * Build the review prompt for Stage 2.
 */
function buildReviewPrompt(params: {
  question: string;
  response: string;
  authorId?: string;
  criteria: string[];
}): string {
  const { question, response, authorId, criteria } = params;

  const parts = [
    `## Original Question`,
    question,
    ``,
    `## Response to Review`,
    authorId ? `(from: ${authorId})` : "(anonymous author)",
    response,
    ``,
    `## Evaluation Criteria`,
    ...criteria.map((c, i) => `${i + 1}. ${c}`),
    ``,
    `## Your Task`,
    `Evaluate this response and provide your assessment in the following JSON format:`,
    `\`\`\`json`,
    `{`,
    `  "score": <number 0-100>,`,
    `  "strengths": ["<strength 1>", "<strength 2>", ...],`,
    `  "weaknesses": ["<weakness 1>", "<weakness 2>", ...],`,
    `  "recommendation": "<accept|revise|reject>",`,
    `  "comments": "<optional additional comments>"`,
    `}`,
    `\`\`\``,
  ];

  return parts.join("\n");
}

/**
 * Parse the review response from the LLM.
 */
function parseReviewResponse(
  reviewerId: string,
  targetId: string,
  responseText: string,
): PeerReview | null {
  try {
    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : responseText.trim();

    const parsed = JSON.parse(jsonStr) as {
      score?: number;
      strengths?: string[];
      weaknesses?: string[];
      recommendation?: string;
      comments?: string;
    };

    return {
      reviewerId,
      targetResponseId: targetId,
      score: Math.min(100, Math.max(0, parsed.score ?? 50)),
      strengths: parsed.strengths ?? [],
      weaknesses: parsed.weaknesses ?? [],
      recommendation:
        (parsed.recommendation as "accept" | "revise" | "reject") ?? "revise",
      comments: parsed.comments,
    };
  } catch {
    // If parsing fails, return a neutral review
    return {
      reviewerId,
      targetResponseId: targetId,
      score: 50,
      strengths: [],
      weaknesses: ["Unable to parse review"],
      recommendation: "revise",
      comments: "Review parsing failed",
    };
  }
}

/**
 * Aggregate reviews for each response.
 */
function aggregateReviews(
  reviews: PeerReview[],
  responses: CouncilResponse[],
  members: CouncilMember[],
): ReviewAggregate[] {
  const memberWeights = new Map(members.map((m) => [m.id, m.weight ?? 1.0]));

  return responses.map((response) => {
    const responseReviews = reviews.filter(
      (r) => r.targetResponseId === response.memberId,
    );

    const scores = responseReviews.map((r) => r.score);
    const weightedScores = responseReviews.map(
      (r) => r.score * (memberWeights.get(r.reviewerId) ?? 1.0),
    );

    const averageScore =
      scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 0;

    const totalWeight = responseReviews.reduce(
      (sum, r) => sum + (memberWeights.get(r.reviewerId) ?? 1.0),
      0,
    );
    const weightedScore =
      totalWeight > 0
        ? weightedScores.reduce((a, b) => a + b, 0) / totalWeight
        : 0;

    // Determine consensus level based on score variance
    const variance = calculateVariance(scores);
    let consensus: ReviewAggregate["consensus"];
    if (variance < 100) consensus = "strong";
    else if (variance < 400) consensus = "moderate";
    else if (variance < 900) consensus = "weak";
    else consensus = "split";

    return {
      responseId: response.memberId,
      memberId: response.memberId,
      averageScore,
      weightedScore,
      reviewCount: responseReviews.length,
      rankings: responseReviews
        .map((r) => r.ranking)
        .filter((r): r is number => r !== undefined),
      consensus,
    };
  });
}

/**
 * Calculate variance of a number array.
 */
function calculateVariance(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
  return numbers.reduce((sum, n) => sum + (n - mean) ** 2, 0) / numbers.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 3: Chairman Synthesis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute Stage 3: Chairman synthesizes the final answer.
 */
export async function executeStage3Synthesis(params: {
  session: CouncilSession;
  tiara?: AgentOrchestrator;
}): Promise<ChairmanSynthesis> {
  const { session } = params;
  const { config, question, responses, reviewAggregates } = session;
  const startTime = Date.now();

  // Determine chairman
  const chairman = resolveChairman(config, reviewAggregates);

  // Build synthesis prompt
  const prompt = buildSynthesisPrompt({
    question,
    context: session.context,
    responses,
    aggregates: reviewAggregates,
  });

  // Execute chairman synthesis
  if (chairman.type === "llm") {
    const provider = createProviderForMember(chairman, config.defaultProvider);

    const result = await provider.complete(prompt, {
      systemPrompt: CHAIRMAN_SYSTEM_PROMPT,
      temperature: 0.5,
      maxTokens: 8192,
      timeoutMs: config.stageTimeoutMs,
    });

    // Parse the synthesis response
    return parseSynthesisResponse(chairman.id, result, startTime);
  }

  // For agent chairman, use a simpler synthesis
  return {
    chairmanId: chairman.id,
    finalResponse: responses[0]?.response ?? "",
    methodology: "Agent-based synthesis (simplified)",
    sourcesUsed: responses.filter((r) => !r.error).map((r) => r.memberId),
    keyInsights: [],
    confidence: 0.7,
    metadata: {
      durationMs: Date.now() - startTime,
    },
  };
}

/**
 * Chairman system prompt.
 */
const CHAIRMAN_SYSTEM_PROMPT = `You are the Chairman of an LLM Council, responsible for synthesizing multiple expert opinions into a final, authoritative answer.

Your responsibilities:
1. Review all council member responses and their peer review scores
2. Identify the strongest insights from each response
3. Synthesize a comprehensive final answer that incorporates the best elements
4. Note any significant dissenting views or areas of disagreement
5. Provide a confidence level based on the consensus strength

Your synthesis should be:
- Comprehensive but not redundant
- Well-organized and clearly structured
- Honest about uncertainty where it exists
- Properly attributed when incorporating specific insights`;

/**
 * Resolve which member should be the chairman.
 */
function resolveChairman(
  config: CouncilConfig,
  aggregates: ReviewAggregate[],
): CouncilMember {
  const { chairman, members } = config;

  switch (chairman.mode) {
    case "designated": {
      const designated = members.find((m) => m.id === chairman.memberId);
      if (designated) return designated;
      break;
    }

    case "highest_scorer": {
      if (aggregates.length > 0) {
        const topAggregate = aggregates.reduce((best, curr) =>
          curr.weightedScore > best.weightedScore ? curr : best,
        );
        const topMember = members.find((m) => m.id === topAggregate.memberId);
        if (topMember) return topMember;
      }
      break;
    }

    case "rotating":
    case "random": {
      const randomIndex = Math.floor(Math.random() * members.length);
      return members[randomIndex];
    }
  }

  // Fallback: use llmConfig if provided, otherwise first member
  if (chairman.llmConfig) {
    return {
      type: "llm",
      id: "chairman",
      provider: chairman.llmConfig.provider,
      model: chairman.llmConfig.model,
      modelRoute: chairman.llmConfig.modelRoute,
    };
  }

  return members[0];
}

/**
 * Build the synthesis prompt for the chairman.
 */
function buildSynthesisPrompt(params: {
  question: string;
  context?: string;
  responses: CouncilResponse[];
  aggregates: ReviewAggregate[];
}): string {
  const { question, context, responses, aggregates } = params;

  // Sort responses by score (highest first)
  const scoredResponses = responses
    .filter((r) => !r.error)
    .map((r) => ({
      ...r,
      aggregate: aggregates.find((a) => a.memberId === r.memberId),
    }))
    .sort(
      (a, b) =>
        (b.aggregate?.weightedScore ?? 0) - (a.aggregate?.weightedScore ?? 0),
    );

  const parts = [
    `## Your Role`,
    `You are the Chairman synthesizing the council's deliberation.`,
    ``,
    `## Original Question`,
    question,
    ``,
  ];

  if (context) {
    parts.push(`## Context`, context, ``);
  }

  parts.push(`## Council Responses (ranked by peer review score)`);

  for (const r of scoredResponses) {
    const score = r.aggregate?.weightedScore?.toFixed(1) ?? "N/A";
    const consensus = r.aggregate?.consensus ?? "unknown";
    parts.push(
      ``,
      `### Member: ${r.memberId}`,
      `Score: ${score}/100 | Consensus: ${consensus}`,
      ``,
      r.response,
    );
  }

  parts.push(
    ``,
    `## Your Task`,
    `Synthesize the council's responses into a final, authoritative answer.`,
    ``,
    `Provide your synthesis in the following JSON format:`,
    `\`\`\`json`,
    `{`,
    `  "finalResponse": "<your comprehensive synthesis>",`,
    `  "methodology": "<brief description of how you synthesized>",`,
    `  "sourcesUsed": ["<member_id1>", "<member_id2>", ...],`,
    `  "keyInsights": ["<insight1>", "<insight2>", ...],`,
    `  "dissent": "<any notable dissenting views, or null>",`,
    `  "confidence": <0.0 to 1.0>`,
    `}`,
    `\`\`\``,
  );

  return parts.join("\n");
}

/**
 * Parse the synthesis response from the chairman.
 */
function parseSynthesisResponse(
  chairmanId: string,
  result: { text: string; usage?: { inputTokens: number; outputTokens: number }; durationMs: number },
  startTime: number,
): ChairmanSynthesis {
  try {
    // Extract JSON from the response
    const jsonMatch = result.text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : result.text.trim();

    const parsed = JSON.parse(jsonStr) as {
      finalResponse?: string;
      methodology?: string;
      sourcesUsed?: string[];
      keyInsights?: string[];
      dissent?: string;
      confidence?: number;
    };

    return {
      chairmanId,
      finalResponse: parsed.finalResponse ?? result.text,
      methodology:
        parsed.methodology ?? "Weighted synthesis based on peer review scores",
      sourcesUsed: parsed.sourcesUsed ?? [],
      keyInsights: parsed.keyInsights ?? [],
      dissent: parsed.dissent,
      confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.7)),
      metadata: {
        durationMs: result.durationMs,
        tokenUsage: result.usage
          ? {
              input: result.usage.inputTokens,
              output: result.usage.outputTokens,
            }
          : undefined,
      },
    };
  } catch {
    // If parsing fails, use the raw response
    return {
      chairmanId,
      finalResponse: result.text,
      methodology: "Direct synthesis (parsing failed)",
      sourcesUsed: [],
      keyInsights: [],
      confidence: 0.5,
      metadata: {
        durationMs: result.durationMs,
        tokenUsage: result.usage
          ? {
              input: result.usage.inputTokens,
              output: result.usage.outputTokens,
            }
          : undefined,
      },
    };
  }
}
