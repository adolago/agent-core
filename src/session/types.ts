/**
 * Session Module - Core Types
 *
 * Defines the fundamental types for the session management system.
 * This module handles conversation state across all surfaces (CLI, API, SDK).
 */

import { z } from 'zod';

// =============================================================================
// Session Identifier Schemas
// =============================================================================

export const SessionId = z.string().brand<'SessionId'>();
export type SessionId = z.infer<typeof SessionId>;

export const MessageId = z.string().brand<'MessageId'>();
export type MessageId = z.infer<typeof MessageId>;

export const PartId = z.string().brand<'PartId'>();
export type PartId = z.infer<typeof PartId>;

// =============================================================================
// Session Status
// =============================================================================

export const SessionStatus = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('idle'),
  }),
  z.object({
    type: z.literal('busy'),
  }),
  z.object({
    type: z.literal('retry'),
    attempt: z.number().int().positive(),
    message: z.string(),
    nextRetryAt: z.number(), // Unix timestamp
  }),
  z.object({
    type: z.literal('error'),
    error: z.string(),
  }),
]);
export type SessionStatus = z.infer<typeof SessionStatus>;

// =============================================================================
// Token Usage
// =============================================================================

export const TokenUsage = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  reasoning: z.number().int().nonnegative().default(0),
  cache: z.object({
    read: z.number().int().nonnegative(),
    write: z.number().int().nonnegative(),
  }),
});
export type TokenUsage = z.infer<typeof TokenUsage>;

// =============================================================================
// Active Context
// =============================================================================

export const ActiveContext = z.object({
  /** Current working directory */
  cwd: z.string(),
  /** Project root directory */
  root: z.string(),
  /** Currently open/relevant files */
  openFiles: z.array(z.string()).default([]),
  /** User preferences for this session */
  preferences: z.record(z.string(), z.unknown()).default({}),
  /** Environment variables exposed to tools */
  environment: z.record(z.string(), z.string()).default({}),
});
export type ActiveContext = z.infer<typeof ActiveContext>;

// =============================================================================
// Message Parts
// =============================================================================

const PartBase = z.object({
  id: z.string(),
  sessionId: z.string(),
  messageId: z.string(),
});

export const TextPart = PartBase.extend({
  type: z.literal('text'),
  text: z.string(),
  synthetic: z.boolean().optional(),
  time: z.object({
    start: z.number(),
    end: z.number().optional(),
  }).optional(),
});
export type TextPart = z.infer<typeof TextPart>;

export const ReasoningPart = PartBase.extend({
  type: z.literal('reasoning'),
  text: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  time: z.object({
    start: z.number(),
    end: z.number().optional(),
  }),
});
export type ReasoningPart = z.infer<typeof ReasoningPart>;

export const ToolStatePending = z.object({
  status: z.literal('pending'),
  input: z.record(z.string(), z.unknown()),
  raw: z.string().optional(),
});

export const ToolStateRunning = z.object({
  status: z.literal('running'),
  input: z.record(z.string(), z.unknown()),
  title: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  time: z.object({
    start: z.number(),
  }),
});

export const ToolStateCompleted = z.object({
  status: z.literal('completed'),
  input: z.record(z.string(), z.unknown()),
  output: z.string(),
  title: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  time: z.object({
    start: z.number(),
    end: z.number(),
  }),
});

export const ToolStateError = z.object({
  status: z.literal('error'),
  input: z.record(z.string(), z.unknown()),
  error: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  time: z.object({
    start: z.number(),
    end: z.number(),
  }),
});

export const ToolState = z.discriminatedUnion('status', [
  ToolStatePending,
  ToolStateRunning,
  ToolStateCompleted,
  ToolStateError,
]);
export type ToolState = z.infer<typeof ToolState>;

export const ToolPart = PartBase.extend({
  type: z.literal('tool'),
  callId: z.string(),
  tool: z.string(),
  state: ToolState,
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ToolPart = z.infer<typeof ToolPart>;

export const StepStartPart = PartBase.extend({
  type: z.literal('step-start'),
  snapshot: z.string().optional(),
});
export type StepStartPart = z.infer<typeof StepStartPart>;

export const StepFinishPart = PartBase.extend({
  type: z.literal('step-finish'),
  reason: z.string(),
  snapshot: z.string().optional(),
  cost: z.number(),
  tokens: TokenUsage,
});
export type StepFinishPart = z.infer<typeof StepFinishPart>;

export const FilePart = PartBase.extend({
  type: z.literal('file'),
  mime: z.string(),
  filename: z.string().optional(),
  url: z.string(),
});
export type FilePart = z.infer<typeof FilePart>;

export const MessagePart = z.discriminatedUnion('type', [
  TextPart,
  ReasoningPart,
  ToolPart,
  StepStartPart,
  StepFinishPart,
  FilePart,
]);
export type MessagePart = z.infer<typeof MessagePart>;

// =============================================================================
// Messages
// =============================================================================

const MessageBase = z.object({
  id: z.string(),
  sessionId: z.string(),
});

export const UserMessage = MessageBase.extend({
  role: z.literal('user'),
  time: z.object({
    created: z.number(),
  }),
  agent: z.string(),
  model: z.object({
    providerId: z.string(),
    modelId: z.string(),
  }),
  system: z.string().optional(),
  tools: z.record(z.string(), z.boolean()).optional(),
});
export type UserMessage = z.infer<typeof UserMessage>;

export const AssistantMessage = MessageBase.extend({
  role: z.literal('assistant'),
  parentId: z.string(),
  time: z.object({
    created: z.number(),
    completed: z.number().optional(),
  }),
  agent: z.string(),
  modelId: z.string(),
  providerId: z.string(),
  path: z.object({
    cwd: z.string(),
    root: z.string(),
  }),
  cost: z.number(),
  tokens: TokenUsage,
  finish: z.string().optional(),
  error: z.object({
    name: z.string(),
    message: z.string(),
    data: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
});
export type AssistantMessage = z.infer<typeof AssistantMessage>;

export const Message = z.discriminatedUnion('role', [UserMessage, AssistantMessage]);
export type Message = z.infer<typeof Message>;

export const MessageWithParts = z.object({
  info: Message,
  parts: z.array(MessagePart),
});
export type MessageWithParts = z.infer<typeof MessageWithParts>;

// =============================================================================
// Session Info
// =============================================================================

export const SessionInfo = z.object({
  id: z.string(),
  projectId: z.string(),
  directory: z.string(),
  parentId: z.string().optional(),
  title: z.string(),
  version: z.string(),
  time: z.object({
    created: z.number(),
    updated: z.number(),
    archived: z.number().optional(),
  }),
  summary: z.object({
    additions: z.number(),
    deletions: z.number(),
    files: z.number(),
  }).optional(),
  context: ActiveContext.optional(),
});
export type SessionInfo = z.infer<typeof SessionInfo>;

// =============================================================================
// Session Events
// =============================================================================

export const SessionEventType = z.enum([
  'session.created',
  'session.updated',
  'session.deleted',
  'session.status',
  'session.error',
  'message.created',
  'message.updated',
  'message.deleted',
  'part.created',
  'part.updated',
  'part.deleted',
  'stream.start',
  'stream.delta',
  'stream.end',
]);
export type SessionEventType = z.infer<typeof SessionEventType>;

export const SessionEvent = z.object({
  type: SessionEventType,
  sessionId: z.string(),
  timestamp: z.number(),
  payload: z.unknown(),
});
export type SessionEvent = z.infer<typeof SessionEvent>;

// =============================================================================
// Stream Events
// =============================================================================

export const StreamEventType = z.enum([
  'start',
  'text-start',
  'text-delta',
  'text-end',
  'reasoning-start',
  'reasoning-delta',
  'reasoning-end',
  'tool-input-start',
  'tool-input-delta',
  'tool-input-end',
  'tool-call',
  'tool-result',
  'tool-error',
  'step-start',
  'step-finish',
  'finish',
  'error',
]);
export type StreamEventType = z.infer<typeof StreamEventType>;

export const StreamEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('text-start'), providerMetadata: z.unknown().optional() }),
  z.object({ type: z.literal('text-delta'), text: z.string(), providerMetadata: z.unknown().optional() }),
  z.object({ type: z.literal('text-end'), providerMetadata: z.unknown().optional() }),
  z.object({ type: z.literal('reasoning-start'), id: z.string(), providerMetadata: z.unknown().optional() }),
  z.object({ type: z.literal('reasoning-delta'), id: z.string(), text: z.string(), providerMetadata: z.unknown().optional() }),
  z.object({ type: z.literal('reasoning-end'), id: z.string(), providerMetadata: z.unknown().optional() }),
  z.object({ type: z.literal('tool-input-start'), id: z.string(), toolName: z.string() }),
  z.object({ type: z.literal('tool-input-delta'), id: z.string(), delta: z.string() }),
  z.object({ type: z.literal('tool-input-end'), id: z.string() }),
  z.object({ type: z.literal('tool-call'), toolCallId: z.string(), toolName: z.string(), input: z.unknown() }),
  z.object({ type: z.literal('tool-result'), toolCallId: z.string(), input: z.unknown(), output: z.unknown() }),
  z.object({ type: z.literal('tool-error'), toolCallId: z.string(), input: z.unknown(), error: z.unknown() }),
  z.object({ type: z.literal('step-start') }),
  z.object({ type: z.literal('step-finish'), finishReason: z.string(), usage: z.unknown(), providerMetadata: z.unknown().optional() }),
  z.object({ type: z.literal('finish') }),
  z.object({ type: z.literal('error'), error: z.unknown() }),
]);
export type StreamEvent = z.infer<typeof StreamEvent>;

// =============================================================================
// Error Types
// =============================================================================

export const SessionErrorType = z.enum([
  'session_busy',
  'session_not_found',
  'message_not_found',
  'provider_auth_error',
  'api_error',
  'output_length_error',
  'aborted',
  'unknown',
]);
export type SessionErrorType = z.infer<typeof SessionErrorType>;

export class SessionError extends Error {
  constructor(
    public readonly type: SessionErrorType,
    message: string,
    public readonly data?: Record<string, unknown>,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'SessionError';
  }

  static busy(sessionId: string): SessionError {
    return new SessionError('session_busy', `Session ${sessionId} is busy`);
  }

  static notFound(sessionId: string): SessionError {
    return new SessionError('session_not_found', `Session ${sessionId} not found`);
  }

  static apiError(message: string, statusCode?: number, isRetryable = false): SessionError {
    return new SessionError('api_error', message, { statusCode, isRetryable });
  }

  static aborted(message = 'Operation aborted'): SessionError {
    return new SessionError('aborted', message);
  }
}

// =============================================================================
// Configuration
// =============================================================================

export const SessionConfig = z.object({
  /** Maximum number of concurrent sessions per user */
  maxConcurrentSessions: z.number().int().positive().default(10),
  /** Session timeout in milliseconds */
  sessionTimeout: z.number().int().positive().default(30 * 60 * 1000), // 30 minutes
  /** Maximum message history to keep in memory */
  maxHistorySize: z.number().int().positive().default(100),
  /** Enable automatic session compaction */
  autoCompaction: z.boolean().default(true),
  /** Token threshold for triggering compaction */
  compactionThreshold: z.number().int().positive().default(100_000),
  /** Enable cross-session context preservation */
  crossSessionContext: z.boolean().default(true),
  /** Persistence configuration */
  persistence: z.object({
    enabled: z.boolean().default(true),
    backend: z.enum(['memory', 'file', 'database']).default('file'),
    path: z.string().optional(),
  }).default({}),
  /** Retry configuration */
  retry: z.object({
    maxAttempts: z.number().int().positive().default(5),
    initialDelay: z.number().int().positive().default(2000),
    maxDelay: z.number().int().positive().default(30000),
    backoffFactor: z.number().positive().default(2),
  }).default({}),
});
export type SessionConfig = z.infer<typeof SessionConfig>;
