/**
 * QdrantStore Tests
 *
 * Tests for the Qdrant-based persistence layer.
 * Uses MockQdrantStore in test mode.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// Set test mode
process.env.TIARA_TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

describe('QdrantStore', () => {
  describe('Swarm Operations', () => {
    it('should create a swarm', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const swarm = await store.createSwarm({
        name: 'Test Swarm',
        topology: 'mesh',
        queenMode: true,
        maxAgents: 10,
        consensusThreshold: 0.7,
        memoryTTL: 3600,
        config: { setting: 'value' },
      });

      expect(swarm.id).toBeDefined();
      expect(swarm.name).toBe('Test Swarm');
      expect(swarm.topology).toBe('mesh');
      expect(swarm.isActive).toBe(false);
    });

    it('should get swarm by ID', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const created = await store.createSwarm({
        name: 'Retrievable Swarm',
        topology: 'hierarchical',
        queenMode: false,
        maxAgents: 5,
        consensusThreshold: 0.6,
        memoryTTL: 1800,
        config: {},
      });

      const retrieved = await store.getSwarm(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe('Retrievable Swarm');
    });

    it('should list all swarms with agent counts', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const swarm = await store.createSwarm({
        name: 'Swarm 1',
        topology: 'mesh',
        queenMode: true,
        maxAgents: 10,
        consensusThreshold: 0.7,
        memoryTTL: 3600,
        config: {},
      });

      // Add some agents to the swarm
      await store.createAgent({
        swarmId: swarm.id,
        name: 'Agent 1',
        type: 'researcher',
        status: 'idle',
        capabilities: ['research'],
        metadata: {},
      });

      await store.createAgent({
        swarmId: swarm.id,
        name: 'Agent 2',
        type: 'coder',
        status: 'idle',
        capabilities: ['coding'],
        metadata: {},
      });

      const swarms = await store.getAllSwarms();

      expect(swarms.length).toBeGreaterThan(0);
      const found = swarms.find(s => s.id === swarm.id);
      expect(found).toBeDefined();
      expect(found!.agentCount).toBe(2);
    });

    it('should set active swarm', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const swarm1 = await store.createSwarm({
        name: 'Swarm 1',
        topology: 'mesh',
        queenMode: true,
        maxAgents: 10,
        consensusThreshold: 0.7,
        memoryTTL: 3600,
        config: {},
      });

      const swarm2 = await store.createSwarm({
        name: 'Swarm 2',
        topology: 'ring',
        queenMode: false,
        maxAgents: 5,
        consensusThreshold: 0.6,
        memoryTTL: 1800,
        config: {},
      });

      await store.setActiveSwarm(swarm1.id);

      const activeId = await store.getActiveSwarmId();
      expect(activeId).toBe(swarm1.id);
    });
  });

  describe('Agent Operations', () => {
    it('should create an agent', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const swarm = await store.createSwarm({
        name: 'Agent Test Swarm',
        topology: 'mesh',
        queenMode: true,
        maxAgents: 10,
        consensusThreshold: 0.7,
        memoryTTL: 3600,
        config: {},
      });

      const agent = await store.createAgent({
        swarmId: swarm.id,
        name: 'Research Agent',
        type: 'researcher',
        status: 'idle',
        capabilities: ['research', 'analysis'],
        metadata: { specialty: 'data' },
      });

      expect(agent.id).toBeDefined();
      expect(agent.name).toBe('Research Agent');
      expect(agent.successCount).toBe(0);
      expect(agent.errorCount).toBe(0);
    });

    it('should get agents by swarm', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const swarm = await store.createSwarm({
        name: 'Multi-Agent Swarm',
        topology: 'mesh',
        queenMode: true,
        maxAgents: 10,
        consensusThreshold: 0.7,
        memoryTTL: 3600,
        config: {},
      });

      await store.createAgent({
        swarmId: swarm.id,
        name: 'Agent A',
        type: 'researcher',
        status: 'idle',
        capabilities: ['research'],
        metadata: {},
      });

      await store.createAgent({
        swarmId: swarm.id,
        name: 'Agent B',
        type: 'coder',
        status: 'busy',
        capabilities: ['coding'],
        metadata: {},
      });

      const agents = await store.getAgents(swarm.id);

      expect(agents.length).toBe(2);
    });

    it('should update agent status', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const swarm = await store.createSwarm({
        name: 'Status Test Swarm',
        topology: 'mesh',
        queenMode: true,
        maxAgents: 10,
        consensusThreshold: 0.7,
        memoryTTL: 3600,
        config: {},
      });

      const agent = await store.createAgent({
        swarmId: swarm.id,
        name: 'Status Agent',
        type: 'worker',
        status: 'idle',
        capabilities: [],
        metadata: {},
      });

      await store.updateAgentStatus(agent.id, 'busy');

      const updated = await store.getAgent(agent.id);
      expect(updated!.status).toBe('busy');
    });

    it('should get agent performance metrics', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const swarm = await store.createSwarm({
        name: 'Performance Test',
        topology: 'mesh',
        queenMode: true,
        maxAgents: 10,
        consensusThreshold: 0.7,
        memoryTTL: 3600,
        config: {},
      });

      const agent = await store.createAgent({
        swarmId: swarm.id,
        name: 'Performance Agent',
        type: 'worker',
        status: 'idle',
        capabilities: [],
        metadata: {},
      });

      // Simulate some work
      await store.updateAgent(agent.id, {
        successCount: 8,
        errorCount: 2,
        messageCount: 100,
      });

      const perf = await store.getAgentPerformance(agent.id);

      expect(perf).not.toBeNull();
      expect(perf!.successRate).toBe(0.8);
      expect(perf!.totalTasks).toBe(10);
      expect(perf!.messageCount).toBe(100);
    });
  });

  describe('Task Operations', () => {
    it('should create a task', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const swarm = await store.createSwarm({
        name: 'Task Test Swarm',
        topology: 'mesh',
        queenMode: true,
        maxAgents: 10,
        consensusThreshold: 0.7,
        memoryTTL: 3600,
        config: {},
      });

      const task = await store.createTask({
        swarmId: swarm.id,
        description: 'Test task',
        priority: 'high',
        strategy: 'single',
        status: 'pending',
        dependencies: [],
        assignedAgents: [],
        requireConsensus: false,
        maxAgents: 1,
        requiredCapabilities: ['coding'],
        metadata: {},
      });

      expect(task.id).toBeDefined();
      expect(task.description).toBe('Test task');
      expect(task.status).toBe('pending');
    });

    it('should get pending tasks sorted by priority', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const swarm = await store.createSwarm({
        name: 'Priority Test Swarm',
        topology: 'mesh',
        queenMode: true,
        maxAgents: 10,
        consensusThreshold: 0.7,
        memoryTTL: 3600,
        config: {},
      });

      await store.createTask({
        swarmId: swarm.id,
        description: 'Low priority task',
        priority: 'low',
        strategy: 'single',
        status: 'pending',
        dependencies: [],
        assignedAgents: [],
        requireConsensus: false,
        maxAgents: 1,
        requiredCapabilities: [],
        metadata: {},
      });

      await store.createTask({
        swarmId: swarm.id,
        description: 'Critical task',
        priority: 'critical',
        strategy: 'single',
        status: 'pending',
        dependencies: [],
        assignedAgents: [],
        requireConsensus: false,
        maxAgents: 1,
        requiredCapabilities: [],
        metadata: {},
      });

      await store.createTask({
        swarmId: swarm.id,
        description: 'Medium task',
        priority: 'medium',
        strategy: 'single',
        status: 'pending',
        dependencies: [],
        assignedAgents: [],
        requireConsensus: false,
        maxAgents: 1,
        requiredCapabilities: [],
        metadata: {},
      });

      const pending = await store.getPendingTasks(swarm.id);

      expect(pending.length).toBe(3);
      expect(pending[0].priority).toBe('critical');
      expect(pending[1].priority).toBe('medium');
      expect(pending[2].priority).toBe('low');
    });

    it('should update task status', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const swarm = await store.createSwarm({
        name: 'Task Status Test',
        topology: 'mesh',
        queenMode: true,
        maxAgents: 10,
        consensusThreshold: 0.7,
        memoryTTL: 3600,
        config: {},
      });

      const task = await store.createTask({
        swarmId: swarm.id,
        description: 'Status test task',
        priority: 'medium',
        strategy: 'single',
        status: 'pending',
        dependencies: [],
        assignedAgents: [],
        requireConsensus: false,
        maxAgents: 1,
        requiredCapabilities: [],
        metadata: {},
      });

      await store.updateTaskStatus(task.id, 'completed');

      const updated = await store.getTask(task.id);
      expect(updated!.status).toBe('completed');
      expect(updated!.completedAt).toBeDefined();
    });

    it('should get active tasks', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const swarm = await store.createSwarm({
        name: 'Active Tasks Test',
        topology: 'mesh',
        queenMode: true,
        maxAgents: 10,
        consensusThreshold: 0.7,
        memoryTTL: 3600,
        config: {},
      });

      await store.createTask({
        swarmId: swarm.id,
        description: 'Pending task',
        priority: 'medium',
        strategy: 'single',
        status: 'pending',
        dependencies: [],
        assignedAgents: [],
        requireConsensus: false,
        maxAgents: 1,
        requiredCapabilities: [],
        metadata: {},
      });

      await store.createTask({
        swarmId: swarm.id,
        description: 'In progress task',
        priority: 'high',
        strategy: 'single',
        status: 'in_progress',
        dependencies: [],
        assignedAgents: ['agent-001'],
        requireConsensus: false,
        maxAgents: 1,
        requiredCapabilities: [],
        metadata: {},
      });

      await store.createTask({
        swarmId: swarm.id,
        description: 'Assigned task',
        priority: 'high',
        strategy: 'single',
        status: 'assigned',
        dependencies: [],
        assignedAgents: ['agent-002'],
        requireConsensus: false,
        maxAgents: 1,
        requiredCapabilities: [],
        metadata: {},
      });

      const active = await store.getActiveTasks(swarm.id);

      expect(active.length).toBe(2);
    });
  });

  describe('Memory Operations', () => {
    it('should store and retrieve memory', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      await store.storeMemory({
        key: 'test-key',
        namespace: 'test-namespace',
        value: JSON.stringify({ data: 'test value' }),
        ttl: 3600,
        metadata: { tag: 'test' },
      });

      const retrieved = await store.getMemory('test-key', 'test-namespace');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.key).toBe('test-key');
      expect(JSON.parse(retrieved!.value).data).toBe('test value');
    });

    it('should search memory', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      await store.storeMemory({
        key: 'learning-pattern-1',
        namespace: 'tiara:learning',
        value: 'Parallel processing improves throughput',
        metadata: { type: 'pattern' },
      });

      await store.storeMemory({
        key: 'learning-pattern-2',
        namespace: 'tiara:learning',
        value: 'Consensus building requires quorum',
        metadata: { type: 'pattern' },
      });

      const results = await store.searchMemory({
        pattern: 'processing',
        namespace: 'tiara:learning',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should list memory by namespace', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      await store.storeMemory({
        key: 'entry-1',
        namespace: 'tiara:decisions',
        value: 'Decision 1',
      });

      await store.storeMemory({
        key: 'entry-2',
        namespace: 'tiara:decisions',
        value: 'Decision 2',
      });

      await store.storeMemory({
        key: 'entry-3',
        namespace: 'tiara:patterns',
        value: 'Pattern 1',
      });

      const decisions = await store.listMemory('tiara:decisions', 100);

      expect(decisions.length).toBe(2);
    });

    it('should delete memory', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      await store.storeMemory({
        key: 'delete-me',
        namespace: 'test',
        value: 'To be deleted',
      });

      await store.deleteMemory('delete-me', 'test');

      const retrieved = await store.getMemory('delete-me', 'test');
      expect(retrieved).toBeNull();
    });
  });

  describe('Consensus Operations', () => {
    it('should create a consensus proposal', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const proposal = await store.createConsensusProposal({
        swarmId: 'swarm-001',
        taskId: 'task-001',
        proposal: { action: 'scale_up', count: 2 },
        requiredThreshold: 0.7,
        deadline: Date.now() + 60000,
      });

      expect(proposal.id).toBeDefined();
      expect(proposal.status).toBe('pending');
      expect(proposal.votes).toEqual({});
    });

    it('should submit votes on proposal', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const proposal = await store.createConsensusProposal({
        swarmId: 'swarm-001',
        taskId: 'task-001',
        proposal: { action: 'approve' },
        requiredThreshold: 0.7,
        deadline: Date.now() + 60000,
      });

      await store.submitConsensusVote(proposal.id, 'agent-001', true, 'Agree with proposal');
      await store.submitConsensusVote(proposal.id, 'agent-002', true, 'Support this action');
      await store.submitConsensusVote(proposal.id, 'agent-003', false, 'Disagree');

      const updated = await store.getConsensusProposal(proposal.id);

      expect(updated!.totalVoters).toBe(3);
      expect(updated!.currentVotes).toBe(2); // 2 positive votes
    });

    it('should achieve consensus when threshold is met', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const proposal = await store.createConsensusProposal({
        swarmId: 'swarm-001',
        proposal: { action: 'approve' },
        requiredThreshold: 0.6, // 60%
        deadline: Date.now() + 60000,
      });

      // 2 out of 3 votes are positive = 66.7%
      await store.submitConsensusVote(proposal.id, 'agent-001', true);
      await store.submitConsensusVote(proposal.id, 'agent-002', true);
      await store.submitConsensusVote(proposal.id, 'agent-003', false);

      const updated = await store.getConsensusProposal(proposal.id);

      expect(updated!.status).toBe('achieved');
      expect(updated!.resolvedAt).toBeDefined();
    });

    it('should get recent consensus proposals', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      await store.createConsensusProposal({
        swarmId: 'swarm-001',
        proposal: { action: 'proposal-1' },
        requiredThreshold: 0.7,
        deadline: Date.now() + 60000,
      });

      await store.createConsensusProposal({
        swarmId: 'swarm-001',
        proposal: { action: 'proposal-2' },
        requiredThreshold: 0.7,
        deadline: Date.now() + 60000,
      });

      const recent = await store.getRecentConsensusProposals('swarm-001', 10);

      expect(recent.length).toBe(2);
    });
  });

  describe('Performance Metrics', () => {
    it('should store performance metrics', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const metric = await store.storePerformanceMetric({
        swarmId: 'swarm-001',
        agentId: 'agent-001',
        metricType: 'task_completion_time',
        metricValue: 1500,
        metadata: { taskId: 'task-001' },
      });

      expect(metric.id).toBeDefined();
      expect(metric.metricValue).toBe(1500);
      expect(metric.timestamp).toBeGreaterThan(0);
    });

    it('should get swarm statistics', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const swarm = await store.createSwarm({
        name: 'Stats Test Swarm',
        topology: 'mesh',
        queenMode: true,
        maxAgents: 10,
        consensusThreshold: 0.7,
        memoryTTL: 3600,
        config: {},
      });

      await store.createAgent({
        swarmId: swarm.id,
        name: 'Busy Agent',
        type: 'worker',
        status: 'busy',
        capabilities: [],
        metadata: {},
      });

      await store.createAgent({
        swarmId: swarm.id,
        name: 'Idle Agent',
        type: 'worker',
        status: 'idle',
        capabilities: [],
        metadata: {},
      });

      await store.createTask({
        swarmId: swarm.id,
        description: 'Pending task',
        priority: 'medium',
        strategy: 'single',
        status: 'pending',
        dependencies: [],
        assignedAgents: [],
        requireConsensus: false,
        maxAgents: 1,
        requiredCapabilities: [],
        metadata: {},
      });

      const stats = await store.getSwarmStats(swarm.id);

      expect(stats.agentCount).toBe(2);
      expect(stats.busyAgents).toBe(1);
      expect(stats.agentUtilization).toBe(0.5);
      expect(stats.taskBacklog).toBe(1);
    });

    it('should get strategy performance metrics', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const swarm = await store.createSwarm({
        name: 'Strategy Test Swarm',
        topology: 'mesh',
        queenMode: true,
        maxAgents: 10,
        consensusThreshold: 0.7,
        memoryTTL: 3600,
        config: {},
      });

      // Create completed tasks with different strategies
      const task1 = await store.createTask({
        swarmId: swarm.id,
        description: 'Single task',
        priority: 'medium',
        strategy: 'single',
        status: 'completed',
        dependencies: [],
        assignedAgents: [],
        requireConsensus: false,
        maxAgents: 1,
        requiredCapabilities: [],
        metadata: {},
      });

      await store.updateTask(task1.id, { completedAt: Date.now() });

      const task2 = await store.createTask({
        swarmId: swarm.id,
        description: 'Parallel task',
        priority: 'high',
        strategy: 'parallel',
        status: 'completed',
        dependencies: [],
        assignedAgents: [],
        requireConsensus: false,
        maxAgents: 3,
        requiredCapabilities: [],
        metadata: {},
      });

      await store.updateTask(task2.id, { completedAt: Date.now() });

      const perf = await store.getStrategyPerformance(swarm.id);

      expect(perf.single).toBeDefined();
      expect(perf.parallel).toBeDefined();
      expect(perf.single.totalTasks).toBe(1);
      expect(perf.parallel.totalTasks).toBe(1);
    });
  });
});
