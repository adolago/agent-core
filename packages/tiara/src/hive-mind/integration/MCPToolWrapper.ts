/**
 * MCPToolWrapper Class
 *
 * Wraps agent-core backed tools for Hive Mind usage.
 */

import { EventEmitter } from 'events';
import { getAgentCoreClient } from '../../agent-core/index.js';
import { getErrorMessage } from '../../utils/type-guards.js';

interface MCPToolResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

type AnalyzePatternParams = {
  action: string;
  operation: string;
  metadata?: Record<string, unknown>;
};

type StoreMemoryParams = {
  action: 'store';
  key: string;
  value: unknown;
  namespace?: string;
  type?: string;
  ttl?: number;
};

type RetrieveMemoryParams = {
  action: 'retrieve';
  key: string;
  namespace?: string;
};

type DeleteMemoryParams = {
  action: 'delete';
  key: string;
  namespace?: string;
};

type TrainNeuralParams = {
  pattern_type: string;
  training_data: string;
  epochs?: number;
};

type PredictParams = {
  modelId?: string;
  input: string;
};

type OrchestrateTaskParams = {
  task: string;
  priority?: string | number;
  strategy?: string;
  dependencies?: string[];
};

type LoadBalanceParams = {
  tasks?: unknown[];
};

type MemoryCategory =
  | 'conversation'
  | 'fact'
  | 'preference'
  | 'task'
  | 'decision'
  | 'relationship'
  | 'note'
  | 'pattern';

const DEFAULT_MEMORY_SERVER = process.env.AGENT_CORE_MEMORY_MCP ?? 'personas-memory';
const DEFAULT_PERSONA = (process.env.AGENT_CORE_HIVE_MIND_PERSONA as
  | 'zee'
  | 'stanley'
  | 'johny') ?? 'zee';

const MEMORY_CATEGORY_MAP: Record<string, MemoryCategory> = {
  task: 'task',
  decision: 'decision',
  pattern: 'pattern',
  preference: 'preference',
  fact: 'fact',
  relationship: 'relationship',
};

function extractJson(text: string): any | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    const startObj = trimmed.indexOf('{');
    const endObj = trimmed.lastIndexOf('}');
    if (startObj >= 0 && endObj > startObj) {
      try {
        return JSON.parse(trimmed.slice(startObj, endObj + 1));
      } catch {
        // fall through
      }
    }

    const startArr = trimmed.indexOf('[');
    const endArr = trimmed.lastIndexOf(']');
    if (startArr >= 0 && endArr > startArr) {
      try {
        return JSON.parse(trimmed.slice(startArr, endArr + 1));
      } catch {
        // fall through
      }
    }
  }

  return null;
}

function extractMcpText(result: any): string {
  if (!result || typeof result !== 'object') return '';
  const content = Array.isArray(result.content) ? result.content : [];
  return content
    .map((item) =>
      item && item.type === 'text' && typeof item.text === 'string' ? item.text : '',
    )
    .filter(Boolean)
    .join('\n')
    .trim();
}

function parseMcpResult(result: any): any {
  if (!result) return null;
  if (typeof result === 'string') {
    return extractJson(result) ?? result;
  }

  if (typeof result === 'object' && Array.isArray(result.content)) {
    const text = extractMcpText(result);
    return extractJson(text) ?? (text ? { text } : result);
  }

  return result;
}

function mapMemoryCategory(type?: string): MemoryCategory {
  if (!type) return 'note';
  const normalized = type.toLowerCase();
  return MEMORY_CATEGORY_MAP[normalized] ?? 'note';
}

function isLikelyJson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

export class MCPToolWrapper extends EventEmitter {
  private readonly client = getAgentCoreClient();
  private readonly memoryServer: string;
  private readonly persona: 'zee' | 'stanley' | 'johny';
  private initialized = false;
  private sessionId?: string;

  constructor(options: { memoryServer?: string; persona?: 'zee' | 'stanley' | 'johny' } = {}) {
    super();
    this.memoryServer = options.memoryServer ?? DEFAULT_MEMORY_SERVER;
    this.persona = options.persona ?? DEFAULT_PERSONA;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.client.ensureConnected();
    this.initialized = true;
  }

  private async ensureSession(): Promise<string> {
    if (this.sessionId) return this.sessionId;
    const session = await this.client.createSession({ title: 'tiara-hive-mind' });
    this.sessionId = session.id;
    return session.id;
  }

  private async promptJson(
    operation: string,
    payload: unknown,
    schema: string,
    fallback: any,
  ): Promise<any> {
    try {
      await this.initialize();
      const sessionId = await this.ensureSession();
      const system =
        `You are a Hive Mind coordinator. Return JSON only.\n` +
        `Operation: ${operation}\n` +
        `Schema: ${schema}`;
      const prompt = `Payload:\n${JSON.stringify(payload, null, 2)}\n\nReturn JSON only.`;
      const result = await this.client.prompt({
        sessionId,
        prompt,
        persona: this.persona,
        system,
      });
      if (!result.success) {
        throw new Error(result.error ?? 'Prompt failed');
      }
      return extractJson(result.text) ?? fallback;
    } catch {
      return fallback;
    }
  }

  private async callMemoryTool(tool: string, args: Record<string, unknown>): Promise<any> {
    await this.initialize();
    const raw = await this.client.callMcpTool(this.memoryServer, tool, args);
    const parsed = parseMcpResult(raw);
    if (raw && typeof raw === 'object' && raw.isError) {
      const message = parsed?.error ?? 'MCP tool error';
      throw new Error(message);
    }
    if (parsed?.success === false) {
      throw new Error(parsed.error ?? 'MCP tool error');
    }
    return parsed;
  }

  private buildAnalysisFallback(params: AnalyzePatternParams) {
    const metadata = params.metadata ?? {};
    const description = String(metadata.description ?? metadata.task ?? '');
    const priority = String(metadata.priority ?? 'medium');
    const dependencies = Number(metadata.dependencies ?? 0);
    const requiresConsensus = Boolean(
      metadata.requiresConsensus ?? metadata.requireConsensus ?? false,
    );
    const requestedCapabilities = Array.isArray(metadata.requiredCapabilities)
      ? (metadata.requiredCapabilities as string[])
      : [];

    let complexity: 'low' | 'medium' | 'high' = 'medium';
    if (priority === 'critical' || dependencies > 3 || requiresConsensus) {
      complexity = 'high';
    } else if (priority === 'low' && dependencies === 0 && description.length < 80) {
      complexity = 'low';
    }

    const estimatedDuration =
      complexity === 'high'
        ? 4 * 60 * 60 * 1000
        : complexity === 'low'
          ? 30 * 60 * 1000
          : 2 * 60 * 60 * 1000;

    const maxAgents =
      typeof metadata.maxAgents === 'number' ? metadata.maxAgents : Math.max(2, requestedCapabilities.length);

    const recommendations = [
      complexity === 'high' ? 'Increase parallelization for throughput.' : 'Keep scope tight.',
      requiresConsensus ? 'Run consensus checkpoints.' : 'Skip consensus for speed.',
    ];

    const suggestedCapabilities = requestedCapabilities.length
      ? requestedCapabilities
      : ['pattern_recognition', 'problem_solving'];

    const data = {
      complexity,
      estimatedDuration,
      resourceRequirements: {
        minAgents: complexity === 'high' ? 2 : 1,
        maxAgents: maxAgents || 4,
        capabilities: requestedCapabilities,
      },
      recommendations,
      suggestedCapabilities,
      recommendation: priority !== 'low',
      strongRecommendation: priority === 'critical',
      expertiseAlignment: requestedCapabilities.length ? 0.7 : 0.5,
    };

    return {
      success: true,
      data,
      complexity: data.complexity,
      estimatedTime: data.estimatedDuration,
      requirements: requestedCapabilities,
      recommendations: data.recommendations,
      suggestedCapabilities: data.suggestedCapabilities,
      confidence: complexity === 'high' ? 0.7 : 0.6,
      rationale: `Heuristic analysis based on ${priority} priority.`,
    };
  }

  private normalizeAnalysis(result: any, fallback: ReturnType<MCPToolWrapper['buildAnalysisFallback']>) {
    const data = {
      ...fallback.data,
      ...(result?.data ?? {}),
    };

    const complexity = result?.complexity ?? data.complexity ?? fallback.complexity;
    const estimatedDuration =
      result?.estimatedDuration ?? data.estimatedDuration ?? fallback.data.estimatedDuration;
    const recommendations =
      result?.recommendations ?? data.recommendations ?? fallback.data.recommendations;
    const suggestedCapabilities =
      result?.suggestedCapabilities ?? data.suggestedCapabilities ?? fallback.data.suggestedCapabilities;

    return {
      success: result?.success ?? true,
      data: {
        ...data,
        complexity,
        estimatedDuration,
        recommendations,
        suggestedCapabilities,
      },
      complexity,
      estimatedTime: result?.estimatedTime ?? estimatedDuration,
      requirements: result?.requirements ?? fallback.requirements,
      recommendations,
      suggestedCapabilities,
      confidence: result?.confidence ?? fallback.confidence,
      rationale: result?.rationale ?? fallback.rationale,
    };
  }

  async analyzePattern(params: AnalyzePatternParams): Promise<MCPToolResponse> {
    const fallback = this.buildAnalysisFallback(params);
    const schema =
      '{ "complexity": "low|medium|high", "estimatedDuration": number, ' +
      '"resourceRequirements": { "minAgents": number, "maxAgents": number, "capabilities": string[] }, ' +
      '"recommendations": string[], "suggestedCapabilities": string[], "recommendation": boolean, ' +
      '"strongRecommendation": boolean, "expertiseAlignment": number, "rationale": string }';
    const result = await this.promptJson('analyze_pattern', { params }, schema, fallback);
    return this.normalizeAnalysis(result, fallback);
  }

  async orchestrateTask(params: OrchestrateTaskParams): Promise<MCPToolResponse> {
    const fallback = {
      success: true,
      data: {
        plan: {
          steps: ['analyze', 'plan', 'execute', 'validate'],
          strategy: params.strategy ?? 'adaptive',
        },
      },
    };
    const schema = '{ "plan": { "steps": string[], "strategy": string }, "notes": string[] }';
    const result = await this.promptJson('task_orchestrate', params, schema, fallback);
    return {
      success: true,
      data: {
        plan: result?.plan ?? fallback.data.plan,
        notes: result?.notes ?? [],
      },
    };
  }

  async loadBalance(params: LoadBalanceParams): Promise<MCPToolResponse> {
    const fallback = { success: true, data: { reassignments: [] } };
    const schema = '{ "reassignments": Array<{ "taskId": string, "from": string, "to": string }> }';
    const result = await this.promptJson('load_balance', params, schema, fallback);
    return {
      success: true,
      data: {
        reassignments: Array.isArray(result?.reassignments) ? result.reassignments : [],
      },
    };
  }

  async trainNeural(params: TrainNeuralParams): Promise<MCPToolResponse> {
    try {
      await this.storeMemory({
        action: 'store',
        key: `train/${params.pattern_type}/${Date.now()}`,
        value: params.training_data,
        namespace: 'hive-mind-learning',
        type: 'pattern',
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  }

  async predict(params: PredictParams): Promise<{ success: boolean; predictions?: string[]; error?: string }> {
    const fallback = { predictions: [] as string[] };
    const schema = '{ "predictions": string[] }';
    const result = await this.promptJson('neural_predict', params, schema, fallback);
    return {
      success: true,
      predictions: Array.isArray(result?.predictions) ? result.predictions : fallback.predictions,
    };
  }

  async storeMemory(params: StoreMemoryParams): Promise<MCPToolResponse> {
    const namespace = params.namespace ?? 'hive-mind';
    const key = params.key;
    const type = params.type ?? 'knowledge';
    const valueString =
      typeof params.value === 'string' ? params.value : JSON.stringify(params.value ?? null);
    const payload = {
      key,
      namespace,
      value: valueString,
      type,
      storedAt: new Date().toISOString(),
    };
    const entryTag = `hive-mind:entry:${namespace}:${key}`;
    const tags = [
      'hive-mind',
      entryTag,
      `hive-mind:namespace:${namespace}`,
      `hive-mind:key:${key}`,
      `hive-mind:type:${type}`,
    ];

    try {
      const result = await this.callMemoryTool('memory_store', {
        content: JSON.stringify(payload),
        category: mapMemoryCategory(type),
        importance: 0.4,
        tags,
        summary: `hive-mind ${namespace} ${key}`,
      });
      return { success: true, data: { id: result?.id } };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  }

  async retrieveMemory(params: RetrieveMemoryParams): Promise<string | null> {
    const namespace = params.namespace ?? 'hive-mind';
    const keyTag = `hive-mind:entry:${namespace}:${params.key}`;

    try {
      const result = await this.callMemoryTool('memory_search', {
        query: params.key,
        tags: [keyTag],
        limit: 5,
        threshold: 0,
      });

      const entries = Array.isArray(result?.results) ? result.results : [];
      const entry = entries.find((item: any) => typeof item?.content === 'string');
      if (!entry) return null;

      const parsed = extractJson(entry.content);
      if (parsed && typeof parsed === 'object' && 'value' in parsed) {
        const storedValue = (parsed as { value?: unknown }).value;
        if (typeof storedValue === 'string') {
          return isLikelyJson(storedValue) ? storedValue : JSON.stringify(storedValue);
        }
        return JSON.stringify(storedValue ?? null);
      }

      return isLikelyJson(entry.content) ? entry.content : JSON.stringify(entry.content);
    } catch {
      return null;
    }
  }

  async deleteMemory(params: DeleteMemoryParams): Promise<MCPToolResponse> {
    const namespace = params.namespace ?? 'hive-mind';
    const keyTag = `hive-mind:entry:${namespace}:${params.key}`;

    try {
      const result = await this.callMemoryTool('memory_search', {
        query: params.key,
        tags: [keyTag],
        limit: 1,
        threshold: 0,
      });
      const entry = Array.isArray(result?.results) ? result.results[0] : null;
      if (!entry?.id) {
        return { success: false, error: 'Memory entry not found' };
      }

      await this.callMemoryTool('memory_delete', { id: entry.id });
      return { success: true };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  }
}
