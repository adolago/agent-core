/**
 * Session Module - Persistence Layer
 *
 * Handles session storage, restoration, and cross-session context.
 * Supports multiple backends (memory, file, database).
 *
 * Key Features:
 * - Session save/restore
 * - Message and part persistence
 * - Cross-session context preservation
 * - Session summarization for compaction
 * - Export/import capabilities
 */

import { EventEmitter } from 'events';
import type {
  SessionInfo,
  Message,
  MessagePart,
  MessageWithParts,
} from './types';

// =============================================================================
// Storage Backend Interface
// =============================================================================

export interface IStorageBackend {
  /** Initialize the storage backend */
  initialize(): Promise<void>;

  /** Close the storage backend */
  close(): Promise<void>;

  /** Write data to storage */
  write<T>(key: string[], data: T): Promise<void>;

  /** Read data from storage */
  read<T>(key: string[]): Promise<T | null>;

  /** Delete data from storage */
  delete(key: string[]): Promise<void>;

  /** List keys matching a prefix */
  list(prefix: string[]): Promise<string[][]>;

  /** Check if a key exists */
  exists(key: string[]): Promise<boolean>;

  /** Update data with a modifier function */
  update<T>(key: string[], modifier: (current: T) => T): Promise<T>;
}

// =============================================================================
// Memory Storage Backend
// =============================================================================

export class MemoryStorageBackend implements IStorageBackend {
  private readonly store = new Map<string, unknown>();

  async initialize(): Promise<void> {
    // No initialization needed for memory storage
  }

  async close(): Promise<void> {
    this.store.clear();
  }

  private keyToString(key: string[]): string {
    return key.join(':');
  }

  async write<T>(key: string[], data: T): Promise<void> {
    this.store.set(this.keyToString(key), structuredClone(data));
  }

  async read<T>(key: string[]): Promise<T | null> {
    const data = this.store.get(this.keyToString(key));
    return data ? structuredClone(data as T) : null;
  }

  async delete(key: string[]): Promise<void> {
    this.store.delete(this.keyToString(key));
  }

  async list(prefix: string[]): Promise<string[][]> {
    const prefixStr = this.keyToString(prefix);
    const results: string[][] = [];

    for (const key of this.store.keys()) {
      if (key.startsWith(prefixStr)) {
        results.push(key.split(':'));
      }
    }

    return results;
  }

  async exists(key: string[]): Promise<boolean> {
    return this.store.has(this.keyToString(key));
  }

  async update<T>(key: string[], modifier: (current: T) => T): Promise<T> {
    const current = await this.read<T>(key);
    if (current === null) {
      throw new Error(`Key not found: ${this.keyToString(key)}`);
    }
    const updated = modifier(current);
    await this.write(key, updated);
    return updated;
  }
}

// =============================================================================
// Session Persistence Manager
// =============================================================================

export interface PersistenceConfig {
  backend: IStorageBackend;
  projectId: string;
}

export class SessionPersistence {
  private readonly backend: IStorageBackend;
  private readonly projectId: string;
  private readonly emitter = new EventEmitter();

  constructor(config: PersistenceConfig) {
    this.backend = config.backend;
    this.projectId = config.projectId;
  }

  // -------------------------------------------------------------------------
  // Session Operations
  // -------------------------------------------------------------------------

  async saveSession(session: SessionInfo): Promise<void> {
    const key = ['session', this.projectId, session.id];
    await this.backend.write(key, session);
    this.emitter.emit('session-saved', session);
  }

  async loadSession(sessionId: string): Promise<SessionInfo | null> {
    const key = ['session', this.projectId, sessionId];
    return this.backend.read<SessionInfo>(key);
  }

  async deleteSession(sessionId: string): Promise<void> {
    // Delete all messages first
    const messageKeys = await this.backend.list(['message', sessionId]);
    for (const messageKey of messageKeys) {
      const messageId = messageKey[messageKey.length - 1];
      await this.deleteMessage(sessionId, messageId);
    }

    // Delete session
    const key = ['session', this.projectId, sessionId];
    await this.backend.delete(key);
    this.emitter.emit('session-deleted', sessionId);
  }

  async updateSession(
    sessionId: string,
    modifier: (session: SessionInfo) => SessionInfo,
  ): Promise<SessionInfo> {
    const key = ['session', this.projectId, sessionId];
    const updated = await this.backend.update(key, modifier);
    this.emitter.emit('session-updated', updated);
    return updated;
  }

  async *listSessions(): AsyncGenerator<SessionInfo> {
    const keys = await this.backend.list(['session', this.projectId]);
    for (const key of keys) {
      const session = await this.backend.read<SessionInfo>(key);
      if (session) {
        yield session;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Message Operations
  // -------------------------------------------------------------------------

  async saveMessage(message: Message): Promise<void> {
    const key = ['message', message.sessionId, message.id];
    await this.backend.write(key, message);
    this.emitter.emit('message-saved', message);
  }

  async loadMessage(sessionId: string, messageId: string): Promise<Message | null> {
    const key = ['message', sessionId, messageId];
    return this.backend.read<Message>(key);
  }

  async deleteMessage(sessionId: string, messageId: string): Promise<void> {
    // Delete all parts first
    const partKeys = await this.backend.list(['part', messageId]);
    for (const partKey of partKeys) {
      await this.backend.delete(partKey);
    }

    // Delete message
    const key = ['message', sessionId, messageId];
    await this.backend.delete(key);
    this.emitter.emit('message-deleted', { sessionId, messageId });
  }

  async *listMessages(sessionId: string): AsyncGenerator<Message> {
    const keys = await this.backend.list(['message', sessionId]);
    // Sort by message ID (ascending order)
    keys.sort((a, b) => a[a.length - 1].localeCompare(b[b.length - 1]));

    for (const key of keys) {
      const message = await this.backend.read<Message>(key);
      if (message) {
        yield message;
      }
    }
  }

  async loadMessageWithParts(sessionId: string, messageId: string): Promise<MessageWithParts | null> {
    const message = await this.loadMessage(sessionId, messageId);
    if (!message) return null;

    const parts: MessagePart[] = [];
    for await (const part of this.listParts(messageId)) {
      parts.push(part);
    }

    return { info: message, parts };
  }

  async *loadAllMessagesWithParts(sessionId: string): AsyncGenerator<MessageWithParts> {
    for await (const message of this.listMessages(sessionId)) {
      const parts: MessagePart[] = [];
      for await (const part of this.listParts(message.id)) {
        parts.push(part);
      }
      yield { info: message, parts };
    }
  }

  // -------------------------------------------------------------------------
  // Part Operations
  // -------------------------------------------------------------------------

  async savePart(part: MessagePart): Promise<void> {
    const key = ['part', part.messageId, part.id];
    await this.backend.write(key, part);
    this.emitter.emit('part-saved', part);
  }

  async loadPart(messageId: string, partId: string): Promise<MessagePart | null> {
    const key = ['part', messageId, partId];
    return this.backend.read<MessagePart>(key);
  }

  async deletePart(messageId: string, partId: string): Promise<void> {
    const key = ['part', messageId, partId];
    await this.backend.delete(key);
    this.emitter.emit('part-deleted', { messageId, partId });
  }

  async *listParts(messageId: string): AsyncGenerator<MessagePart> {
    const keys = await this.backend.list(['part', messageId]);
    // Sort by part ID (ascending order)
    keys.sort((a, b) => a[a.length - 1].localeCompare(b[b.length - 1]));

    for (const key of keys) {
      const part = await this.backend.read<MessagePart>(key);
      if (part) {
        yield part;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Cross-Session Context
  // -------------------------------------------------------------------------

  async saveContext(sessionId: string, context: Record<string, unknown>): Promise<void> {
    const key = ['context', sessionId];
    await this.backend.write(key, context);
  }

  async loadContext(sessionId: string): Promise<Record<string, unknown> | null> {
    const key = ['context', sessionId];
    return this.backend.read<Record<string, unknown>>(key);
  }

  async mergeContext(
    sessionId: string,
    updates: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const existing = await this.loadContext(sessionId) ?? {};
    const merged = { ...existing, ...updates };
    await this.saveContext(sessionId, merged);
    return merged;
  }

  // -------------------------------------------------------------------------
  // Session Summarization
  // -------------------------------------------------------------------------

  async saveSummary(sessionId: string, summary: SessionSummary): Promise<void> {
    const key = ['summary', sessionId];
    await this.backend.write(key, summary);
  }

  async loadSummary(sessionId: string): Promise<SessionSummary | null> {
    const key = ['summary', sessionId];
    return this.backend.read<SessionSummary>(key);
  }

  // -------------------------------------------------------------------------
  // Export/Import
  // -------------------------------------------------------------------------

  async exportSession(sessionId: string): Promise<SessionExport> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const messages: MessageWithParts[] = [];
    for await (const msg of this.loadAllMessagesWithParts(sessionId)) {
      messages.push(msg);
    }

    const context = await this.loadContext(sessionId);
    const summary = await this.loadSummary(sessionId);

    return {
      version: '1.0',
      exportedAt: Date.now(),
      session,
      messages,
      context,
      summary,
    };
  }

  async importSession(data: SessionExport, options?: ImportOptions): Promise<SessionInfo> {
    const session = {
      ...data.session,
      id: options?.newSessionId ?? data.session.id,
      time: {
        ...data.session.time,
        created: options?.preserveTimestamps ? data.session.time.created : Date.now(),
        updated: Date.now(),
      },
    };

    await this.saveSession(session);

    for (const msg of data.messages) {
      const message = {
        ...msg.info,
        sessionId: session.id,
      };
      await this.saveMessage(message);

      for (const part of msg.parts) {
        const updatedPart = {
          ...part,
          sessionId: session.id,
        };
        await this.savePart(updatedPart);
      }
    }

    if (data.context) {
      await this.saveContext(session.id, data.context);
    }

    if (data.summary) {
      await this.saveSummary(session.id, data.summary);
    }

    return session;
  }

  // -------------------------------------------------------------------------
  // Event Handling
  // -------------------------------------------------------------------------

  on(
    event: 'session-saved' | 'session-updated' | 'session-deleted' | 'message-saved' | 'message-deleted' | 'part-saved' | 'part-deleted',
    handler: (data: unknown) => void,
  ): void {
    this.emitter.on(event, handler);
  }

  off(
    event: 'session-saved' | 'session-updated' | 'session-deleted' | 'message-saved' | 'message-deleted' | 'part-saved' | 'part-deleted',
    handler: (data: unknown) => void,
  ): void {
    this.emitter.off(event, handler);
  }
}

// =============================================================================
// Types
// =============================================================================

export interface SessionSummary {
  /** Title generated from conversation */
  title: string;
  /** Brief summary of conversation */
  body: string;
  /** Key topics discussed */
  topics: string[];
  /** Files modified */
  filesModified: string[];
  /** Token usage summary */
  tokens: {
    total: number;
    input: number;
    output: number;
  };
  /** Total cost */
  cost: number;
  /** Summary generation timestamp */
  generatedAt: number;
}

export interface SessionExport {
  /** Export format version */
  version: string;
  /** Export timestamp */
  exportedAt: number;
  /** Session metadata */
  session: SessionInfo;
  /** All messages with parts */
  messages: MessageWithParts[];
  /** Cross-session context */
  context: Record<string, unknown> | null;
  /** Session summary */
  summary: SessionSummary | null;
}

export interface ImportOptions {
  /** Generate a new session ID */
  newSessionId?: string;
  /** Preserve original timestamps */
  preserveTimestamps?: boolean;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a persistence manager with the specified backend.
 */
export function createPersistence(config: PersistenceConfig): SessionPersistence {
  return new SessionPersistence(config);
}

/**
 * Create a memory storage backend.
 */
export function createMemoryBackend(): IStorageBackend {
  return new MemoryStorageBackend();
}
