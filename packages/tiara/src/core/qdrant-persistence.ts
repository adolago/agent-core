/**
 * Qdrant-backed persistence layer for agent/task metadata.
 */

import { QdrantMemoryStore } from '../memory/qdrant-kv-store.js';

export interface PersistedAgent {
  id: string;
  type: string;
  name: string;
  status: string;
  capabilities: string[];
  systemPrompt: string;
  maxConcurrentTasks: number;
  priority: number;
  createdAt: number;
}

export interface PersistedTask {
  id: string;
  type: string;
  description: string;
  status: string;
  priority: number;
  dependencies: string[];
  metadata: Record<string, unknown>;
  assignedAgent?: string;
  progress: number;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

const DEFAULT_PERSISTENCE_COLLECTION =
  process.env.MEMORY_QDRANT_PERSISTENCE_COLLECTION ||
  process.env.QDRANT_COLLECTION_PERSISTENCE ||
  'agent_persistence';

type PersistenceStore = {
  initialize: () => Promise<void>;
  store: (key: string, value: unknown, options?: { namespace?: string }) => Promise<unknown>;
  retrieve: (key: string, options?: { namespace?: string }) => Promise<unknown>;
  listAll?: (options?: { namespace?: string; limit?: number; offset?: unknown }) => Promise<any[]>;
  list?: (options?: { namespace?: string; limit?: number }) => Promise<any[]>;
  close?: () => void;
};

interface PersistenceOptions {
  store?: PersistenceStore;
  agentNamespace?: string;
  taskNamespace?: string;
  collection?: string;
  url?: string;
  apiKey?: string;
}

export class QdrantPersistenceManager {
  private store: PersistenceStore;
  private initialized = false;
  private agentNamespace: string;
  private taskNamespace: string;

  constructor(options: PersistenceOptions = {}) {
    this.store =
      options.store ??
      new QdrantMemoryStore({
        collection: options.collection ?? DEFAULT_PERSISTENCE_COLLECTION,
        url: options.url,
        apiKey: options.apiKey,
      });
    this.agentNamespace = options.agentNamespace ?? 'persistence:agents';
    this.taskNamespace = options.taskNamespace ?? 'persistence:tasks';
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.store.initialize();
    this.initialized = true;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private async listNamespace<T>(namespace: string): Promise<T[]> {
    await this.ensureInitialized();

    if (typeof (this.store as any).listAll === 'function') {
      const entries = await (this.store as any).listAll({ namespace });
      return entries.map((entry: any) => entry.value as T);
    }

    if (this.store.list) {
      const entries = await this.store.list({ namespace, limit: 1000 });
      return entries.map((entry: any) => entry.value as T);
    }

    return [];
  }

  // Agent operations
  async saveAgent(agent: PersistedAgent): Promise<void> {
    await this.ensureInitialized();
    await this.store.store(agent.id, agent, { namespace: this.agentNamespace });
  }

  async getAgent(id: string): Promise<PersistedAgent | null> {
    await this.ensureInitialized();
    const agent = await this.store.retrieve(id, { namespace: this.agentNamespace });
    return (agent as PersistedAgent) ?? null;
  }

  async getActiveAgents(): Promise<PersistedAgent[]> {
    const agents = await this.listNamespace<PersistedAgent>(this.agentNamespace);
    return agents.filter((a) => a.status === 'active' || a.status === 'idle');
  }

  async getAllAgents(): Promise<PersistedAgent[]> {
    return await this.listNamespace<PersistedAgent>(this.agentNamespace);
  }

  async updateAgentStatus(id: string, status: string): Promise<void> {
    const agent = await this.getAgent(id);
    if (agent) {
      agent.status = status;
      await this.saveAgent(agent);
    }
  }

  // Task operations
  async saveTask(task: PersistedTask): Promise<void> {
    await this.ensureInitialized();
    await this.store.store(task.id, task, { namespace: this.taskNamespace });
  }

  async getTask(id: string): Promise<PersistedTask | null> {
    await this.ensureInitialized();
    const task = await this.store.retrieve(id, { namespace: this.taskNamespace });
    return (task as PersistedTask) ?? null;
  }

  async getActiveTasks(): Promise<PersistedTask[]> {
    const tasks = await this.listNamespace<PersistedTask>(this.taskNamespace);
    return tasks.filter(
      (t) => t.status === 'pending' || t.status === 'in_progress' || t.status === 'assigned',
    );
  }

  async getAllTasks(): Promise<PersistedTask[]> {
    return await this.listNamespace<PersistedTask>(this.taskNamespace);
  }

  async updateTaskStatus(id: string, status: string, assignedAgent?: string): Promise<void> {
    const task = await this.getTask(id);
    if (task) {
      task.status = status;
      if (assignedAgent !== undefined) {
        task.assignedAgent = assignedAgent;
      }
      if (status === 'completed') {
        task.completedAt = Date.now();
      }
      await this.saveTask(task);
    }
  }

  async updateTaskProgress(id: string, progress: number): Promise<void> {
    const task = await this.getTask(id);
    if (task) {
      task.progress = progress;
      await this.saveTask(task);
    }
  }

  // Statistics
  async getStats(): Promise<{
    totalAgents: number;
    activeAgents: number;
    totalTasks: number;
    pendingTasks: number;
    completedTasks: number;
  }> {
    const agents = await this.getAllAgents();
    const tasks = await this.getAllTasks();

    const activeAgents = agents.filter((a) => a.status === 'active' || a.status === 'idle').length;
    const pendingTasks = tasks.filter(
      (t) => t.status === 'pending' || t.status === 'in_progress' || t.status === 'assigned',
    ).length;
    const completedTasks = tasks.filter((t) => t.status === 'completed').length;

    return {
      totalAgents: agents.length,
      activeAgents,
      totalTasks: tasks.length,
      pendingTasks,
      completedTasks,
    };
  }

  close(): void {
    if (this.store.close) {
      this.store.close();
    }
  }
}
