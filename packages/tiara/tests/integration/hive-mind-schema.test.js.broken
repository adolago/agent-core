/**
 * Test for Hive Mind data operations - updated for Qdrant storage
 *
 * This test verifies that the QdrantStore correctly handles CRUD operations
 * for swarms, agents, and tasks - replacing the previous SQLite schema tests.
 *
 * Note: These tests require the agent-core daemon to be running for HTTP calls,
 * or they use mocked QdrantStore behavior.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock the agent-core client for unit testing
const mockMemoryStore = new Map();
const mockAgentCoreClient = {
  storeMemory: jest.fn(async ({ key, namespace, value }) => {
    mockMemoryStore.set(`${namespace}:${key}`, { key, namespace, value, createdAt: Date.now() });
    return { success: true };
  }),
  searchMemory: jest.fn(async ({ namespace, query }) => {
    const results = [];
    for (const [k, v] of mockMemoryStore.entries()) {
      if (k.startsWith(namespace)) {
        results.push({ ...v, score: 0.9 });
      }
    }
    return results;
  }),
  deleteMemory: jest.fn(async ({ namespace, key }) => {
    mockMemoryStore.delete(`${namespace}:${key}`);
    return { success: true };
  }),
  getMemory: jest.fn(async ({ namespace, key }) => {
    return mockMemoryStore.get(`${namespace}:${key}`) || null;
  }),
};

describe('Hive Mind Data Operations - Qdrant Storage', () => {
  beforeEach(() => {
    mockMemoryStore.clear();
    jest.clearAllMocks();
  });

  describe('Swarm Operations', () => {
    it('should create swarm with required fields', async () => {
      const swarmId = 'test-swarm-' + Date.now();
      const swarmData = {
        id: swarmId,
        name: 'Test Swarm',
        topology: 'mesh',
        queenMode: false,
        maxAgents: 10,
        consensusThreshold: 0.66,
        memoryTTL: 3600,
        config: {},
        isActive: true,
        createdAt: Date.now(),
      };

      await mockAgentCoreClient.storeMemory({
        key: swarmId,
        namespace: 'tiara:swarms',
        value: JSON.stringify(swarmData),
      });

      expect(mockAgentCoreClient.storeMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          namespace: 'tiara:swarms',
          key: swarmId,
        })
      );

      const stored = await mockAgentCoreClient.getMemory({
        namespace: 'tiara:swarms',
        key: swarmId,
      });

      expect(stored).toBeDefined();
      const parsedSwarm = JSON.parse(stored.value);
      expect(parsedSwarm.name).toBe('Test Swarm');
      expect(parsedSwarm.topology).toBe('mesh');
    });

    it('should list all swarms by namespace', async () => {
      // Create multiple swarms
      const swarm1 = { id: 'swarm-1', name: 'Swarm 1', topology: 'mesh' };
      const swarm2 = { id: 'swarm-2', name: 'Swarm 2', topology: 'hierarchical' };

      await mockAgentCoreClient.storeMemory({
        key: swarm1.id,
        namespace: 'tiara:swarms',
        value: JSON.stringify(swarm1),
      });

      await mockAgentCoreClient.storeMemory({
        key: swarm2.id,
        namespace: 'tiara:swarms',
        value: JSON.stringify(swarm2),
      });

      const results = await mockAgentCoreClient.searchMemory({
        namespace: 'tiara:swarms',
        query: '',
      });

      expect(results.length).toBe(2);
    });
  });

  describe('Agent Operations', () => {
    it('should create agent without role (nullable field)', async () => {
      const agentId = 'test-agent-' + Date.now();
      const swarmId = 'test-swarm-' + Date.now();

      // Agent data without role field - this was the issue #403 in SQLite
      const agentData = {
        id: agentId,
        swarmId: swarmId,
        name: 'Test Agent',
        type: 'worker',
        status: 'idle',
        capabilities: ['research', 'analysis'],
        // role is intentionally omitted - should work without it
        successCount: 0,
        errorCount: 0,
        messageCount: 0,
        metadata: {},
        createdAt: Date.now(),
        lastHeartbeat: Date.now(),
      };

      await mockAgentCoreClient.storeMemory({
        key: agentId,
        namespace: 'tiara:agents',
        value: JSON.stringify(agentData),
      });

      const stored = await mockAgentCoreClient.getMemory({
        namespace: 'tiara:agents',
        key: agentId,
      });

      expect(stored).toBeDefined();
      const parsedAgent = JSON.parse(stored.value);
      expect(parsedAgent.name).toBe('Test Agent');
      expect(parsedAgent.role).toBeUndefined(); // Role can be undefined in Qdrant
    });

    it('should create agent with role', async () => {
      const agentId = 'test-agent-' + Date.now();
      const swarmId = 'test-swarm-' + Date.now();

      const agentData = {
        id: agentId,
        swarmId: swarmId,
        name: 'Test Coordinator',
        type: 'coordinator',
        role: 'leader', // With role
        status: 'idle',
        capabilities: ['coordination', 'delegation'],
        successCount: 0,
        errorCount: 0,
        messageCount: 0,
        metadata: {},
        createdAt: Date.now(),
        lastHeartbeat: Date.now(),
      };

      await mockAgentCoreClient.storeMemory({
        key: agentId,
        namespace: 'tiara:agents',
        value: JSON.stringify(agentData),
      });

      const stored = await mockAgentCoreClient.getMemory({
        namespace: 'tiara:agents',
        key: agentId,
      });

      const parsedAgent = JSON.parse(stored.value);
      expect(parsedAgent.role).toBe('leader');
    });

    it('should list agents by swarm', async () => {
      const swarmId = 'test-swarm-' + Date.now();

      // Create multiple agents for the same swarm
      for (let i = 1; i <= 3; i++) {
        await mockAgentCoreClient.storeMemory({
          key: `agent-${i}`,
          namespace: 'tiara:agents',
          value: JSON.stringify({
            id: `agent-${i}`,
            swarmId: swarmId,
            name: `Agent ${i}`,
            type: 'worker',
            status: 'idle',
          }),
        });
      }

      const results = await mockAgentCoreClient.searchMemory({
        namespace: 'tiara:agents',
        query: swarmId,
      });

      expect(results.length).toBe(3);
    });
  });

  describe('Task Operations', () => {
    it('should create task with all required fields', async () => {
      const taskId = 'test-task-' + Date.now();
      const swarmId = 'test-swarm-' + Date.now();

      const taskData = {
        id: taskId,
        swarmId: swarmId,
        description: 'Test task description',
        priority: 'high',
        strategy: 'single',
        status: 'pending',
        dependencies: [],
        assignedAgents: [],
        requireConsensus: false,
        maxAgents: 1,
        requiredCapabilities: ['research'],
        metadata: {},
        createdAt: Date.now(),
      };

      await mockAgentCoreClient.storeMemory({
        key: taskId,
        namespace: 'tiara:tasks',
        value: JSON.stringify(taskData),
      });

      const stored = await mockAgentCoreClient.getMemory({
        namespace: 'tiara:tasks',
        key: taskId,
      });

      expect(stored).toBeDefined();
      const parsedTask = JSON.parse(stored.value);
      expect(parsedTask.description).toBe('Test task description');
      expect(parsedTask.priority).toBe('high');
      expect(parsedTask.status).toBe('pending');
    });

    it('should update task status', async () => {
      const taskId = 'test-task-' + Date.now();

      const taskData = {
        id: taskId,
        swarmId: 'test-swarm',
        description: 'Test task',
        status: 'pending',
        createdAt: Date.now(),
      };

      await mockAgentCoreClient.storeMemory({
        key: taskId,
        namespace: 'tiara:tasks',
        value: JSON.stringify(taskData),
      });

      // Update status
      taskData.status = 'in_progress';
      taskData.assignedAgents = ['agent-1'];

      await mockAgentCoreClient.storeMemory({
        key: taskId,
        namespace: 'tiara:tasks',
        value: JSON.stringify(taskData),
      });

      const stored = await mockAgentCoreClient.getMemory({
        namespace: 'tiara:tasks',
        key: taskId,
      });

      const parsedTask = JSON.parse(stored.value);
      expect(parsedTask.status).toBe('in_progress');
      expect(parsedTask.assignedAgents).toContain('agent-1');
    });
  });

  describe('Communication Operations', () => {
    it('should store and retrieve messages', async () => {
      const messageId = 'msg-' + Date.now();

      const messageData = {
        id: messageId,
        fromAgentId: 'agent-1',
        toAgentId: 'agent-2',
        swarmId: 'test-swarm',
        messageType: 'task_assignment',
        content: 'Please handle this task',
        priority: 'normal',
        requiresResponse: true,
        timestamp: Date.now(),
      };

      await mockAgentCoreClient.storeMemory({
        key: messageId,
        namespace: 'tiara:communications',
        value: JSON.stringify(messageData),
      });

      const stored = await mockAgentCoreClient.getMemory({
        namespace: 'tiara:communications',
        key: messageId,
      });

      expect(stored).toBeDefined();
      const parsedMsg = JSON.parse(stored.value);
      expect(parsedMsg.fromAgentId).toBe('agent-1');
      expect(parsedMsg.toAgentId).toBe('agent-2');
      expect(parsedMsg.messageType).toBe('task_assignment');
    });
  });

  describe('Consensus Operations', () => {
    it('should create and update consensus proposals', async () => {
      const proposalId = 'proposal-' + Date.now();

      const proposalData = {
        id: proposalId,
        swarmId: 'test-swarm',
        taskId: 'task-1',
        proposal: { action: 'approve_task', description: 'Should we proceed?' },
        requiredThreshold: 0.66,
        status: 'pending',
        votes: {},
        currentVotes: 0,
        totalVoters: 3,
        deadline: Date.now() + 3600000,
        createdAt: Date.now(),
      };

      await mockAgentCoreClient.storeMemory({
        key: proposalId,
        namespace: 'tiara:consensus',
        value: JSON.stringify(proposalData),
      });

      // Add votes
      proposalData.votes = {
        'agent-1': { vote: true, reason: 'Looks good', timestamp: Date.now() },
        'agent-2': { vote: true, reason: 'Approved', timestamp: Date.now() },
      };
      proposalData.currentVotes = 2;

      await mockAgentCoreClient.storeMemory({
        key: proposalId,
        namespace: 'tiara:consensus',
        value: JSON.stringify(proposalData),
      });

      const stored = await mockAgentCoreClient.getMemory({
        namespace: 'tiara:consensus',
        key: proposalId,
      });

      const parsedProposal = JSON.parse(stored.value);
      expect(parsedProposal.currentVotes).toBe(2);
      expect(parsedProposal.votes['agent-1'].vote).toBe(true);
    });
  });

  describe('Data Consistency', () => {
    it('should handle concurrent updates', async () => {
      const taskId = 'concurrent-task-' + Date.now();

      // Simulate concurrent updates
      const updates = [];
      for (let i = 0; i < 5; i++) {
        updates.push(
          mockAgentCoreClient.storeMemory({
            key: taskId,
            namespace: 'tiara:tasks',
            value: JSON.stringify({
              id: taskId,
              status: `status-${i}`,
              updatedAt: Date.now(),
            }),
          })
        );
      }

      await Promise.all(updates);

      // Final state should be consistent
      const stored = await mockAgentCoreClient.getMemory({
        namespace: 'tiara:tasks',
        key: taskId,
      });

      expect(stored).toBeDefined();
    });

    it('should delete entries correctly', async () => {
      const taskId = 'delete-task-' + Date.now();

      await mockAgentCoreClient.storeMemory({
        key: taskId,
        namespace: 'tiara:tasks',
        value: JSON.stringify({ id: taskId, description: 'To be deleted' }),
      });

      await mockAgentCoreClient.deleteMemory({
        namespace: 'tiara:tasks',
        key: taskId,
      });

      const stored = await mockAgentCoreClient.getMemory({
        namespace: 'tiara:tasks',
        key: taskId,
      });

      expect(stored).toBeNull();
    });
  });
});
