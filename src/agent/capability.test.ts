/**
 * Tests for Capability Registry and Skill-based Routing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CapabilityRegistry,
  getCapabilityRegistry,
  resetCapabilityRegistry,
  shouldHandoff,
  findAgentWithCapability,
  getAvailableHandoffs,
} from './capability';
import {
  executeHandoff,
  validateHandoff,
  generateHandoffSystemMessage,
  canHandoff,
  getHandoffSummary,
} from './handoff';

describe('CapabilityRegistry', () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
  });

  describe('register', () => {
    it('should register capabilities for an agent', () => {
      registry.register('zee', ['memory', 'messaging', 'calendar']);

      expect(registry.hasCapability('zee', 'memory')).toBe(true);
      expect(registry.hasCapability('zee', 'messaging')).toBe(true);
      expect(registry.hasCapability('zee', 'calendar')).toBe(true);
    });

    it('should register capability objects with descriptions', () => {
      registry.register('stanley', [
        { name: 'market_data', description: 'Real-time market data' },
        { name: 'sec_filings', description: 'SEC filing analysis' },
      ]);

      const capabilities = registry.getCapabilities('stanley');
      expect(capabilities).toHaveLength(2);
      expect(capabilities[0].description).toBe('Real-time market data');
    });

    it('should merge capabilities when registering to existing agent', () => {
      registry.register('zee', ['memory']);
      registry.register('zee', ['messaging', 'calendar']);

      expect(registry.getCapabilityNames('zee')).toEqual(['memory', 'messaging', 'calendar']);
    });

    it('should not duplicate capabilities', () => {
      registry.register('zee', ['memory', 'messaging']);
      registry.register('zee', ['memory', 'calendar']);

      expect(registry.getCapabilityNames('zee')).toEqual(['memory', 'messaging', 'calendar']);
    });

    it('should emit events on registration', () => {
      const events: string[] = [];
      registry.on('capability:registered', ({ capability }) => {
        events.push(capability);
      });

      registry.register('zee', ['memory', 'messaging']);

      expect(events).toEqual(['memory', 'messaging']);
    });
  });

  describe('unregister', () => {
    it('should remove a capability from an agent', () => {
      registry.register('zee', ['memory', 'messaging']);
      registry.unregister('zee', 'memory');

      expect(registry.hasCapability('zee', 'memory')).toBe(false);
      expect(registry.hasCapability('zee', 'messaging')).toBe(true);
    });

    it('should return false for non-existent agent', () => {
      expect(registry.unregister('unknown', 'memory')).toBe(false);
    });

    it('should return false for non-existent capability', () => {
      registry.register('zee', ['memory']);
      expect(registry.unregister('zee', 'unknown')).toBe(false);
    });
  });

  describe('unregisterAgent', () => {
    it('should remove an agent and all capabilities', () => {
      registry.register('zee', ['memory', 'messaging']);
      registry.unregisterAgent('zee');

      expect(registry.listAgents()).toHaveLength(0);
    });
  });

  describe('availability', () => {
    it('should track agent availability', () => {
      registry.register('zee', ['memory']);
      expect(registry.isAvailable('zee')).toBe(true);

      registry.setAvailable('zee', false);
      expect(registry.isAvailable('zee')).toBe(false);

      registry.setAvailable('zee', true);
      expect(registry.isAvailable('zee')).toBe(true);
    });

    it('should return false for unknown agents', () => {
      expect(registry.isAvailable('unknown')).toBe(false);
    });
  });

  describe('findAgentsWithCapability', () => {
    it('should find all agents with a capability', () => {
      registry.register('zee', ['memory', 'messaging']);
      registry.register('stanley', ['market_data', 'messaging']);
      registry.register('opencode', ['code', 'messaging']);

      const agents = registry.findAgentsWithCapability('messaging');
      expect(agents).toHaveLength(3);
      expect(agents.map((a) => a.agentName)).toEqual(['zee', 'stanley', 'opencode']);
    });

    it('should not include unavailable agents', () => {
      registry.register('zee', ['memory', 'messaging']);
      registry.register('stanley', ['messaging']);
      registry.setAvailable('stanley', false);

      const agents = registry.findAgentsWithCapability('messaging');
      expect(agents).toHaveLength(1);
      expect(agents[0].agentName).toBe('zee');
    });
  });

  describe('listAllCapabilities', () => {
    it('should list all unique capabilities', () => {
      registry.register('zee', ['memory', 'messaging']);
      registry.register('stanley', ['market_data', 'messaging']);

      const capabilities = registry.listAllCapabilities();
      expect(capabilities).toContain('memory');
      expect(capabilities).toContain('messaging');
      expect(capabilities).toContain('market_data');
      expect(new Set(capabilities).size).toBe(capabilities.length);
    });
  });
});

describe('shouldHandoff', () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
    registry.register('zee', ['memory', 'messaging', 'calendar']);
    registry.register('stanley', ['market_data', 'sec_filings', 'portfolio']);
  });

  it('should return needed=false when current agent has capability', () => {
    const result = shouldHandoff('memory', 'zee', registry);

    expect(result.needed).toBe(false);
    expect(result.targetAgent).toBeUndefined();
  });

  it('should return needed=true when another agent has capability', () => {
    const result = shouldHandoff('market_data', 'zee', registry);

    expect(result.needed).toBe(true);
    expect(result.targetAgent).toBe('stanley');
    expect(result.capability).toBe('market_data');
  });

  it('should return needed=false when no agent has capability', () => {
    const result = shouldHandoff('unknown_capability', 'zee', registry);

    expect(result.needed).toBe(false);
    expect(result.reason).toContain('No agent has capability');
  });
});

describe('findAgentWithCapability', () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
    registry.register('zee', ['memory', 'messaging']);
    registry.register('stanley', ['market_data', 'messaging']);
  });

  it('should find agent with capability', () => {
    const result = findAgentWithCapability('market_data', undefined, registry);

    expect(result).not.toBeNull();
    expect(result?.agentName).toBe('stanley');
    expect(result?.capability.name).toBe('market_data');
  });

  it('should exclude specified agent', () => {
    const result = findAgentWithCapability('messaging', 'zee', registry);

    expect(result).not.toBeNull();
    expect(result?.agentName).toBe('stanley');
  });

  it('should return null when no agent found', () => {
    const result = findAgentWithCapability('unknown', undefined, registry);
    expect(result).toBeNull();
  });
});

describe('getAvailableHandoffs', () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
    registry.register('zee', ['memory', 'messaging']);
    registry.register('stanley', ['market_data', 'portfolio']);
    registry.register('opencode', ['code', 'git']);
  });

  it('should return capabilities available via handoff', () => {
    const handoffs = getAvailableHandoffs('zee', registry);

    expect(handoffs.get('market_data')).toEqual(['stanley']);
    expect(handoffs.get('portfolio')).toEqual(['stanley']);
    expect(handoffs.get('code')).toEqual(['opencode']);
    expect(handoffs.has('memory')).toBe(false); // zee already has this
  });
});

describe('validateHandoff', () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
    registry.register('zee', ['memory']);
    registry.register('stanley', ['market_data']);
  });

  it('should validate a correct handoff request', () => {
    const result = validateHandoff(
      {
        sourceAgent: 'zee',
        targetAgent: 'stanley',
        capability: 'market_data',
        reason: 'Need financial analysis',
      },
      registry
    );

    expect(result.valid).toBe(true);
  });

  it('should reject handoff to same agent', () => {
    const result = validateHandoff(
      {
        sourceAgent: 'zee',
        targetAgent: 'zee',
        capability: 'memory',
        reason: 'test',
      },
      registry
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('same agent');
  });

  it('should reject handoff without reason', () => {
    const result = validateHandoff(
      {
        sourceAgent: 'zee',
        targetAgent: 'stanley',
        capability: 'market_data',
        reason: '',
      },
      registry
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('reason');
  });

  it('should reject handoff to unavailable agent', () => {
    registry.setAvailable('stanley', false);

    const result = validateHandoff(
      {
        sourceAgent: 'zee',
        targetAgent: 'stanley',
        capability: 'market_data',
        reason: 'test',
      },
      registry
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('not available');
  });
});

describe('executeHandoff', () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
    registry.register('zee', ['memory', 'messaging']);
    registry.register('stanley', [
      { name: 'market_data', description: 'Real-time market data' },
      { name: 'portfolio', description: 'Portfolio management' },
    ]);
  });

  it('should execute a valid handoff', async () => {
    const result = await executeHandoff(
      {
        sourceAgent: 'zee',
        targetAgent: 'stanley',
        capability: 'market_data',
        reason: 'User needs financial analysis',
        context: {
          sessionId: 'session-123',
          recentMessages: [{ role: 'user', content: 'Analyze AAPL' }],
        },
      },
      registry
    );

    expect(result.accepted).toBe(true);
    expect(result.targetCapabilities).toHaveLength(2);
    expect(result.suggestedCapability).toBe('market_data');
    expect(result.sessionTransferred).toBe(true);
    expect(result.newSessionId).toContain('stanley');
  });

  it('should reject invalid handoff', async () => {
    const result = await executeHandoff(
      {
        sourceAgent: 'zee',
        targetAgent: 'unknown',
        capability: 'market_data',
        reason: 'test',
        context: {
          sessionId: 'session-123',
          recentMessages: [],
        },
      },
      registry
    );

    expect(result.accepted).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('generateHandoffSystemMessage', () => {
  it('should generate informative system message', () => {
    const request = {
      sourceAgent: 'zee',
      targetAgent: 'stanley',
      capability: 'market_data',
      reason: 'User needs financial analysis',
      context: {
        sessionId: 'session-123',
        recentMessages: [
          { role: 'user' as const, content: 'Analyze AAPL' },
          { role: 'assistant' as const, content: 'I can help with that.' },
        ],
        relevantMemoryIds: ['mem-1', 'mem-2'],
        pendingTasks: ['research'],
      },
    };

    const result = {
      accepted: true,
      targetCapabilities: [
        { name: 'market_data', description: 'Real-time market data' },
        { name: 'portfolio', description: 'Portfolio management' },
      ],
      suggestedCapability: 'market_data',
      sessionTransferred: true,
      newSessionId: 'stanley-session-123-1234567890',
    };

    const message = generateHandoffSystemMessage(request, result);

    expect(message).toContain('[HANDOFF FROM ZEE]');
    expect(message).toContain('User needs financial analysis');
    expect(message).toContain('2 recent messages');
    expect(message).toContain('2 relevant memories');
    expect(message).toContain('1 pending tasks');
    expect(message).toContain('Suggested capability: market_data');
    expect(message).toContain('market_data: Real-time market data');
  });
});

describe('canHandoff', () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
    registry.register('zee', ['memory']);
    registry.register('stanley', ['market_data']);
  });

  it('should return true for valid handoff', () => {
    expect(canHandoff('zee', 'stanley', 'market_data', registry)).toBe(true);
  });

  it('should return false for same agent', () => {
    expect(canHandoff('zee', 'zee', 'memory', registry)).toBe(false);
  });

  it('should return false for unavailable target', () => {
    registry.setAvailable('stanley', false);
    expect(canHandoff('zee', 'stanley', 'market_data', registry)).toBe(false);
  });

  it('should return false for missing capability', () => {
    expect(canHandoff('zee', 'stanley', 'unknown', registry)).toBe(false);
  });
});

describe('getHandoffSummary', () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
    registry.register('zee', ['memory', 'messaging']);
    registry.register('stanley', ['market_data', 'portfolio']);
    registry.register('opencode', ['code', 'portfolio']);
  });

  it('should summarize available handoffs', () => {
    const summary = getHandoffSummary('zee', registry);

    const marketData = summary.find((s) => s.capability === 'market_data');
    const portfolio = summary.find((s) => s.capability === 'portfolio');
    const code = summary.find((s) => s.capability === 'code');

    expect(marketData?.agents).toEqual(['stanley']);
    expect(portfolio?.agents).toContain('stanley');
    expect(portfolio?.agents).toContain('opencode');
    expect(code?.agents).toEqual(['opencode']);

    // Should not include capabilities zee already has
    expect(summary.find((s) => s.capability === 'memory')).toBeUndefined();
  });
});

describe('Global Registry', () => {
  beforeEach(() => {
    resetCapabilityRegistry();
  });

  it('should provide singleton access', () => {
    const registry1 = getCapabilityRegistry();
    const registry2 = getCapabilityRegistry();

    expect(registry1).toBe(registry2);
  });

  it('should reset properly', () => {
    const registry1 = getCapabilityRegistry();
    registry1.register('zee', ['memory']);

    resetCapabilityRegistry();

    const registry2 = getCapabilityRegistry();
    expect(registry2.listAgents()).toHaveLength(0);
    expect(registry1).not.toBe(registry2);
  });
});
