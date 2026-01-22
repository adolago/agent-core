/**
 * Qdrant adapter for tiara coordination storage.
 * Migrates tiara's SQLite-based storage to Qdrant for unified memory.
 *
 * Uses Qdrant REST API directly - no additional dependencies beyond fetch.
 */

import { nanoid } from 'nanoid';
import type {
  SwarmRecord,
  AgentRecord,
  TaskRecord,
  MetricRecord,
  EventRecord,
} from '../api/database-service.js';

// =============================================================================
// Configuration
// =============================================================================

export interface QdrantConfig {
  url: string;
  apiKey?: string;
  collections: {
    coordination: string;
    events: string;
    patterns: string;
    memory: string;
  };
  embeddingDimension: number;
}

export const DEFAULT_QDRANT_CONFIG: QdrantConfig = {
  url: 'http://localhost:6333',
  collections: {
    coordination: 'tiara_coordination',
    events: 'tiara_events',
    patterns: 'tiara_patterns',
    memory: 'tiara_memory',
  },
  embeddingDimension: 384, // Default for local embeddings
};

// =============================================================================
// Types
// =============================================================================

type QdrantCondition = {
  key?: string;
  match?: { value: string | number | boolean };
  range?: { lt?: number; gt?: number; lte?: number; gte?: number };
  is_null?: { key: string };
  should?: QdrantCondition[];
};

type QdrantFilter = {
  must?: QdrantCondition[];
  should?: QdrantCondition[];
  must_not?: QdrantCondition[];
};

type QdrantSearchResult = {
  id: string;
  score: number;
  payload: Record<string, unknown>;
  vector?: number[];
};

type QdrantScrollResult = {
  points: Array<{
    id: string;
    payload: Record<string, unknown>;
    vector?: number[];
  }>;
  next_page_offset?: string | number | null;
};

/** Entity types stored in coordination collection */
export type CoordinationEntityType = 'swarm' | 'agent' | 'task' | 'resource' | 'assignment';

/** Memory entry for key-value storage */
export interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  namespace: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  accessedAt: number;
  accessCount: number;
  ttl?: number;
  expiresAt?: number;
}

/** Pattern entry for learned behaviors */
export interface PatternEntry {
  id: string;
  patternType: 'code' | 'error' | 'behavior' | 'success';
  content: string;
  context: Record<string, unknown>;
  effectiveness: number;
  occurrences: number;
  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// Qdrant Coordination Adapter
// =============================================================================

/**
 * Qdrant-based storage adapter for tiara coordination.
 * Replaces SQLite storage with Qdrant vector database.
 */
export class QdrantCoordinationAdapter {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly collections: QdrantConfig['collections'];
  private readonly embeddingDimension: number;
  private initialized = false;

  constructor(config: Partial<QdrantConfig> = {}) {
    const fullConfig = { ...DEFAULT_QDRANT_CONFIG, ...config };
    this.baseUrl = fullConfig.url.replace(/\/$/, '');
    this.apiKey = fullConfig.apiKey;
    this.collections = { ...DEFAULT_QDRANT_CONFIG.collections, ...config.collections };
    this.embeddingDimension = fullConfig.embeddingDimension;
  }

  // ===========================================================================
  // Low-level Qdrant API
  // ===========================================================================

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['api-key'] = this.apiKey;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Qdrant ${method} ${path} failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return (data as { result?: T }).result ?? (data as T);
  }

  private async collectionExists(name: string): Promise<boolean> {
    try {
      await this.request('GET', `/collections/${name}`);
      return true;
    } catch {
      return false;
    }
  }

  private async ensureCollection(name: string, indexes: Array<{ field: string; schema: unknown }>): Promise<void> {
    const exists = await this.collectionExists(name);
    if (exists) return;

    await this.request('PUT', `/collections/${name}`, {
      vectors: {
        size: this.embeddingDimension,
        distance: 'Cosine',
      },
    });

    // Create payload indexes
    for (const { field, schema } of indexes) {
      try {
        await this.request('PUT', `/collections/${name}/index`, {
          field_name: field,
          field_schema: schema,
        });
      } catch (e) {
        // Index might already exist
        console.warn(`Failed to create index ${field} on ${name}:`, e);
      }
    }
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create coordination collection
    await this.ensureCollection(this.collections.coordination, [
      { field: 'entityType', schema: 'keyword' },
      { field: 'status', schema: 'keyword' },
      { field: 'swarmId', schema: 'keyword' },
      { field: 'agentId', schema: 'keyword' },
      { field: 'createdAt', schema: { type: 'integer', lookup: true, range: true } },
      { field: 'updatedAt', schema: { type: 'integer', lookup: true, range: true } },
    ]);

    // Create events collection
    await this.ensureCollection(this.collections.events, [
      { field: 'severity', schema: 'keyword' },
      { field: 'eventType', schema: 'keyword' },
      { field: 'swarmId', schema: 'keyword' },
      { field: 'agentId', schema: 'keyword' },
      { field: 'createdAt', schema: { type: 'integer', lookup: true, range: true } },
    ]);

    // Create patterns collection
    await this.ensureCollection(this.collections.patterns, [
      { field: 'patternType', schema: 'keyword' },
      { field: 'effectiveness', schema: { type: 'float', lookup: true, range: true } },
      { field: 'occurrences', schema: { type: 'integer', lookup: true, range: true } },
      { field: 'createdAt', schema: { type: 'integer', lookup: true, range: true } },
    ]);

    // Create memory collection
    await this.ensureCollection(this.collections.memory, [
      { field: 'namespace', schema: 'keyword' },
      { field: 'key', schema: 'keyword' },
      { field: 'expiresAt', schema: { type: 'integer', lookup: true, range: true } },
      { field: 'accessedAt', schema: { type: 'integer', lookup: true, range: true } },
    ]);

    this.initialized = true;
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /** Generate a deterministic UUID from a string (for fixed-ID points) */
  private stringToUuid(str: string): string {
    // Simple hash-based UUID generation
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    return `${hex.slice(0, 8)}-${hex.slice(0, 4)}-4${hex.slice(1, 4)}-8${hex.slice(0, 3)}-${hex.padEnd(12, '0').slice(0, 12)}`;
  }

  /** Create a zero vector for non-semantic storage */
  private zeroVector(): number[] {
    return new Array(this.embeddingDimension).fill(0);
  }

  /** Upsert a point to a collection */
  private async upsert(
    collection: string,
    id: string,
    payload: Record<string, unknown>,
    vector?: number[]
  ): Promise<void> {
    await this.request('PUT', `/collections/${collection}/points`, {
      points: [
        {
          id,
          vector: vector ?? this.zeroVector(),
          payload,
        },
      ],
    });
  }

  /** Get a point by ID */
  private async getPoint(collection: string, id: string): Promise<Record<string, unknown> | null> {
    try {
      const result = await this.request<{ id: string; payload: Record<string, unknown> }[]>(
        'POST',
        `/collections/${collection}/points`,
        { ids: [id], with_payload: true }
      );
      return result[0]?.payload ?? null;
    } catch {
      return null;
    }
  }

  /** Delete points by IDs */
  private async deletePoints(collection: string, ids: string[]): Promise<void> {
    await this.request('POST', `/collections/${collection}/points/delete`, {
      points: ids,
    });
  }

  /** Search with filter */
  private async search(
    collection: string,
    vector: number[],
    filter?: QdrantFilter,
    limit = 10
  ): Promise<QdrantSearchResult[]> {
    return this.request<QdrantSearchResult[]>('POST', `/collections/${collection}/points/search`, {
      vector,
      filter,
      limit,
      with_payload: true,
    });
  }

  /** Scroll through points with filter */
  private async scroll(
    collection: string,
    filter?: QdrantFilter,
    limit = 100,
    offset?: string | number
  ): Promise<QdrantScrollResult> {
    return this.request<QdrantScrollResult>('POST', `/collections/${collection}/points/scroll`, {
      filter,
      limit,
      offset,
      with_payload: true,
    });
  }

  // ===========================================================================
  // Swarm Operations
  // ===========================================================================

  async createSwarm(swarm: Omit<SwarmRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = nanoid();
    const now = new Date();

    await this.upsert(this.collections.coordination, this.stringToUuid(id), {
      entityType: 'swarm',
      id,
      name: swarm.name,
      topology: swarm.topology,
      maxAgents: swarm.maxAgents,
      strategy: swarm.strategy,
      status: swarm.status,
      config: swarm.config ? JSON.stringify(swarm.config) : null,
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
      destroyedAt: swarm.destroyedAt?.getTime() ?? null,
    });

    return id;
  }

  async getSwarm(id: string): Promise<SwarmRecord | null> {
    const payload = await this.getPoint(this.collections.coordination, this.stringToUuid(id));
    if (!payload || payload.entityType !== 'swarm') return null;

    return this.payloadToSwarmRecord(payload);
  }

  async updateSwarmStatus(id: string, status: SwarmRecord['status']): Promise<void> {
    const existing = await this.getSwarm(id);
    if (!existing) throw new Error(`Swarm ${id} not found`);

    await this.upsert(this.collections.coordination, this.stringToUuid(id), {
      ...this.swarmRecordToPayload(existing),
      status,
      updatedAt: Date.now(),
      destroyedAt: status === 'destroyed' ? Date.now() : null,
    });
  }

  async deleteSwarm(id: string): Promise<void> {
    await this.deletePoints(this.collections.coordination, [this.stringToUuid(id)]);
  }

  async listSwarms(status?: SwarmRecord['status']): Promise<SwarmRecord[]> {
    const filter: QdrantFilter = {
      must: [{ key: 'entityType', match: { value: 'swarm' } }],
    };
    if (status) {
      filter.must!.push({ key: 'status', match: { value: status } });
    }

    const result = await this.scroll(this.collections.coordination, filter);
    return result.points.map((p) => this.payloadToSwarmRecord(p.payload));
  }

  private swarmRecordToPayload(swarm: SwarmRecord): Record<string, unknown> {
    return {
      entityType: 'swarm',
      id: swarm.id,
      name: swarm.name,
      topology: swarm.topology,
      maxAgents: swarm.maxAgents,
      strategy: swarm.strategy,
      status: swarm.status,
      config: swarm.config ? JSON.stringify(swarm.config) : null,
      createdAt: swarm.createdAt.getTime(),
      updatedAt: swarm.updatedAt.getTime(),
      destroyedAt: swarm.destroyedAt?.getTime() ?? null,
    };
  }

  private payloadToSwarmRecord(payload: Record<string, unknown>): SwarmRecord {
    return {
      id: payload.id as string,
      name: payload.name as string,
      topology: payload.topology as SwarmRecord['topology'],
      maxAgents: payload.maxAgents as number,
      strategy: payload.strategy as SwarmRecord['strategy'],
      status: payload.status as SwarmRecord['status'],
      config: payload.config ? JSON.parse(payload.config as string) : undefined,
      createdAt: new Date(payload.createdAt as number),
      updatedAt: new Date(payload.updatedAt as number),
      destroyedAt: payload.destroyedAt ? new Date(payload.destroyedAt as number) : undefined,
    };
  }

  // ===========================================================================
  // Agent Operations
  // ===========================================================================

  async createAgent(agent: Omit<AgentRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = nanoid();
    const now = new Date();

    await this.upsert(this.collections.coordination, this.stringToUuid(id), {
      entityType: 'agent',
      id,
      swarmId: agent.swarmId,
      type: agent.type,
      name: agent.name ?? null,
      status: agent.status,
      capabilities: agent.capabilities ? JSON.stringify(agent.capabilities) : null,
      config: agent.config ? JSON.stringify(agent.config) : null,
      metadata: agent.metadata ? JSON.stringify(agent.metadata) : null,
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
      terminatedAt: agent.terminatedAt?.getTime() ?? null,
    });

    return id;
  }

  async getAgent(id: string): Promise<AgentRecord | null> {
    const payload = await this.getPoint(this.collections.coordination, this.stringToUuid(id));
    if (!payload || payload.entityType !== 'agent') return null;

    return this.payloadToAgentRecord(payload);
  }

  async updateAgentStatus(id: string, status: AgentRecord['status']): Promise<void> {
    const existing = await this.getAgent(id);
    if (!existing) throw new Error(`Agent ${id} not found`);

    await this.upsert(this.collections.coordination, this.stringToUuid(id), {
      ...this.agentRecordToPayload(existing),
      status,
      updatedAt: Date.now(),
      terminatedAt: status === 'terminated' ? Date.now() : existing.terminatedAt?.getTime() ?? null,
    });
  }

  async getAgentsBySwarm(swarmId: string): Promise<AgentRecord[]> {
    const filter: QdrantFilter = {
      must: [
        { key: 'entityType', match: { value: 'agent' } },
        { key: 'swarmId', match: { value: swarmId } },
      ],
    };

    const result = await this.scroll(this.collections.coordination, filter);
    return result.points.map((p) => this.payloadToAgentRecord(p.payload));
  }

  async deleteAgent(id: string): Promise<void> {
    await this.deletePoints(this.collections.coordination, [this.stringToUuid(id)]);
  }

  private agentRecordToPayload(agent: AgentRecord): Record<string, unknown> {
    return {
      entityType: 'agent',
      id: agent.id,
      swarmId: agent.swarmId,
      type: agent.type,
      name: agent.name ?? null,
      status: agent.status,
      capabilities: agent.capabilities ? JSON.stringify(agent.capabilities) : null,
      config: agent.config ? JSON.stringify(agent.config) : null,
      metadata: agent.metadata ? JSON.stringify(agent.metadata) : null,
      createdAt: agent.createdAt.getTime(),
      updatedAt: agent.updatedAt.getTime(),
      terminatedAt: agent.terminatedAt?.getTime() ?? null,
    };
  }

  private payloadToAgentRecord(payload: Record<string, unknown>): AgentRecord {
    return {
      id: payload.id as string,
      swarmId: payload.swarmId as string,
      type: payload.type as string,
      name: payload.name as string | undefined,
      status: payload.status as AgentRecord['status'],
      capabilities: payload.capabilities ? JSON.parse(payload.capabilities as string) : undefined,
      config: payload.config ? JSON.parse(payload.config as string) : undefined,
      metadata: payload.metadata ? JSON.parse(payload.metadata as string) : undefined,
      createdAt: new Date(payload.createdAt as number),
      updatedAt: new Date(payload.updatedAt as number),
      terminatedAt: payload.terminatedAt ? new Date(payload.terminatedAt as number) : undefined,
    };
  }

  // ===========================================================================
  // Task Operations
  // ===========================================================================

  async createTask(task: Omit<TaskRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = nanoid();
    const now = new Date();

    await this.upsert(this.collections.coordination, this.stringToUuid(id), {
      entityType: 'task',
      id,
      swarmId: task.swarmId,
      description: task.description,
      priority: task.priority,
      strategy: task.strategy,
      status: task.status,
      maxAgents: task.maxAgents ?? null,
      requirements: task.requirements ? JSON.stringify(task.requirements) : null,
      metadata: task.metadata ? JSON.stringify(task.metadata) : null,
      result: task.result ? JSON.stringify(task.result) : null,
      errorMessage: task.errorMessage ?? null,
      assignedTo: task.assignedTo ?? null,
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
      startedAt: task.startedAt?.getTime() ?? null,
      completedAt: task.completedAt?.getTime() ?? null,
    });

    return id;
  }

  async getTask(id: string): Promise<TaskRecord | null> {
    const payload = await this.getPoint(this.collections.coordination, this.stringToUuid(id));
    if (!payload || payload.entityType !== 'task') return null;

    return this.payloadToTaskRecord(payload);
  }

  async updateTaskStatus(
    id: string,
    status: TaskRecord['status'],
    result?: unknown,
    errorMessage?: string
  ): Promise<void> {
    const existing = await this.getTask(id);
    if (!existing) throw new Error(`Task ${id} not found`);

    const updates: Record<string, unknown> = {
      ...this.taskRecordToPayload(existing),
      status,
      updatedAt: Date.now(),
    };

    if (result !== undefined) {
      updates.result = JSON.stringify(result);
    }
    if (errorMessage !== undefined) {
      updates.errorMessage = errorMessage;
    }
    if (status === 'running' && !existing.startedAt) {
      updates.startedAt = Date.now();
    }
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      updates.completedAt = Date.now();
    }

    await this.upsert(this.collections.coordination, this.stringToUuid(id), updates);
  }

  async getTasksBySwarm(swarmId: string, status?: TaskRecord['status']): Promise<TaskRecord[]> {
    const filter: QdrantFilter = {
      must: [
        { key: 'entityType', match: { value: 'task' } },
        { key: 'swarmId', match: { value: swarmId } },
      ],
    };
    if (status) {
      filter.must!.push({ key: 'status', match: { value: status } });
    }

    const result = await this.scroll(this.collections.coordination, filter);
    return result.points.map((p) => this.payloadToTaskRecord(p.payload));
  }

  async searchTasks(query: string, embedding: number[], limit = 10): Promise<TaskRecord[]> {
    const filter: QdrantFilter = {
      must: [{ key: 'entityType', match: { value: 'task' } }],
    };

    const results = await this.search(this.collections.coordination, embedding, filter, limit);
    return results.map((r) => this.payloadToTaskRecord(r.payload));
  }

  async deleteTask(id: string): Promise<void> {
    await this.deletePoints(this.collections.coordination, [this.stringToUuid(id)]);
  }

  private taskRecordToPayload(task: TaskRecord): Record<string, unknown> {
    return {
      entityType: 'task',
      id: task.id,
      swarmId: task.swarmId,
      description: task.description,
      priority: task.priority,
      strategy: task.strategy,
      status: task.status,
      maxAgents: task.maxAgents ?? null,
      requirements: task.requirements ? JSON.stringify(task.requirements) : null,
      metadata: task.metadata ? JSON.stringify(task.metadata) : null,
      result: task.result ? JSON.stringify(task.result) : null,
      errorMessage: task.errorMessage ?? null,
      assignedTo: task.assignedTo ?? null,
      createdAt: task.createdAt.getTime(),
      updatedAt: task.updatedAt.getTime(),
      startedAt: task.startedAt?.getTime() ?? null,
      completedAt: task.completedAt?.getTime() ?? null,
    };
  }

  private payloadToTaskRecord(payload: Record<string, unknown>): TaskRecord {
    return {
      id: payload.id as string,
      swarmId: payload.swarmId as string,
      description: payload.description as string,
      priority: payload.priority as TaskRecord['priority'],
      strategy: payload.strategy as TaskRecord['strategy'],
      status: payload.status as TaskRecord['status'],
      maxAgents: payload.maxAgents as number | undefined,
      requirements: payload.requirements ? JSON.parse(payload.requirements as string) : undefined,
      metadata: payload.metadata ? JSON.parse(payload.metadata as string) : undefined,
      result: payload.result ? JSON.parse(payload.result as string) : undefined,
      errorMessage: payload.errorMessage as string | undefined,
      assignedTo: payload.assignedTo as string | undefined,
      createdAt: new Date(payload.createdAt as number),
      updatedAt: new Date(payload.updatedAt as number),
      startedAt: payload.startedAt ? new Date(payload.startedAt as number) : undefined,
      completedAt: payload.completedAt ? new Date(payload.completedAt as number) : undefined,
    };
  }

  // ===========================================================================
  // Event Logging
  // ===========================================================================

  async logEvent(event: Omit<EventRecord, 'id' | 'createdAt'>): Promise<string> {
    const id = nanoid();
    const now = new Date();

    await this.upsert(this.collections.events, this.stringToUuid(id), {
      id,
      swarmId: event.swarmId ?? null,
      agentId: event.agentId ?? null,
      eventType: event.eventType,
      eventName: event.eventName,
      eventData: event.eventData ? JSON.stringify(event.eventData) : null,
      severity: event.severity,
      createdAt: now.getTime(),
    });

    return id;
  }

  async getEvents(
    filters: {
      swarmId?: string;
      agentId?: string;
      severity?: EventRecord['severity'];
      eventType?: string;
      since?: Date;
    },
    limit = 100
  ): Promise<EventRecord[]> {
    const must: QdrantCondition[] = [];

    if (filters.swarmId) {
      must.push({ key: 'swarmId', match: { value: filters.swarmId } });
    }
    if (filters.agentId) {
      must.push({ key: 'agentId', match: { value: filters.agentId } });
    }
    if (filters.severity) {
      must.push({ key: 'severity', match: { value: filters.severity } });
    }
    if (filters.eventType) {
      must.push({ key: 'eventType', match: { value: filters.eventType } });
    }
    if (filters.since) {
      must.push({ key: 'createdAt', range: { gte: filters.since.getTime() } });
    }

    const result = await this.scroll(
      this.collections.events,
      must.length > 0 ? { must } : undefined,
      limit
    );

    return result.points.map((p) => ({
      id: p.payload.id as string,
      swarmId: p.payload.swarmId as string | undefined,
      agentId: p.payload.agentId as string | undefined,
      eventType: p.payload.eventType as string,
      eventName: p.payload.eventName as string,
      eventData: p.payload.eventData ? JSON.parse(p.payload.eventData as string) : undefined,
      severity: p.payload.severity as EventRecord['severity'],
      createdAt: new Date(p.payload.createdAt as number),
    }));
  }

  async searchEvents(query: string, embedding: number[], limit = 10): Promise<EventRecord[]> {
    const results = await this.search(this.collections.events, embedding, undefined, limit);

    return results.map((r) => ({
      id: r.payload.id as string,
      swarmId: r.payload.swarmId as string | undefined,
      agentId: r.payload.agentId as string | undefined,
      eventType: r.payload.eventType as string,
      eventName: r.payload.eventName as string,
      eventData: r.payload.eventData ? JSON.parse(r.payload.eventData as string) : undefined,
      severity: r.payload.severity as EventRecord['severity'],
      createdAt: new Date(r.payload.createdAt as number),
    }));
  }

  // ===========================================================================
  // Pattern Storage (for learned behaviors)
  // ===========================================================================

  async storePattern(
    pattern: Omit<PatternEntry, 'id' | 'createdAt' | 'updatedAt'>,
    embedding: number[]
  ): Promise<string> {
    const id = nanoid();
    const now = Date.now();

    await this.upsert(
      this.collections.patterns,
      this.stringToUuid(id),
      {
        id,
        patternType: pattern.patternType,
        content: pattern.content,
        context: JSON.stringify(pattern.context),
        effectiveness: pattern.effectiveness,
        occurrences: pattern.occurrences,
        createdAt: now,
        updatedAt: now,
      },
      embedding
    );

    return id;
  }

  async searchSimilarPatterns(embedding: number[], limit = 10): Promise<PatternEntry[]> {
    const results = await this.search(this.collections.patterns, embedding, undefined, limit);

    return results.map((r) => ({
      id: r.payload.id as string,
      patternType: r.payload.patternType as PatternEntry['patternType'],
      content: r.payload.content as string,
      context: JSON.parse(r.payload.context as string),
      effectiveness: r.payload.effectiveness as number,
      occurrences: r.payload.occurrences as number,
      createdAt: r.payload.createdAt as number,
      updatedAt: r.payload.updatedAt as number,
    }));
  }

  async updatePatternEffectiveness(id: string, effectiveness: number, incrementOccurrences = true): Promise<void> {
    const payload = await this.getPoint(this.collections.patterns, this.stringToUuid(id));
    if (!payload) throw new Error(`Pattern ${id} not found`);

    await this.upsert(this.collections.patterns, this.stringToUuid(id), {
      ...payload,
      effectiveness,
      occurrences: incrementOccurrences ? (payload.occurrences as number) + 1 : payload.occurrences,
      updatedAt: Date.now(),
    });
  }

  // ===========================================================================
  // Memory Storage (key-value with TTL)
  // ===========================================================================

  async memoryStore(
    key: string,
    value: string,
    namespace = 'default',
    options?: { ttl?: number; metadata?: Record<string, unknown> }
  ): Promise<void> {
    const now = Date.now();
    const id = `${namespace}:${key}`;

    const existing = await this.getPoint(this.collections.memory, this.stringToUuid(id));

    await this.upsert(this.collections.memory, this.stringToUuid(id), {
      id,
      key,
      value,
      namespace,
      metadata: options?.metadata ? JSON.stringify(options.metadata) : null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      accessedAt: now,
      accessCount: ((existing?.accessCount as number) ?? 0) + 1,
      ttl: options?.ttl ?? null,
      expiresAt: options?.ttl ? now + options.ttl * 1000 : null,
    });
  }

  async memoryGet(key: string, namespace = 'default'): Promise<MemoryEntry | null> {
    const id = `${namespace}:${key}`;
    const payload = await this.getPoint(this.collections.memory, this.stringToUuid(id));

    if (!payload) return null;

    // Check expiration
    if (payload.expiresAt && (payload.expiresAt as number) < Date.now()) {
      await this.deletePoints(this.collections.memory, [this.stringToUuid(id)]);
      return null;
    }

    // Update access time
    await this.upsert(this.collections.memory, this.stringToUuid(id), {
      ...payload,
      accessedAt: Date.now(),
      accessCount: (payload.accessCount as number) + 1,
    });

    return {
      id: payload.id as string,
      key: payload.key as string,
      value: payload.value as string,
      namespace: payload.namespace as string,
      metadata: payload.metadata ? JSON.parse(payload.metadata as string) : undefined,
      createdAt: payload.createdAt as number,
      updatedAt: payload.updatedAt as number,
      accessedAt: payload.accessedAt as number,
      accessCount: payload.accessCount as number,
      ttl: payload.ttl as number | undefined,
      expiresAt: payload.expiresAt as number | undefined,
    };
  }

  async memoryDelete(key: string, namespace = 'default'): Promise<void> {
    const id = `${namespace}:${key}`;
    await this.deletePoints(this.collections.memory, [this.stringToUuid(id)]);
  }

  async memoryList(namespace = 'default', limit = 100): Promise<MemoryEntry[]> {
    const now = Date.now();
    const filter: QdrantFilter = {
      must: [{ key: 'namespace', match: { value: namespace } }],
      should: [
        { is_null: { key: 'expiresAt' } },
        { key: 'expiresAt', range: { gt: now } },
      ],
    };

    const result = await this.scroll(this.collections.memory, filter, limit);

    return result.points.map((p) => ({
      id: p.payload.id as string,
      key: p.payload.key as string,
      value: p.payload.value as string,
      namespace: p.payload.namespace as string,
      metadata: p.payload.metadata ? JSON.parse(p.payload.metadata as string) : undefined,
      createdAt: p.payload.createdAt as number,
      updatedAt: p.payload.updatedAt as number,
      accessedAt: p.payload.accessedAt as number,
      accessCount: p.payload.accessCount as number,
      ttl: p.payload.ttl as number | undefined,
      expiresAt: p.payload.expiresAt as number | undefined,
    }));
  }

  async memoryCleanupExpired(): Promise<number> {
    const now = Date.now();
    const filter: QdrantFilter = {
      must: [{ key: 'expiresAt', range: { lt: now } }],
    };

    const result = await this.scroll(this.collections.memory, filter, 1000);
    if (result.points.length === 0) return 0;

    const ids = result.points.map((p) => this.stringToUuid(p.payload.id as string));
    await this.deletePoints(this.collections.memory, ids);

    return ids.length;
  }

  // ===========================================================================
  // Metrics (simple append-only storage)
  // ===========================================================================

  async recordMetric(metric: Omit<MetricRecord, 'id' | 'timestamp'>): Promise<string> {
    const id = nanoid();
    const now = new Date();

    // Store metrics in the events collection with a special type
    await this.upsert(this.collections.events, this.stringToUuid(id), {
      id,
      eventType: 'metric',
      eventName: metric.metricName,
      swarmId: metric.swarmId ?? null,
      agentId: metric.agentId ?? null,
      severity: 'info',
      eventData: JSON.stringify({
        metricType: metric.metricType,
        metricValue: metric.metricValue,
        unit: metric.unit,
        metadata: metric.metadata,
      }),
      createdAt: now.getTime(),
    });

    return id;
  }

  async getMetrics(
    filters: {
      swarmId?: string;
      agentId?: string;
      metricType?: string;
      since?: Date;
    },
    limit = 100
  ): Promise<MetricRecord[]> {
    const must: QdrantCondition[] = [{ key: 'eventType', match: { value: 'metric' } }];

    if (filters.swarmId) {
      must.push({ key: 'swarmId', match: { value: filters.swarmId } });
    }
    if (filters.agentId) {
      must.push({ key: 'agentId', match: { value: filters.agentId } });
    }
    if (filters.since) {
      must.push({ key: 'createdAt', range: { gte: filters.since.getTime() } });
    }

    const result = await this.scroll(this.collections.events, { must }, limit);

    return result.points
      .map((p) => {
        const data = JSON.parse(p.payload.eventData as string);
        if (filters.metricType && data.metricType !== filters.metricType) {
          return null;
        }
        return {
          id: p.payload.id as string,
          swarmId: p.payload.swarmId as string | undefined,
          agentId: p.payload.agentId as string | undefined,
          metricType: data.metricType,
          metricName: p.payload.eventName as string,
          metricValue: data.metricValue,
          unit: data.unit,
          timestamp: new Date(p.payload.createdAt as number),
          metadata: data.metadata,
        };
      })
      .filter((m): m is MetricRecord => m !== null);
  }

  // ===========================================================================
  // Cleanup & Maintenance
  // ===========================================================================

  async cleanup(): Promise<{ expired: number; oldEvents: number }> {
    const expired = await this.memoryCleanupExpired();

    // Clean up old events (older than 30 days)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const filter: QdrantFilter = {
      must: [{ key: 'createdAt', range: { lt: thirtyDaysAgo } }],
    };

    const result = await this.scroll(this.collections.events, filter, 1000);
    if (result.points.length > 0) {
      const ids = result.points.map((p) => this.stringToUuid(p.payload.id as string));
      await this.deletePoints(this.collections.events, ids);
    }

    return { expired, oldEvents: result.points.length };
  }
}

// Export singleton factory
let _adapter: QdrantCoordinationAdapter | null = null;

export function getQdrantAdapter(config?: Partial<QdrantConfig>): QdrantCoordinationAdapter {
  if (!_adapter) {
    _adapter = new QdrantCoordinationAdapter(config);
  }
  return _adapter;
}

export function resetQdrantAdapter(): void {
  _adapter = null;
}
