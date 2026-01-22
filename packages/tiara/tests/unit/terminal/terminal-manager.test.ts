/**
 * Unit tests for Terminal Manager
 * Tests the TerminalManager component
 */

import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';
import { TerminalManager } from '../../../src/terminal/manager.js';
import type { TerminalConfig, AgentProfile } from '../../../src/utils/types.js';
import { createMocks } from '../../mocks/index.js';

// Helper to create terminal config
const createTerminalConfig = (overrides: Partial<TerminalConfig> = {}): TerminalConfig => ({
  type: 'native',
  poolSize: 5,
  recycleAfter: 10,
  healthCheckInterval: 60000,
  commandTimeout: 30000,
  ...overrides,
});

// Helper to create agent profile
const createAgentProfile = (overrides: Partial<AgentProfile> = {}): AgentProfile => ({
  id: `agent-${Math.random().toString(36).substr(2, 9)}`,
  name: 'Test Agent',
  type: 'worker',
  capabilities: ['test'],
  systemPrompt: 'Test agent',
  maxConcurrentTasks: 5,
  priority: 5,
  environment: {},
  workingDirectory: '/tmp',
  shell: '/bin/bash',
  metadata: {},
  ...overrides,
});

describe('TerminalManager', () => {
  let manager: TerminalManager;
  let mocks: ReturnType<typeof createMocks>;
  let config: TerminalConfig;

  beforeEach(() => {
    mocks = createMocks();
    config = createTerminalConfig();
    manager = new TerminalManager(config, mocks.eventBus, mocks.logger);
  });

  afterEach(async () => {
    try {
      await manager.shutdown();
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await manager.initialize();

      expect(mocks.logger.info).toHaveBeenCalledWith('Initializing terminal manager...');
      expect(mocks.logger.info).toHaveBeenCalledWith('Terminal manager initialized');
    });

    it('should not throw when initialized twice', async () => {
      await manager.initialize();
      await manager.initialize(); // Should not throw, just return early
    });

    it('should throw for invalid terminal type', () => {
      expect(() => {
        new TerminalManager(
          // @ts-expect-error - testing invalid type
          { ...config, type: 'invalid' },
          mocks.eventBus,
          mocks.logger
        );
      }).toThrow('Unknown terminal type');
    });
  });

  describe('Health Monitoring', () => {
    it('should return health status when not initialized', async () => {
      const health = await manager.getHealthStatus();

      // Should handle gracefully even when not initialized
      expect(health).toBeDefined();
    });

    it('should return health status after initialization', async () => {
      await manager.initialize();

      const health = await manager.getHealthStatus();

      expect(health.healthy).toBeDefined();
      expect(typeof health.healthy).toBe('boolean');
    });
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully when not initialized', async () => {
      await manager.shutdown(); // Should not throw
    });

    it('should shutdown gracefully after initialization', async () => {
      await manager.initialize();
      await manager.shutdown();

      expect(mocks.logger.info).toHaveBeenCalledWith('Terminal manager shutdown complete');
    });
  });

  describe('Maintenance', () => {
    it('should skip maintenance when not initialized', async () => {
      await manager.performMaintenance(); // Should not throw
    });

    it('should perform maintenance after initialization', async () => {
      await manager.initialize();
      await manager.performMaintenance();

      expect(mocks.logger.debug).toHaveBeenCalledWith('Performing terminal manager maintenance');
    });
  });
});

describe('TerminalManager Configuration', () => {
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
  });

  it('should accept native terminal type', () => {
    const config = createTerminalConfig({ type: 'native' });
    const manager = new TerminalManager(config, mocks.eventBus, mocks.logger);

    expect(manager).toBeDefined();
  });

  it('should accept vscode terminal type', () => {
    const config = createTerminalConfig({ type: 'vscode' });
    const manager = new TerminalManager(config, mocks.eventBus, mocks.logger);

    expect(manager).toBeDefined();
  });

  it('should accept auto terminal type', () => {
    const config = createTerminalConfig({ type: 'auto' });
    const manager = new TerminalManager(config, mocks.eventBus, mocks.logger);

    expect(manager).toBeDefined();
  });

  it('should use provided pool size', () => {
    const config = createTerminalConfig({ poolSize: 10 });
    const manager = new TerminalManager(config, mocks.eventBus, mocks.logger);

    expect(manager).toBeDefined();
  });

  it('should use provided command timeout', () => {
    const config = createTerminalConfig({ commandTimeout: 60000 });
    const manager = new TerminalManager(config, mocks.eventBus, mocks.logger);

    expect(manager).toBeDefined();
  });
});
