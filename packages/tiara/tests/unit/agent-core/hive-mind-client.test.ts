/**
 * Hive-Mind AgentCoreClient Tests
 *
 * Tests for the agent-core client integration used by hive-mind.
 * Covers process registry, memory operations, and Tiara-specific helpers.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Set test mode
process.env.TIARA_TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

// Mock fetch
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('Hive-Mind AgentCoreClient', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('Process Registry', () => {
    it('should register a process', async () => {
      const processInfo = {
        id: 'agent-001',
        type: 'agent',
        name: 'Research Agent',
        capabilities: ['research', 'analysis'],
        status: 'active'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => processInfo
      } as Response);

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const result = await client.registerProcess({
        type: 'agent',
        name: 'Research Agent',
        capabilities: ['research', 'analysis']
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/process/register'),
        expect.objectContaining({
          method: 'POST'
        })
      );
      expect(result.id).toBeDefined();
    });

    it('should get process by ID', async () => {
      const processInfo = {
        id: 'agent-001',
        type: 'agent',
        name: 'Test Agent',
        status: 'active'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => processInfo
      } as Response);

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const result = await client.getProcess('agent-001');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/process/agent-001'),
        expect.any(Object)
      );
      expect(result?.id).toBe('agent-001');
    });

    it('should list processes with filter', async () => {
      const processes = [
        { id: 'agent-001', type: 'agent', status: 'active' },
        { id: 'agent-002', type: 'agent', status: 'busy' }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => processes
      } as Response);

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const result = await client.listProcesses({ type: 'agent' });

      expect(result).toHaveLength(2);
    });

    it('should find available agents by capabilities', async () => {
      const agents = [
        { id: 'agent-001', capabilities: ['research', 'coding'], status: 'idle' }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => agents
      } as Response);

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const result = await client.findAvailableAgents(['research']);

      expect(result).toHaveLength(1);
      expect(result[0].capabilities).toContain('research');
    });

    it('should update process status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'agent-001', status: 'busy' })
      } as Response);

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const result = await client.updateProcess('agent-001', { status: 'busy' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/process/agent-001'),
        expect.objectContaining({
          method: 'PATCH'
        })
      );
    });

    it('should deregister process', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      } as Response);

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const result = await client.deregisterProcess('agent-001');

      expect(result).toBe(true);
    });

    it('should get process statistics', async () => {
      const stats = {
        total: 10,
        byType: { agent: 8, swarm: 2 },
        byStatus: { active: 6, idle: 3, offline: 1 }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => stats
      } as Response);

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const result = await client.getProcessStats();

      expect(result.total).toBe(10);
    });
  });

  describe('Memory Operations', () => {
    it('should store memory entry', async () => {
      const entry = {
        id: 'mem-001',
        namespace: 'default',
        content: 'Test memory',
        category: 'fact'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => entry
      } as Response);

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const result = await client.storeMemory({
        namespace: 'default',
        content: 'Test memory',
        category: 'fact'
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/memory/store'),
        expect.objectContaining({
          method: 'POST'
        })
      );
      expect(result.id).toBeDefined();
    });

    it('should batch store memory entries', async () => {
      const entries = [
        { id: 'mem-001', content: 'Entry 1' },
        { id: 'mem-002', content: 'Entry 2' }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => entries
      } as Response);

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const result = await client.storeMemoryBatch([
        { namespace: 'default', content: 'Entry 1' },
        { namespace: 'default', content: 'Entry 2' }
      ]);

      expect(result).toHaveLength(2);
    });

    it('should search memory with query', async () => {
      const results = [
        { id: 'mem-001', content: 'Matching entry', score: 0.95 }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => results
      } as Response);

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const result = await client.searchMemory({
        query: 'test query',
        namespace: 'default',
        limit: 10
      });

      expect(result).toHaveLength(1);
      expect(result[0].score).toBeGreaterThan(0.9);
    });

    it('should get memory by ID', async () => {
      const entry = { id: 'mem-001', content: 'Test entry' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => entry
      } as Response);

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const result = await client.getMemory('mem-001');

      expect(result?.id).toBe('mem-001');
    });

    it('should delete memory entry', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      } as Response);

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const result = await client.deleteMemory('mem-001');

      expect(result).toBe(true);
    });

    it('should get memory statistics', async () => {
      const stats = {
        totalEntries: 100,
        byNamespace: { default: 50, 'tiara:decisions': 30 },
        byCategory: { fact: 40, decision: 30 }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => stats
      } as Response);

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const result = await client.getMemoryStats();

      expect(result.totalEntries).toBe(100);
    });
  });

  describe('Tiara-Specific Helpers', () => {
    it('should store learning pattern', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'pattern-001',
          namespace: 'tiara:learning',
          content: 'Pattern description'
        })
      } as Response);

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const result = await client.storeLearningPattern(
        'Parallel execution improves throughput',
        { successRate: 0.95, avgTime: 1200 },
        0.9
      );

      expect(result.namespace).toBe('tiara:learning');
    });

    it('should store decision', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'decision-001',
          namespace: 'tiara:decisions'
        })
      } as Response);

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const result = await client.storeDecision({
        type: 'task_assignment',
        context: 'Complex research task',
        options: ['agent-001', 'agent-002'],
        chosen: 'agent-001',
        rationale: 'Better research capabilities',
        outcome: 'pending'
      });

      expect(result.namespace).toBe('tiara:decisions');
    });

    it('should search similar decisions', async () => {
      const results = [
        { id: 'decision-001', score: 0.92 }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => results
      } as Response);

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const result = await client.searchSimilarDecisions('task assignment for research');

      expect(result).toHaveLength(1);
    });

    it('should store agent state', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'state-001',
          namespace: 'tiara:agent-state'
        })
      } as Response);

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const result = await client.storeAgentState('agent-001', {
        context: 'Working on research',
        currentTask: 'task-001',
        learnings: ['Pattern A is effective']
      });

      expect(result.namespace).toBe('tiara:agent-state');
    });

    it('should get agent state', async () => {
      const states = [
        { id: 'state-001', metadata: { agentId: 'agent-001' } }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => states
      } as Response);

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const result = await client.getAgentState('agent-001');

      expect(result).toHaveLength(1);
    });

    it('should store swarm history event', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'history-001',
          namespace: 'tiara:swarm-history'
        })
      } as Response);

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const result = await client.storeSwarmHistory('swarm-001', {
        type: 'task_completed',
        details: { taskId: 'task-001', duration: 5000 }
      });

      expect(result.namespace).toBe('tiara:swarm-history');
    });
  });

  describe('Heartbeat Management', () => {
    it('should start heartbeat for process', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      } as Response);

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      // Start heartbeat with short interval for testing
      client.startHeartbeat('agent-001', 100);

      // Wait for at least one heartbeat
      await new Promise(resolve => setTimeout(resolve, 150));

      // Stop heartbeat
      client.stopHeartbeat('agent-001');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/process/agent-001/heartbeat'),
        expect.any(Object)
      );
    });

    it('should stop all heartbeats', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      } as Response);

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      client.startHeartbeat('agent-001', 1000);
      client.startHeartbeat('agent-002', 1000);

      client.stopAllHeartbeats();

      // Verify no more heartbeats are sent
      mockFetch.mockClear();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not have called any more endpoints
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      // Network errors are re-thrown by the implementation
      await expect(client.getProcess('agent-001')).rejects.toThrow('Network error');
    });

    it('should handle 404 responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Not Found' })
      } as Response);

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      // 404 responses return null per getProcess implementation
      const result = await client.getProcess('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle malformed JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); }
      } as Response);

      const { AgentCoreClient } = await import('../../../src/hive-mind/integration/AgentCoreClient');
      const client = new AgentCoreClient({ baseUrl: 'http://localhost:3210' });

      await expect(client.getProcess('agent-001')).rejects.toThrow();
    });
  });
});
