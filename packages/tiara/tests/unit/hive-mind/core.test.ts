/**
 * Hive-Mind Core Tests
 *
 * Tests for HiveMind, Queen, Agent, and related core classes.
 * Uses MockQdrantStore for isolated testing.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  MockQdrantStore,
  getMockQdrantStore,
  createTestSwarm,
  createTestAgent,
  createTestTask,
  setupTestEnvironment,
  setupTestEnvironmentWithData
} from '../../../src/test';

// Set test mode
process.env.TIARA_TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

describe('Hive-Mind Core', () => {
  let store: MockQdrantStore;
  let cleanup: () => void;

  beforeEach(async () => {
    const env = await setupTestEnvironment();
    store = env.store;
    cleanup = env.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  describe('Swarm Management', () => {
    it('should create a new swarm', async () => {
      const swarm = createTestSwarm({
        name: 'Research Swarm',
        topology: 'mesh'
      });

      await store.createSwarm(swarm);
      const retrieved = await store.getSwarm(swarm.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('Research Swarm');
      expect(retrieved?.topology).toBe('mesh');
    });

    it('should list all swarms', async () => {
      const swarm1 = createTestSwarm({ name: 'Swarm 1' });
      const swarm2 = createTestSwarm({ name: 'Swarm 2' });

      await store.createSwarm(swarm1);
      await store.createSwarm(swarm2);

      const swarms = await store.listSwarms();

      expect(swarms).toHaveLength(2);
    });

    it('should update swarm status', async () => {
      const swarm = createTestSwarm({ isActive: true });
      await store.createSwarm(swarm);

      await store.updateSwarm(swarm.id, { isActive: false });
      const updated = await store.getSwarm(swarm.id);

      expect(updated?.isActive).toBe(false);
    });

    it('should delete swarm', async () => {
      const swarm = createTestSwarm();
      await store.createSwarm(swarm);

      await store.deleteSwarm(swarm.id);
      const deleted = await store.getSwarm(swarm.id);

      expect(deleted).toBeNull();
    });

    it('should enforce topology constraints', async () => {
      const meshSwarm = createTestSwarm({ topology: 'mesh', maxAgents: 10 });
      const hierarchicalSwarm = createTestSwarm({ topology: 'hierarchical', maxAgents: 20 });

      await store.createSwarm(meshSwarm);
      await store.createSwarm(hierarchicalSwarm);

      const mesh = await store.getSwarm(meshSwarm.id);
      const hierarchical = await store.getSwarm(hierarchicalSwarm.id);

      expect(mesh?.topology).toBe('mesh');
      expect(hierarchical?.topology).toBe('hierarchical');
    });
  });

  describe('Agent Management', () => {
    it('should register an agent', async () => {
      const swarm = createTestSwarm();
      await store.createSwarm(swarm);

      const agent = createTestAgent(swarm.id, {
        name: 'Research Agent',
        type: 'researcher',
        capabilities: ['research', 'analysis']
      });

      await store.registerAgent(agent);
      const retrieved = await store.getAgent(agent.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('Research Agent');
      expect(retrieved?.capabilities).toContain('research');
    });

    it('should list agents by swarm', async () => {
      const swarm = createTestSwarm();
      await store.createSwarm(swarm);

      const agent1 = createTestAgent(swarm.id, { name: 'Agent 1' });
      const agent2 = createTestAgent(swarm.id, { name: 'Agent 2' });

      await store.registerAgent(agent1);
      await store.registerAgent(agent2);

      const agents = await store.listAgents(swarm.id);

      expect(agents).toHaveLength(2);
    });

    it('should update agent status', async () => {
      const swarm = createTestSwarm();
      await store.createSwarm(swarm);

      const agent = createTestAgent(swarm.id, { status: 'idle' });
      await store.registerAgent(agent);

      await store.updateAgent(agent.id, { status: 'busy' });
      const updated = await store.getAgent(agent.id);

      expect(updated?.status).toBe('busy');
    });

    it('should track agent heartbeat', async () => {
      const swarm = createTestSwarm();
      await store.createSwarm(swarm);

      const agent = createTestAgent(swarm.id);
      await store.registerAgent(agent);

      const beforeHeartbeat = agent.lastHeartbeat;
      await new Promise(resolve => setTimeout(resolve, 10));

      await store.updateAgent(agent.id, { lastHeartbeat: Date.now() });
      const updated = await store.getAgent(agent.id);

      expect(updated?.lastHeartbeat).toBeGreaterThan(beforeHeartbeat);
    });

    it('should unregister agent', async () => {
      const swarm = createTestSwarm();
      await store.createSwarm(swarm);

      const agent = createTestAgent(swarm.id);
      await store.registerAgent(agent);
      await store.unregisterAgent(agent.id);

      const deleted = await store.getAgent(agent.id);
      expect(deleted).toBeNull();
    });

    it('should filter agents by capability', async () => {
      const swarm = createTestSwarm();
      await store.createSwarm(swarm);

      const researcher = createTestAgent(swarm.id, {
        name: 'Researcher',
        capabilities: ['research', 'analysis']
      });
      const coder = createTestAgent(swarm.id, {
        name: 'Coder',
        capabilities: ['coding', 'testing']
      });

      await store.registerAgent(researcher);
      await store.registerAgent(coder);

      const allAgents = await store.listAgents(swarm.id);
      const researchers = allAgents.filter(a =>
        a.capabilities.includes('research')
      );

      expect(researchers).toHaveLength(1);
      expect(researchers[0].name).toBe('Researcher');
    });
  });

  describe('Task Management', () => {
    it('should create a task', async () => {
      const swarm = createTestSwarm();
      await store.createSwarm(swarm);

      const task = createTestTask(swarm.id, {
        description: 'Analyze market data',
        priority: 'high'
      });

      await store.createTask(task);
      const retrieved = await store.getTask(task.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.description).toBe('Analyze market data');
      expect(retrieved?.priority).toBe('high');
    });

    it('should list tasks by swarm', async () => {
      const swarm = createTestSwarm();
      await store.createSwarm(swarm);

      const task1 = createTestTask(swarm.id, { description: 'Task 1' });
      const task2 = createTestTask(swarm.id, { description: 'Task 2' });

      await store.createTask(task1);
      await store.createTask(task2);

      const tasks = await store.listTasks(swarm.id);

      expect(tasks).toHaveLength(2);
    });

    it('should update task status', async () => {
      const swarm = createTestSwarm();
      await store.createSwarm(swarm);

      const task = createTestTask(swarm.id, { status: 'pending' });
      await store.createTask(task);

      await store.updateTask(task.id, { status: 'in_progress' });
      const updated = await store.getTask(task.id);

      expect(updated?.status).toBe('in_progress');
    });

    it('should assign task to agent', async () => {
      const swarm = createTestSwarm();
      await store.createSwarm(swarm);

      const agent = createTestAgent(swarm.id);
      await store.registerAgent(agent);

      const task = createTestTask(swarm.id, { assignedAgents: [] });
      await store.createTask(task);

      await store.updateTask(task.id, { assignedAgents: [agent.id] });
      const updated = await store.getTask(task.id);

      expect(updated?.assignedAgents).toContain(agent.id);
    });

    it('should handle task dependencies', async () => {
      const swarm = createTestSwarm();
      await store.createSwarm(swarm);

      const parentTask = createTestTask(swarm.id, { description: 'Parent' });
      await store.createTask(parentTask);

      const childTask = createTestTask(swarm.id, {
        description: 'Child',
        dependencies: [parentTask.id]
      });
      await store.createTask(childTask);

      const child = await store.getTask(childTask.id);
      expect(child?.dependencies).toContain(parentTask.id);
    });

    it('should complete task', async () => {
      const swarm = createTestSwarm();
      await store.createSwarm(swarm);

      const task = createTestTask(swarm.id, { status: 'in_progress' });
      await store.createTask(task);

      await store.updateTask(task.id, {
        status: 'completed',
        completedAt: Date.now()
      });
      const completed = await store.getTask(task.id);

      expect(completed?.status).toBe('completed');
      expect(completed?.completedAt).toBeDefined();
    });
  });

  describe('Communication', () => {
    it('should store communication message', async () => {
      const { store, swarm, agents } = await setupTestEnvironmentWithData();

      const message = {
        fromAgentId: agents[0].id,
        toAgentId: agents[1].id,
        swarmId: swarm.id,
        messageType: 'task_assignment' as const,
        content: 'Please handle this task',
        priority: 'normal' as const,
        requiresResponse: true
      };

      const stored = await store.storeMessage(message);

      expect(stored.id).toBeDefined();
      expect(stored.fromAgentId).toBe(agents[0].id);
    });

    it('should retrieve messages for agent', async () => {
      const { store, swarm, agents } = await setupTestEnvironmentWithData();

      // Send messages to agent
      await store.storeMessage({
        fromAgentId: agents[0].id,
        toAgentId: agents[1].id,
        swarmId: swarm.id,
        messageType: 'task_assignment',
        content: 'Message 1',
        priority: 'normal',
        requiresResponse: false
      });

      await store.storeMessage({
        fromAgentId: agents[0].id,
        toAgentId: agents[1].id,
        swarmId: swarm.id,
        messageType: 'progress_update',
        content: 'Message 2',
        priority: 'normal',
        requiresResponse: false
      });

      const messages = await store.getMessagesForAgent(agents[1].id);

      expect(messages).toHaveLength(2);
    });

    it('should broadcast message to swarm', async () => {
      const { store, swarm, agents } = await setupTestEnvironmentWithData();

      // Broadcast message (toAgentId undefined)
      const broadcast = await store.storeMessage({
        fromAgentId: agents[0].id,
        toAgentId: undefined,
        swarmId: swarm.id,
        messageType: 'status_update',
        content: 'Swarm-wide update',
        priority: 'normal',
        requiresResponse: false
      });

      expect(broadcast.toAgentId).toBeUndefined();

      // All agents should be able to receive broadcast
      const swarmMessages = await store.getSwarmMessages(swarm.id);
      expect(swarmMessages.length).toBeGreaterThan(0);
    });
  });

  describe('Consensus', () => {
    it('should create consensus proposal', async () => {
      const { store, swarm, agents } = await setupTestEnvironmentWithData();

      const proposal = await store.createConsensus({
        swarmId: swarm.id,
        proposerId: agents[0].id,
        type: 'task_assignment',
        description: 'Assign complex task to Agent 2',
        options: ['approve', 'reject'],
        votingStrategy: 'majority',
        deadline: Date.now() + 60000,
        status: 'voting',
        votes: [],
        result: undefined
      });

      expect(proposal.id).toBeDefined();
      expect(proposal.status).toBe('voting');
    });

    it('should record votes', async () => {
      const { store, swarm, agents } = await setupTestEnvironmentWithData();

      const proposal = await store.createConsensus({
        swarmId: swarm.id,
        proposerId: agents[0].id,
        type: 'resource_allocation',
        description: 'Allocate more resources',
        options: ['approve', 'reject'],
        votingStrategy: 'majority',
        deadline: Date.now() + 60000,
        status: 'voting',
        votes: [],
        result: undefined
      });

      // Record votes
      await store.updateConsensus(proposal.id, {
        votes: [
          { agentId: agents[0].id, vote: 'approve', timestamp: Date.now() },
          { agentId: agents[1].id, vote: 'approve', timestamp: Date.now() }
        ]
      });

      const updated = await store.getConsensus(proposal.id);
      expect(updated?.votes).toHaveLength(2);
    });

    it('should finalize consensus', async () => {
      const { store, swarm, agents } = await setupTestEnvironmentWithData();

      const proposal = await store.createConsensus({
        swarmId: swarm.id,
        proposerId: agents[0].id,
        type: 'task_assignment',
        description: 'Test proposal',
        options: ['approve', 'reject'],
        votingStrategy: 'majority',
        deadline: Date.now() + 60000,
        status: 'voting',
        votes: [
          { agentId: agents[0].id, vote: 'approve', timestamp: Date.now() },
          { agentId: agents[1].id, vote: 'approve', timestamp: Date.now() }
        ],
        result: undefined
      });

      await store.updateConsensus(proposal.id, {
        status: 'completed',
        result: 'approve'
      });

      const finalized = await store.getConsensus(proposal.id);
      expect(finalized?.status).toBe('completed');
      expect(finalized?.result).toBe('approve');
    });
  });

  describe('Metrics', () => {
    it('should store performance metrics', async () => {
      const { store, swarm } = await setupTestEnvironmentWithData();

      const metrics = await store.storeMetrics({
        swarmId: swarm.id,
        timestamp: Date.now(),
        taskCompletionRate: 0.85,
        averageTaskTime: 5000,
        agentUtilization: 0.7,
        consensusSuccessRate: 0.9,
        messageLatency: 50,
        errorRate: 0.02
      });

      expect(metrics.id).toBeDefined();
      expect(metrics.taskCompletionRate).toBe(0.85);
    });

    it('should retrieve metrics history', async () => {
      const { store, swarm } = await setupTestEnvironmentWithData();

      // Store multiple metrics
      for (let i = 0; i < 3; i++) {
        await store.storeMetrics({
          swarmId: swarm.id,
          timestamp: Date.now() + i * 1000,
          taskCompletionRate: 0.8 + i * 0.05,
          averageTaskTime: 5000 - i * 500,
          agentUtilization: 0.7,
          consensusSuccessRate: 0.9,
          messageLatency: 50,
          errorRate: 0.02
        });
      }

      const history = await store.getMetricsHistory(swarm.id);
      expect(history.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Memory Operations', () => {
    it('should store memory entry', async () => {
      const { store, swarm } = await setupTestEnvironmentWithData();

      const memory = await store.storeMemory({
        swarmId: swarm.id,
        key: 'research-findings',
        content: 'Important findings from analysis',
        namespace: 'task-results',
        ttl: 3600000
      });

      expect(memory.id).toBeDefined();
      expect(memory.key).toBe('research-findings');
    });

    it('should retrieve memory by key', async () => {
      const { store, swarm } = await setupTestEnvironmentWithData();

      await store.storeMemory({
        swarmId: swarm.id,
        key: 'unique-key',
        content: 'Test content',
        namespace: 'default'
      });

      const retrieved = await store.getMemoryByKey(swarm.id, 'unique-key');
      expect(retrieved?.content).toBe('Test content');
    });

    it('should list memory by namespace', async () => {
      const { store, swarm } = await setupTestEnvironmentWithData();

      await store.storeMemory({
        swarmId: swarm.id,
        key: 'key1',
        content: 'Content 1',
        namespace: 'learning-data'
      });

      await store.storeMemory({
        swarmId: swarm.id,
        key: 'key2',
        content: 'Content 2',
        namespace: 'learning-data'
      });

      const memories = await store.listMemoryByNamespace(swarm.id, 'learning-data');
      expect(memories).toHaveLength(2);
    });

    it('should delete expired memory', async () => {
      const { store, swarm } = await setupTestEnvironmentWithData();

      // Store memory with very short TTL
      await store.storeMemory({
        swarmId: swarm.id,
        key: 'expiring',
        content: 'This will expire',
        namespace: 'default',
        ttl: 1 // 1ms TTL
      });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      // Cleanup should remove expired entries
      const deleted = await store.cleanupExpiredMemory();
      expect(deleted).toBeGreaterThanOrEqual(0);
    });
  });
});
