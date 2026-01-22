/**
 * Communication Tests
 *
 * Tests for the inter-agent messaging and communication system.
 * Uses MockQdrantStore in test mode.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Set test mode
process.env.TIARA_TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

describe('Communication', () => {
  describe('Message Sending', () => {
    it('should send a direct message between agents', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const comm = await store.createCommunication({
        fromAgentId: 'agent-001',
        toAgentId: 'agent-002',
        swarmId: 'swarm-001',
        messageType: 'data_sharing',
        content: JSON.stringify({ data: 'test payload' }),
        priority: 'normal',
        requiresResponse: false,
      });

      expect(comm.id).toBeDefined();
      expect(comm.fromAgentId).toBe('agent-001');
      expect(comm.toAgentId).toBe('agent-002');
      expect(comm.timestamp).toBeGreaterThan(0);
    });

    it('should send a broadcast message (no toAgentId)', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const comm = await store.createCommunication({
        fromAgentId: 'agent-001',
        swarmId: 'swarm-001',
        messageType: 'broadcast',
        content: JSON.stringify({ announcement: 'Hello swarm!' }),
        priority: 'high',
        requiresResponse: false,
      });

      expect(comm.id).toBeDefined();
      expect(comm.toAgentId).toBeUndefined();
      expect(comm.messageType).toBe('broadcast');
    });

    it('should send messages with different priorities', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const priorities = ['urgent', 'high', 'normal', 'low'] as const;

      for (const priority of priorities) {
        const comm = await store.createCommunication({
          fromAgentId: 'agent-001',
          toAgentId: 'agent-002',
          swarmId: 'swarm-001',
          messageType: 'status_update',
          content: JSON.stringify({ priority }),
          priority,
          requiresResponse: false,
        });

        expect(comm.priority).toBe(priority);
      }
    });
  });

  describe('Message Retrieval', () => {
    it('should get pending messages for an agent', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      // Create multiple messages for agent-002
      await store.createCommunication({
        fromAgentId: 'agent-001',
        toAgentId: 'agent-002',
        swarmId: 'swarm-001',
        messageType: 'task_assignment',
        content: JSON.stringify({ task: 'Task 1' }),
        priority: 'high',
        requiresResponse: true,
      });

      await store.createCommunication({
        fromAgentId: 'agent-003',
        toAgentId: 'agent-002',
        swarmId: 'swarm-001',
        messageType: 'data_sharing',
        content: JSON.stringify({ data: 'Shared data' }),
        priority: 'normal',
        requiresResponse: false,
      });

      const pending = await store.getPendingMessages('agent-002');

      expect(pending.length).toBe(2);
      // Should be sorted by priority (high before normal)
      expect(pending[0].priority).toBe('high');
      expect(pending[1].priority).toBe('normal');
    });

    it('should get recent messages for a swarm', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      // Create messages
      await store.createCommunication({
        fromAgentId: 'agent-001',
        swarmId: 'swarm-001',
        messageType: 'status_update',
        content: JSON.stringify({ status: 'active' }),
        priority: 'normal',
        requiresResponse: false,
      });

      const recent = await store.getRecentMessages('swarm-001', 60000);

      expect(recent.length).toBeGreaterThan(0);
      expect(recent[0].swarmId).toBe('swarm-001');
    });
  });

  describe('Message Status Updates', () => {
    it('should mark message as delivered', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const comm = await store.createCommunication({
        fromAgentId: 'agent-001',
        toAgentId: 'agent-002',
        swarmId: 'swarm-001',
        messageType: 'task_assignment',
        content: JSON.stringify({ task: 'Test' }),
        priority: 'normal',
        requiresResponse: false,
      });

      await store.markMessageDelivered(comm.id);

      // Message should no longer be in pending
      const pending = await store.getPendingMessages('agent-002');
      const found = pending.find(p => p.id === comm.id);
      // After delivery, it shouldn't be in pending list
      expect(found).toBeUndefined();
    });

    it('should mark message as read', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const comm = await store.createCommunication({
        fromAgentId: 'agent-001',
        toAgentId: 'agent-002',
        swarmId: 'swarm-001',
        messageType: 'data_sharing',
        content: JSON.stringify({ data: 'Test' }),
        priority: 'normal',
        requiresResponse: false,
      });

      await store.markMessageRead(comm.id);

      // Should succeed without error
      expect(true).toBe(true);
    });
  });

  describe('Message Types', () => {
    it('should handle all message types', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const messageTypes = [
        'task_assignment',
        'status_update',
        'data_sharing',
        'coordination',
        'error_report',
        'consensus_vote',
        'heartbeat',
        'broadcast',
      ] as const;

      for (const messageType of messageTypes) {
        const comm = await store.createCommunication({
          fromAgentId: 'agent-001',
          swarmId: 'swarm-001',
          messageType,
          content: JSON.stringify({ type: messageType }),
          priority: 'normal',
          requiresResponse: false,
        });

        expect(comm.messageType).toBe(messageType);
      }
    });

    it('should handle messages requiring response', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      const comm = await store.createCommunication({
        fromAgentId: 'agent-001',
        toAgentId: 'agent-002',
        swarmId: 'swarm-001',
        messageType: 'task_assignment',
        content: JSON.stringify({ task: 'Complete this task' }),
        priority: 'high',
        requiresResponse: true,
      });

      expect(comm.requiresResponse).toBe(true);
    });
  });

  describe('Message Ordering', () => {
    it('should order pending messages by priority', async () => {
      const { getMockQdrantStore } = await import('../../../src/test/MockQdrantStore');
      const store = await getMockQdrantStore();
      store.reset();

      // Create messages in random priority order
      await store.createCommunication({
        fromAgentId: 'agent-001',
        toAgentId: 'agent-002',
        swarmId: 'swarm-001',
        messageType: 'status_update',
        content: JSON.stringify({ order: 1 }),
        priority: 'low',
        requiresResponse: false,
      });

      await store.createCommunication({
        fromAgentId: 'agent-001',
        toAgentId: 'agent-002',
        swarmId: 'swarm-001',
        messageType: 'status_update',
        content: JSON.stringify({ order: 2 }),
        priority: 'urgent',
        requiresResponse: false,
      });

      await store.createCommunication({
        fromAgentId: 'agent-001',
        toAgentId: 'agent-002',
        swarmId: 'swarm-001',
        messageType: 'status_update',
        content: JSON.stringify({ order: 3 }),
        priority: 'normal',
        requiresResponse: false,
      });

      const pending = await store.getPendingMessages('agent-002');

      expect(pending.length).toBe(3);
      expect(pending[0].priority).toBe('urgent');
      expect(pending[1].priority).toBe('normal');
      expect(pending[2].priority).toBe('low');
    });
  });
});
