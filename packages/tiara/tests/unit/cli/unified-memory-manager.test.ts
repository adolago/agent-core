/**
 * UnifiedMemoryManager tests (Qdrant-only)
 */

import { describe, it, expect, jest } from '@jest/globals';
import { UnifiedMemoryManager } from '../../../src/cli/commands/memory.js';

describe('UnifiedMemoryManager (Qdrant)', () => {
  it('maps query results to string values with timestamps', async () => {
    const manager = new UnifiedMemoryManager();
    const updatedAt = new Date('2024-01-01T00:00:00Z');
    const fakeStore = {
      initialize: jest.fn(),
      store: jest.fn(),
      search: jest.fn().mockResolvedValue([
        { key: 'alpha', value: 123, namespace: 'project', updatedAt },
      ]),
      listAll: jest.fn(),
    };

    (manager as any).store = fakeStore;

    const results = await manager.query('alpha', 'project', 5);

    expect(results).toHaveLength(1);
    expect(results[0].value).toBe('123');
    expect(results[0].timestamp).toBe(updatedAt.getTime());
    expect(fakeStore.search).toHaveBeenCalledWith('alpha', { namespace: 'project', limit: 5 });
  });

  it('computes stats with namespace breakdown and Qdrant config', async () => {
    const manager = new UnifiedMemoryManager();
    const fakeStore = {
      initialize: jest.fn(),
      store: jest.fn(),
      search: jest.fn(),
      listAll: jest.fn().mockResolvedValue([
        { key: 'a', value: 'one', namespace: 'default' },
        { key: 'b', value: 'two', namespace: 'project' },
      ]),
      options: { url: 'http://qdrant:6333', collection: 'agent_memory' },
    };

    (manager as any).store = fakeStore;

    const stats = await manager.getStats();

    expect(stats.backend).toBe('qdrant');
    expect(stats.totalEntries).toBe(2);
    expect(stats.namespaceStats).toEqual({ default: 1, project: 1 });
    expect(stats.url).toBe('http://qdrant:6333');
    expect(stats.collection).toBe('agent_memory');
    expect(stats.sizeBytes).toBeGreaterThan(0);
  });
});
