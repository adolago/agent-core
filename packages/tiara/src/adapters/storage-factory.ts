/**
 * Storage Factory - Unified interface for tiara storage backends.
 *
 * Provides a consistent API for Qdrant-backed storage.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { QdrantCoordinationAdapter, QdrantConfig, DEFAULT_QDRANT_CONFIG } from './qdrant-adapter.js';
import type {
  SwarmRecord,
  AgentRecord,
  TaskRecord,
  MetricRecord,
  EventRecord,
} from '../api/database-service.js';

// =============================================================================
// Storage Interface
// =============================================================================

/**
 * Unified storage interface implemented by Qdrant backend.
 */
export interface StorageBackend {
  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;

  // Swarm operations
  createSwarm(swarm: Omit<SwarmRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<string>;
  getSwarm(id: string): Promise<SwarmRecord | null>;
  updateSwarmStatus(id: string, status: SwarmRecord['status']): Promise<void>;
  deleteSwarm(id: string): Promise<void>;
  listSwarms(status?: SwarmRecord['status']): Promise<SwarmRecord[]>;

  // Agent operations
  createAgent(agent: Omit<AgentRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<string>;
  getAgent(id: string): Promise<AgentRecord | null>;
  updateAgentStatus(id: string, status: AgentRecord['status']): Promise<void>;
  getAgentsBySwarm(swarmId: string): Promise<AgentRecord[]>;
  deleteAgent(id: string): Promise<void>;

  // Task operations
  createTask(task: Omit<TaskRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<string>;
  getTask(id: string): Promise<TaskRecord | null>;
  updateTaskStatus(id: string, status: TaskRecord['status'], result?: unknown, errorMessage?: string): Promise<void>;
  getTasksBySwarm(swarmId: string, status?: TaskRecord['status']): Promise<TaskRecord[]>;
  deleteTask(id: string): Promise<void>;

  // Event logging
  logEvent(event: Omit<EventRecord, 'id' | 'createdAt'>): Promise<string>;
  getEvents(filters: {
    swarmId?: string;
    agentId?: string;
    severity?: EventRecord['severity'];
    eventType?: string;
    since?: Date;
  }, limit?: number): Promise<EventRecord[]>;

  // Metrics
  recordMetric(metric: Omit<MetricRecord, 'id' | 'timestamp'>): Promise<string>;
  getMetrics(filters: {
    swarmId?: string;
    agentId?: string;
    metricType?: string;
    since?: Date;
  }, limit?: number): Promise<MetricRecord[]>;

  // Memory (key-value)
  memoryStore(key: string, value: string, namespace?: string, options?: { ttl?: number; metadata?: Record<string, unknown> }): Promise<void>;
  memoryGet(key: string, namespace?: string): Promise<{ value: string; metadata?: Record<string, unknown> } | null>;
  memoryDelete(key: string, namespace?: string): Promise<void>;
  memoryList(namespace?: string, limit?: number): Promise<Array<{ key: string; value: string; namespace: string }>>;

  // Maintenance
  cleanup(): Promise<{ expired: number; oldEvents: number }>;
}

// =============================================================================
// Storage Configuration
// =============================================================================

export type StorageType = 'qdrant';

export interface StorageConfig {
  type: StorageType;
  qdrant?: Partial<QdrantConfig>;
}

export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  type: 'qdrant',
};

// =============================================================================
// Qdrant Backend Wrapper
// =============================================================================

/**
 * Wraps QdrantCoordinationAdapter to implement StorageBackend interface.
 */
class QdrantStorageBackend implements StorageBackend {
  private adapter: QdrantCoordinationAdapter;

  constructor(config?: Partial<QdrantConfig>) {
    this.adapter = new QdrantCoordinationAdapter(config);
  }

  async initialize(): Promise<void> {
    await this.adapter.initialize();
  }

  async shutdown(): Promise<void> {
    // Qdrant adapter is stateless, nothing to shut down
  }

  async createSwarm(swarm: Omit<SwarmRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    return this.adapter.createSwarm(swarm);
  }

  async getSwarm(id: string): Promise<SwarmRecord | null> {
    return this.adapter.getSwarm(id);
  }

  async updateSwarmStatus(id: string, status: SwarmRecord['status']): Promise<void> {
    return this.adapter.updateSwarmStatus(id, status);
  }

  async deleteSwarm(id: string): Promise<void> {
    return this.adapter.deleteSwarm(id);
  }

  async listSwarms(status?: SwarmRecord['status']): Promise<SwarmRecord[]> {
    return this.adapter.listSwarms(status);
  }

  async createAgent(agent: Omit<AgentRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    return this.adapter.createAgent(agent);
  }

  async getAgent(id: string): Promise<AgentRecord | null> {
    return this.adapter.getAgent(id);
  }

  async updateAgentStatus(id: string, status: AgentRecord['status']): Promise<void> {
    return this.adapter.updateAgentStatus(id, status);
  }

  async getAgentsBySwarm(swarmId: string): Promise<AgentRecord[]> {
    return this.adapter.getAgentsBySwarm(swarmId);
  }

  async deleteAgent(id: string): Promise<void> {
    return this.adapter.deleteAgent(id);
  }

  async createTask(task: Omit<TaskRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    return this.adapter.createTask(task);
  }

  async getTask(id: string): Promise<TaskRecord | null> {
    return this.adapter.getTask(id);
  }

  async updateTaskStatus(id: string, status: TaskRecord['status'], result?: unknown, errorMessage?: string): Promise<void> {
    return this.adapter.updateTaskStatus(id, status, result, errorMessage);
  }

  async getTasksBySwarm(swarmId: string, status?: TaskRecord['status']): Promise<TaskRecord[]> {
    return this.adapter.getTasksBySwarm(swarmId, status);
  }

  async deleteTask(id: string): Promise<void> {
    return this.adapter.deleteTask(id);
  }

  async logEvent(event: Omit<EventRecord, 'id' | 'createdAt'>): Promise<string> {
    return this.adapter.logEvent(event);
  }

  async getEvents(filters: {
    swarmId?: string;
    agentId?: string;
    severity?: EventRecord['severity'];
    eventType?: string;
    since?: Date;
  }, limit = 100): Promise<EventRecord[]> {
    return this.adapter.getEvents(filters, limit);
  }

  async recordMetric(metric: Omit<MetricRecord, 'id' | 'timestamp'>): Promise<string> {
    return this.adapter.recordMetric(metric);
  }

  async getMetrics(filters: {
    swarmId?: string;
    agentId?: string;
    metricType?: string;
    since?: Date;
  }, limit = 100): Promise<MetricRecord[]> {
    return this.adapter.getMetrics(filters, limit);
  }

  async memoryStore(key: string, value: string, namespace = 'default', options?: { ttl?: number; metadata?: Record<string, unknown> }): Promise<void> {
    return this.adapter.memoryStore(key, value, namespace, options);
  }

  async memoryGet(key: string, namespace = 'default'): Promise<{ value: string; metadata?: Record<string, unknown> } | null> {
    const entry = await this.adapter.memoryGet(key, namespace);
    if (!entry) return null;
    return { value: entry.value, metadata: entry.metadata };
  }

  async memoryDelete(key: string, namespace = 'default'): Promise<void> {
    return this.adapter.memoryDelete(key, namespace);
  }

  async memoryList(namespace = 'default', limit = 100): Promise<Array<{ key: string; value: string; namespace: string }>> {
    const entries = await this.adapter.memoryList(namespace, limit);
    return entries.map(e => ({ key: e.key, value: e.value, namespace: e.namespace }));
  }

  async cleanup(): Promise<{ expired: number; oldEvents: number }> {
    return this.adapter.cleanup();
  }
}

// =============================================================================
// Factory
// =============================================================================

let _storage: StorageBackend | null = null;

/**
 * Get the configured storage backend.
 * Creates a singleton instance based on configuration.
 */
export async function getStorage(config?: StorageConfig): Promise<StorageBackend> {
  if (_storage) {
    return _storage;
  }

  const finalConfig = config ?? getConfigFromEnv();

  _storage = new QdrantStorageBackend(finalConfig.qdrant);

  await _storage.initialize();
  return _storage;
}

/**
 * Reset the storage singleton (useful for testing).
 */
export async function resetStorage(): Promise<void> {
  if (_storage) {
    await _storage.shutdown();
    _storage = null;
  }
}

type AgentCoreConfig = {
  memory?: {
    qdrant?: {
      url?: string;
      apiKey?: string;
      collection?: string;
    };
    qdrantUrl?: string;
    qdrantApiKey?: string;
    qdrantCollection?: string;
    embedding?: {
      dimensions?: number;
      dimension?: number;
    };
  };
  tiara?: {
    qdrant?: {
      url?: string;
      apiKey?: string;
      stateCollection?: string;
      memoryCollection?: string;
      coordinationCollection?: string;
      eventsCollection?: string;
      patternsCollection?: string;
      embeddingDimension?: number;
    };
  };
};

let cachedAgentCoreConfig: AgentCoreConfig | null | undefined;

function sanitizeJsonc(input: string): string {
  let output = '';
  let inString = false;
  let stringChar = '';
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const next = input[i + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        output += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      inString = true;
      stringChar = char;
      output += char;
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    output += char;
  }

  return output.replace(/,\s*([}\]])/g, '$1');
}

function loadAgentCoreConfig(): AgentCoreConfig | null {
  if (cachedAgentCoreConfig !== undefined) {
    return cachedAgentCoreConfig;
  }

  const configHome = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
  const candidates = [
    path.join(configHome, 'agent-core', 'agent-core.jsonc'),
    path.join(configHome, 'agent-core', 'agent-core.json'),
  ];

  const agentCoreRoot = process.env.AGENT_CORE_ROOT;
  if (agentCoreRoot) {
    candidates.push(
      path.join(agentCoreRoot, '.agent-core', 'agent-core.jsonc'),
      path.join(agentCoreRoot, '.agent-core', 'agent-core.json'),
    );
  }

  for (const candidate of candidates) {
    try {
      const contents = fs.readFileSync(candidate, 'utf8');
      const parsed = JSON.parse(sanitizeJsonc(contents));
      if (parsed && typeof parsed === 'object') {
        cachedAgentCoreConfig = parsed as AgentCoreConfig;
        return cachedAgentCoreConfig;
      }
    } catch {
      continue;
    }
  }

  cachedAgentCoreConfig = null;
  return null;
}

/**
 * Get storage configuration from environment variables.
 */
function getConfigFromEnv(): StorageConfig {
  const agentCoreConfig = loadAgentCoreConfig();
  const memoryQdrant = {
    url: agentCoreConfig?.memory?.qdrant?.url ?? agentCoreConfig?.memory?.qdrantUrl,
    apiKey: agentCoreConfig?.memory?.qdrant?.apiKey ?? agentCoreConfig?.memory?.qdrantApiKey,
    collection: agentCoreConfig?.memory?.qdrant?.collection ?? agentCoreConfig?.memory?.qdrantCollection,
  };
  const memoryEmbeddingDimension =
    agentCoreConfig?.memory?.embedding?.dimensions ??
    agentCoreConfig?.memory?.embedding?.dimension;
  const tiaraQdrant = agentCoreConfig?.tiara?.qdrant ?? {};
  const type = 'qdrant';
  const embeddingDimension =
    tiaraQdrant.embeddingDimension ??
    (typeof memoryEmbeddingDimension === 'number' ? memoryEmbeddingDimension : undefined) ??
    DEFAULT_QDRANT_CONFIG.embeddingDimension;
  const resolvedEmbeddingDimension = embeddingDimension;

  return {
    type,
    qdrant: {
      url: tiaraQdrant.url ?? memoryQdrant.url ?? DEFAULT_QDRANT_CONFIG.url,
      apiKey: tiaraQdrant.apiKey ?? memoryQdrant.apiKey,
      collections: {
        coordination:
          tiaraQdrant.coordinationCollection ??
          tiaraQdrant.stateCollection ??
          DEFAULT_QDRANT_CONFIG.collections.coordination,
        events:
          tiaraQdrant.eventsCollection ??
          DEFAULT_QDRANT_CONFIG.collections.events,
        patterns:
          tiaraQdrant.patternsCollection ??
          DEFAULT_QDRANT_CONFIG.collections.patterns,
        memory:
          tiaraQdrant.memoryCollection ??
          memoryQdrant.collection ??
          DEFAULT_QDRANT_CONFIG.collections.memory,
      },
      embeddingDimension: resolvedEmbeddingDimension,
    },
  };
}

// =============================================================================
// Exports
// =============================================================================

export {
  QdrantStorageBackend,
  QdrantCoordinationAdapter,
  DEFAULT_QDRANT_CONFIG,
};

export type { QdrantConfig };
