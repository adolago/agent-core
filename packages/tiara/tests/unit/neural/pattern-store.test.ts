/**
 * PersistentPatternStore tests
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PersistentPatternStore } from '../../../src/services/agentic-flow-hooks/pattern-store.js';

process.env.NODE_ENV = 'test';

describe('PersistentPatternStore', () => {
  const modelId = 'model-1';

  it('persists patterns on add', () => {
    const savePattern = jest.fn().mockResolvedValue('entry-1');
    const searchPatterns = jest.fn().mockResolvedValue([]);

    const store = new PersistentPatternStore({ modelId, savePattern, searchPatterns });
    store.add({
      id: 'pattern-1',
      type: 'success',
      confidence: 0.9,
      occurrences: 2,
      context: { input: 'a', output: 'b' },
    });

    expect(savePattern).toHaveBeenCalledWith(
      expect.objectContaining({
        patternType: 'success_pattern',
        modelId,
      }),
    );
  });

  it('loads persisted patterns into the store', async () => {
    const savePattern = jest.fn().mockResolvedValue('entry-1');
    const searchPatterns = jest.fn().mockResolvedValue([
      {
        pattern: {
          id: 'pattern-2',
          patternType: 'success_pattern',
          content: 'pattern:success id:pattern-2',
          context: { task: 'build' },
          confidence: 0.8,
          occurrences: 3,
          modelId,
        },
        score: 0.9,
      },
    ]);

    const store = new PersistentPatternStore({ modelId, savePattern, searchPatterns });
    await store.load();

    expect(searchPatterns).toHaveBeenCalledWith(
      'pattern',
      expect.objectContaining({ modelId }),
    );

    const patterns = store.export();
    expect(patterns).toHaveLength(1);
    expect(patterns[0].type).toBe('success');
  });

  it('finds similar patterns by type and confidence', () => {
    const savePattern = jest.fn().mockResolvedValue('entry-1');
    const searchPatterns = jest.fn().mockResolvedValue([]);

    const store = new PersistentPatternStore({ modelId, savePattern, searchPatterns });
    store.add({
      id: 'pattern-3',
      type: 'behavior',
      confidence: 0.7,
      occurrences: 1,
      context: { area: 'cli' },
    });

    const matches = store.findSimilar({ type: 'behavior' }, 0.6);
    expect(matches).toHaveLength(1);
  });
});
