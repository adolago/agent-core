/**
 * Unified memory bridge (stub)
 * Provides minimal exports for pattern storage integrations.
 */

export type TiaraCategory =
  | 'code_pattern'
  | 'error_pattern'
  | 'behavior_pattern'
  | 'success_pattern'
  | 'optimization_pattern'
  | 'swarm_state'
  | 'agent_context'
  | 'workflow_template';

export interface PatternEntry {
  id?: string;
  patternType: TiaraCategory;
  content: string;
  context?: Record<string, unknown> | string;
  success?: boolean;
  confidence?: number;
  occurrences?: number;
  modelId?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  createdAt?: Date;
}

export async function savePattern(pattern: PatternEntry): Promise<string> {
  return pattern.id || `pattern_${Date.now()}`;
}

export async function searchPatterns(
  _query: string,
  _options?: {
    patternType?: TiaraCategory;
    modelId?: string;
    limit?: number;
    threshold?: number;
    tags?: string[];
    namespace?: string | null;
  },
): Promise<Array<{ pattern: PatternEntry; score: number }>> {
  return [];
}
