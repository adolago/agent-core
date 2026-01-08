/**
 * Session Module - Public API
 *
 * This module exports all public types and functions for session management.
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // Identifiers
  SessionId,
  MessageId,
  PartId,

  // Core types
  SessionInfo,
  SessionStatus,
  SessionConfig,
  ActiveContext,
  TokenUsage,

  // Messages
  Message,
  UserMessage,
  AssistantMessage,
  MessageWithParts,

  // Parts
  MessagePart,
  TextPart,
  ReasoningPart,
  ToolPart,
  ToolState,
  StepStartPart,
  StepFinishPart,
  FilePart,

  // Events
  SessionEvent,
  SessionEventType,
  StreamEvent,
  StreamEventType,

  // Errors
  SessionErrorType,
} from './types';

export { SessionError } from './types';

// =============================================================================
// Session Interface
// =============================================================================

export type {
  ISession,
  ISessionManager,
  SessionFactory,
  UsageMetrics,
  ModelCost,
} from './session';

export {
  createDefaultTitle,
  isDefaultTitle,
  generateId,
  generateDescendingId,
  calculateUsage,
} from './session';

// =============================================================================
// Processor
// =============================================================================

export type {
  ProcessorConfig,
  StreamInput,
  ProcessorResult,
  ProcessorCallbacks,
} from './processor';

export { MessageProcessor, createProcessor } from './processor';

// =============================================================================
// Streaming
// =============================================================================

export type {
  StreamConfig,
  StreamState,
  IStreamHandler,
} from './stream';

export {
  StreamHandler,
  TextStreamAggregator,
  ReasoningStreamAggregator,
  ToolCallStreamAggregator,
  createStreamHandler,
  createAggregatedStream,
} from './stream';

// =============================================================================
// Persistence
// =============================================================================

export type {
  IStorageBackend,
  PersistenceConfig,
  SessionSummary,
  SessionExport,
  ImportOptions,
} from './persistence';

export {
  MemoryStorageBackend,
  SessionPersistence,
  createPersistence,
  createMemoryBackend,
} from './persistence';

// =============================================================================
// Retry
// =============================================================================

export type {
  RetryConfig,
  RetryableErrorType,
  RetryHeaders,
  RetryStrategy,
  RetryOptions,
} from './retry';

export {
  DEFAULT_RETRY_CONFIG,
  RETRYABLE_ERRORS,
  classifyError,
  calculateDelay,
  DefaultRetryStrategy,
  withRetry,
  createRetryStrategy,
  createRateLimitRetryStrategy,
  createNetworkRetryStrategy,
} from './retry';
