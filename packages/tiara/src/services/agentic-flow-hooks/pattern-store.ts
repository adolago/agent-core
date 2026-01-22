/**
 * Persistent pattern store backed by unified memory.
 */

import { Logger } from '../../core/logger.js';
import type { PatternEntry, TiaraCategory } from '../../memory/unified-bridge.js';
import type { Pattern, PatternStore } from './types.js';

const logger = new Logger(
  {
    level: 'info',
    format: 'text',
    destination: 'console',
  },
  { prefix: 'PersistentPatternStore' },
);

type SearchPatternsOptions = {
  patternType?: TiaraCategory;
  modelId?: string;
  limit?: number;
  threshold?: number;
  tags?: string[];
  namespace?: string | null;
};

export type SavePatternFn = (pattern: PatternEntry) => Promise<string>;
export type SearchPatternsFn = (
  query: string,
  options?: SearchPatternsOptions,
) => Promise<Array<{ pattern: PatternEntry; score: number }>>;

let bridgePromise: Promise<{ savePattern: SavePatternFn; searchPatterns: SearchPatternsFn }> | null = null;

async function loadBridge() {
  if (!bridgePromise) {
    bridgePromise = import('../../memory/unified-bridge.js') as Promise<{
      savePattern: SavePatternFn;
      searchPatterns: SearchPatternsFn;
    }>;
  }
  return bridgePromise;
}

function createDefaultSavePattern(): SavePatternFn {
  return async (pattern) => {
    const bridge = await loadBridge();
    return bridge.savePattern(pattern);
  };
}

function createDefaultSearchPatterns(): SearchPatternsFn {
  return async (query, options) => {
    const bridge = await loadBridge();
    return bridge.searchPatterns(query, options);
  };
}

const PATTERN_TYPE_MAP: Record<Pattern['type'], TiaraCategory> = {
  success: 'success_pattern',
  failure: 'error_pattern',
  optimization: 'optimization_pattern',
  behavior: 'behavior_pattern',
};

const ENTRY_TYPE_MAP: Record<TiaraCategory, Pattern['type']> = {
  code_pattern: 'behavior',
  error_pattern: 'failure',
  behavior_pattern: 'behavior',
  success_pattern: 'success',
  optimization_pattern: 'optimization',
  swarm_state: 'behavior',
  agent_context: 'behavior',
  workflow_template: 'behavior',
};

function normalizeContext(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }

  if (typeof value === 'string' && value.length > 0) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return { summary: value };
    }
    return { summary: value };
  }

  if (value !== undefined) {
    return { value };
  }

  return {};
}

function ensureTimestamp(context: Record<string, unknown>): Record<string, unknown> {
  if (typeof context.timestamp !== 'number') {
    return { ...context, timestamp: Date.now() };
  }
  return context;
}

function stringifyContext(context: Record<string, unknown>): string {
  try {
    return JSON.stringify(context);
  } catch {
    return String(context);
  }
}

function buildPatternContent(pattern: Pattern): string {
  const contextText = stringifyContext(pattern.context || {});
  const content = `pattern:${pattern.type} id:${pattern.id} ${contextText}`;
  return content.length > 2000 ? content.slice(0, 2000) : content;
}

function toPatternEntry(pattern: Pattern, modelId: string): PatternEntry {
  const success =
    pattern.type === 'failure' ? false : pattern.type === 'success' ? true : undefined;

  return {
    patternType: PATTERN_TYPE_MAP[pattern.type] || 'behavior_pattern',
    content: buildPatternContent(pattern),
    context: pattern.context,
    success,
    confidence: pattern.confidence,
    occurrences: pattern.occurrences,
    modelId,
    metadata: {
      source: 'agentic-flow-hooks',
      patternId: pattern.id,
    },
  };
}

function toPattern(entry: PatternEntry): Pattern {
  const context = ensureTimestamp(normalizeContext(entry.context));

  return {
    id: entry.id || `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: ENTRY_TYPE_MAP[entry.patternType] || 'behavior',
    confidence: entry.confidence ?? 1,
    occurrences: entry.occurrences ?? 1,
    context,
  };
}

export interface PersistentPatternStoreOptions {
  modelId: string;
  preloadLimit?: number;
  savePattern?: SavePatternFn;
  searchPatterns?: SearchPatternsFn;
}

export class PersistentPatternStore implements PatternStore {
  private patterns = new Map<string, Pattern>();
  private loaded = false;
  private loadingPromise: Promise<void> | null = null;
  private modelId: string;
  private preloadLimit: number;
  private savePatternFn: SavePatternFn;
  private searchPatternsFn: SearchPatternsFn;

  constructor(options: PersistentPatternStoreOptions) {
    this.modelId = options.modelId || 'default';
    this.preloadLimit = options.preloadLimit ?? 200;
    this.savePatternFn = options.savePattern || createDefaultSavePattern();
    this.searchPatternsFn = options.searchPatterns || createDefaultSearchPatterns();
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = this.loadInternal();
    return this.loadingPromise;
  }

  add(pattern: Pattern): void {
    const normalized = {
      ...pattern,
      context: ensureTimestamp(normalizeContext(pattern.context)),
    };

    this.patterns.set(normalized.id, normalized);
    void this.persistPattern(normalized);
  }

  get(id: string): Pattern | undefined {
    return this.patterns.get(id);
  }

  findSimilar(pattern: Partial<Pattern>, threshold: number): Pattern[] {
    const results: Pattern[] = [];
    for (const candidate of this.patterns.values()) {
      if (pattern.type && candidate.type !== pattern.type) continue;
      if (candidate.confidence >= threshold) {
        results.push(candidate);
      }
    }
    return results;
  }

  getByType(type: Pattern['type']): Pattern[] {
    return Array.from(this.patterns.values()).filter((pattern) => pattern.type === type);
  }

  prune(maxAge: number): void {
    const cutoff = Date.now() - maxAge;
    for (const [id, pattern] of this.patterns.entries()) {
      const timestamp = (pattern.context as Record<string, unknown>)?.timestamp;
      if (typeof timestamp === 'number' && timestamp < cutoff) {
        this.patterns.delete(id);
      }
    }
  }

  export(): Pattern[] {
    return Array.from(this.patterns.values());
  }

  import(patterns: Pattern[]): void {
    for (const pattern of patterns) {
      this.add(pattern);
    }
  }

  private async loadInternal(): Promise<void> {
    try {
      const results = await this.searchPatternsFn('pattern', {
        modelId: this.modelId,
        limit: this.preloadLimit,
        threshold: 0,
      });

      for (const result of results) {
        const pattern = toPattern(result.pattern);
        this.patterns.set(pattern.id, pattern);
      }
    } catch (error) {
      logger.warn('Failed to load persisted patterns', error);
    } finally {
      this.loaded = true;
      this.loadingPromise = null;
    }
  }

  private async persistPattern(pattern: Pattern): Promise<void> {
    try {
      await this.savePatternFn(toPatternEntry(pattern, this.modelId));
    } catch (error) {
      logger.warn('Failed to persist pattern', error);
    }
  }
}

export default PersistentPatternStore;
