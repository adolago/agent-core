/**
 * Test mock factories for Tiara
 */

import { jest } from '@jest/globals';

export interface MockLogger {
  debug: jest.Mock;
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
}

export interface MockEventBus {
  emit: jest.Mock;
  on: jest.Mock;
  off: jest.Mock;
  once: jest.Mock;
  removeAllListeners: jest.Mock;
}

function createMockLogger(): MockLogger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function createMockEventBus(): MockEventBus {
  const listeners = new Map<string, Set<(data: any) => void>>();

  const mockEventBus: MockEventBus = {
    emit: jest.fn((event: string, data?: any) => {
      const handlers = listeners.get(event);
      if (handlers) {
        handlers.forEach(handler => handler(data));
      }
    }),
    on: jest.fn((event: string, handler: (data: any) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(handler);
      return () => listeners.get(event)?.delete(handler);
    }),
    off: jest.fn((event: string, handler: (data: any) => void) => {
      listeners.get(event)?.delete(handler);
    }),
    once: jest.fn((event: string, handler: (data: any) => void) => {
      const wrapper = (data: any) => {
        handler(data);
        mockEventBus.off(event, wrapper);
      };
      mockEventBus.on(event, wrapper);
    }),
    removeAllListeners: jest.fn(() => {
      listeners.clear();
    }),
  };

  return mockEventBus;
}

export function createMocks() {
  return {
    logger: createMockLogger(),
    eventBus: createMockEventBus(),
  };
}

// Additional mock objects for specific tests
export const mockAgent = {
  id: 'mock-agent-1',
  name: 'Mock Agent',
  type: 'coordinator' as const,
  capabilities: ['task-management', 'coordination'],
  systemPrompt: 'You are a mock agent',
  maxConcurrentTasks: 5,
  priority: 10,
  environment: {},
  workingDirectory: '/tmp',
  shell: '/bin/bash',
  metadata: {},
};

export const mockTask = {
  id: 'mock-task-1',
  type: 'test',
  description: 'Mock task',
  priority: 50,
  dependencies: [],
  status: 'pending' as const,
  input: { test: true },
  createdAt: new Date(),
  metadata: {},
};

export const mockConfig = {
  orchestrator: {
    maxConcurrentAgents: 10,
    taskQueueSize: 100,
    healthCheckInterval: 30000,
    shutdownTimeout: 30000,
    maintenanceInterval: 300000,
    metricsInterval: 60000,
    persistSessions: false,
    dataDir: './tests/data',
    sessionRetentionMs: 3600000,
    taskHistoryRetentionMs: 86400000,
    taskMaxRetries: 3,
  },
  terminal: {
    type: 'native' as const,
    poolSize: 5,
    recycleAfter: 10,
    healthCheckInterval: 60000,
    commandTimeout: 300000,
  },
  memory: {
    backend: 'qdrant' as const,
    cacheSizeMB: 10,
    syncInterval: 5000,
    conflictResolution: 'last-write' as const,
    retentionDays: 1,
    url: 'http://localhost:6333',
    collection: 'agent_memory',
  },
  coordination: {
    maxRetries: 3,
    retryDelay: 100,
    deadlockDetection: true,
    resourceTimeout: 60000,
    messageTimeout: 30000,
  },
  mcp: {
    transport: 'stdio' as const,
    port: 8081,
    tlsEnabled: false,
  },
  logging: {
    level: 'error' as const,
    format: 'json' as const,
    destination: 'console' as const,
  },
};

export const mockMemoryStore = {
  store: jest.fn(),
  retrieve: jest.fn(),
  list: jest.fn(),
  delete: jest.fn(),
  clear: jest.fn(),
};

export const mockTerminalManager = {
  spawn: jest.fn(),
  execute: jest.fn(),
  kill: jest.fn(),
  list: jest.fn(),
  health: jest.fn(),
};

export const mockCoordinationSystem = {
  register: jest.fn(),
  unregister: jest.fn(),
  requestResource: jest.fn(),
  releaseResource: jest.fn(),
  broadcast: jest.fn(),
  sendMessage: jest.fn(),
};

export { createMockLogger, createMockEventBus };
