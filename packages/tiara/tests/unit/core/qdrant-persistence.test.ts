/**
 * QdrantPersistenceManager tests
 */

import { describe, it, expect, jest } from '@jest/globals';
import { QdrantPersistenceManager } from '../../../src/core/qdrant-persistence.js';

describe('QdrantPersistenceManager', () => {
  it('stores agents in the Qdrant persistence namespace', async () => {
    const fakeStore = {
      initialize: jest.fn(),
      store: jest.fn(),
      retrieve: jest.fn(),
      listAll: jest.fn(),
      list: jest.fn(),
      close: jest.fn(),
    };

    const manager = new QdrantPersistenceManager({ store: fakeStore as any });
    await manager.saveAgent({
      id: 'agent-1',
      type: 'assistant',
      name: 'Alpha',
      status: 'active',
      capabilities: [],
      systemPrompt: '',
      maxConcurrentTasks: 1,
      priority: 1,
      createdAt: Date.now(),
    });

    expect(fakeStore.initialize).toHaveBeenCalled();
    expect(fakeStore.store).toHaveBeenCalledWith(
      'agent-1',
      expect.objectContaining({ id: 'agent-1' }),
      { namespace: 'persistence:agents' },
    );
  });

  it('filters active and idle agents', async () => {
    const fakeStore = {
      initialize: jest.fn(),
      store: jest.fn(),
      retrieve: jest.fn(),
      listAll: jest.fn().mockResolvedValue([
        { value: { id: 'a1', status: 'active' } },
        { value: { id: 'a2', status: 'idle' } },
        { value: { id: 'a3', status: 'disabled' } },
      ]),
      list: jest.fn(),
      close: jest.fn(),
    };

    const manager = new QdrantPersistenceManager({ store: fakeStore as any });
    const active = await manager.getActiveAgents();

    expect(active.map((agent) => agent.id)).toEqual(['a1', 'a2']);
  });

  it('updates task status and completion timestamp', async () => {
    const task = {
      id: 'task-1',
      type: 'build',
      description: 'ship',
      status: 'pending',
      priority: 1,
      dependencies: [],
      metadata: {},
      progress: 0,
      createdAt: Date.now(),
    };

    const fakeStore = {
      initialize: jest.fn(),
      store: jest.fn(),
      retrieve: jest.fn().mockResolvedValue(task),
      listAll: jest.fn(),
      list: jest.fn(),
      close: jest.fn(),
    };

    const manager = new QdrantPersistenceManager({ store: fakeStore as any });
    await manager.updateTaskStatus('task-1', 'completed', 'agent-9');

    const storedTask = (fakeStore.store as jest.Mock).mock.calls[0][1];
    expect(storedTask.status).toBe('completed');
    expect(storedTask.assignedAgent).toBe('agent-9');
    expect(typeof storedTask.completedAt).toBe('number');
  });

  it('computes stats from Qdrant entries', async () => {
    const fakeStore = {
      initialize: jest.fn(),
      store: jest.fn(),
      retrieve: jest.fn(),
      listAll: jest.fn()
        .mockResolvedValueOnce([
          { value: { id: 'a1', status: 'active' } },
          { value: { id: 'a2', status: 'idle' } },
          { value: { id: 'a3', status: 'disabled' } },
        ])
        .mockResolvedValueOnce([
          { value: { id: 't1', status: 'pending' } },
          { value: { id: 't2', status: 'completed' } },
        ]),
      list: jest.fn(),
      close: jest.fn(),
    };

    const manager = new QdrantPersistenceManager({ store: fakeStore as any });
    const stats = await manager.getStats();

    expect(stats.totalAgents).toBe(3);
    expect(stats.activeAgents).toBe(2);
    expect(stats.totalTasks).toBe(2);
    expect(stats.pendingTasks).toBe(1);
    expect(stats.completedTasks).toBe(1);
  });
});
