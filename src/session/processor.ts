/**
 * Session Module - Message Processor
 *
 * Handles the message processing loop for LLM interactions.
 * Manages the flow of:
 * 1. User message -> LLM request
 * 2. LLM stream processing
 * 3. Tool call execution
 * 4. Response aggregation
 *
 * Key Responsibilities:
 * - Stream processing with real-time updates
 * - Tool call orchestration
 * - Error handling and recovery
 * - Doom loop detection
 * - Step tracking and snapshots
 */

import { EventEmitter } from 'events';
import { isDeepEqual } from 'remeda';
import type {
  MessagePart,
  AssistantMessage,
  UserMessage,
  ToolPart,
  TextPart,
  ReasoningPart,
  StreamEvent,
} from './types';
import { SessionError } from './types';
import { generateId, calculateUsage, type ModelCost } from './session';
import type { RetryStrategy } from './retry';

// =============================================================================
// Processor Configuration
// =============================================================================

export interface ProcessorConfig {
  /** Maximum tool calls with identical arguments before doom loop detection */
  doomLoopThreshold: number;
  /** Permission mode for doom loop handling */
  doomLoopPermission: 'ask' | 'deny' | 'allow';
  /** Maximum output tokens */
  maxOutputTokens: number;
  /** Enable automatic tool output pruning */
  enablePruning: boolean;
}

const DEFAULT_CONFIG: ProcessorConfig = {
  doomLoopThreshold: 3,
  doomLoopPermission: 'deny',
  maxOutputTokens: 32_000,
  enablePruning: true,
};

// =============================================================================
// Stream Input
// =============================================================================

export interface StreamInput {
  /** User message that initiated this response */
  userMessage: UserMessage;
  /** Session identifier */
  sessionId: string;
  /** Model information */
  model: {
    id: string;
    providerId: string;
    cost: ModelCost;
  };
  /** Agent configuration */
  agent: {
    name: string;
    prompt?: string;
  };
  /** System prompts */
  system: string[];
  /** Abort signal for cancellation */
  abort: AbortSignal;
  /** Message history for context */
  messages: unknown[];
  /** Available tools */
  tools: Record<string, unknown>;
  /** Retry configuration */
  retry?: RetryStrategy;
}

// =============================================================================
// Processor Result
// =============================================================================

export type ProcessorResult = 'continue' | 'stop';

// =============================================================================
// Message Processor
// =============================================================================

/**
 * Processor for handling LLM message streams and tool execution.
 */
export class MessageProcessor {
  private readonly config: ProcessorConfig;
  private readonly emitter: EventEmitter;
  private readonly toolCalls: Map<string, ToolPart> = new Map();
  private snapshot: string | undefined;
  private blocked = false;
  private attempt = 0;

  constructor(
    private readonly assistantMessage: AssistantMessage,
    private readonly sessionId: string,
    private readonly modelCost: ModelCost,
    config: Partial<ProcessorConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.emitter = new EventEmitter();
  }

  /**
   * Get the current assistant message.
   */
  get message(): AssistantMessage {
    return this.assistantMessage;
  }

  /**
   * Get a tool part by call ID.
   */
  getToolPart(toolCallId: string): ToolPart | undefined {
    return this.toolCalls.get(toolCallId);
  }

  /**
   * Process a stream of LLM events.
   */
  async process(
    stream: AsyncIterable<StreamEvent>,
    callbacks: ProcessorCallbacks,
  ): Promise<ProcessorResult> {
    let currentText: TextPart | undefined;
    const reasoningMap: Map<string, ReasoningPart> = new Map();

    try {
      for await (const event of stream) {
        callbacks.abort?.throwIfAborted();

        switch (event.type) {
          case 'start':
            this.emitter.emit('status', { type: 'busy' });
            break;

          case 'reasoning-start':
            if (!reasoningMap.has(event.id)) {
              const part: ReasoningPart = {
                id: generateId('part'),
                messageId: this.assistantMessage.id,
                sessionId: this.sessionId,
                type: 'reasoning',
                text: '',
                time: { start: Date.now() },
                metadata: event.providerMetadata as Record<string, unknown>,
              };
              reasoningMap.set(event.id, part);
            }
            break;

          case 'reasoning-delta':
            {
              const part = reasoningMap.get(event.id);
              if (part) {
                part.text += event.text;
                if (event.providerMetadata) {
                  part.metadata = event.providerMetadata as Record<string, unknown>;
                }
                if (part.text) {
                  await callbacks.updatePart(part, event.text);
                }
              }
            }
            break;

          case 'reasoning-end':
            {
              const part = reasoningMap.get(event.id);
              if (part) {
                part.text = part.text.trimEnd();
                part.time.end = Date.now();
                if (event.providerMetadata) {
                  part.metadata = event.providerMetadata as Record<string, unknown>;
                }
                await callbacks.updatePart(part);
                reasoningMap.delete(event.id);
              }
            }
            break;

          case 'tool-input-start':
            {
              const existing = this.toolCalls.get(event.id);
              const part: ToolPart = {
                id: existing?.id ?? generateId('part'),
                messageId: this.assistantMessage.id,
                sessionId: this.sessionId,
                type: 'tool',
                tool: event.toolName,
                callId: event.id,
                state: {
                  status: 'pending',
                  input: {},
                  raw: '',
                },
              };
              this.toolCalls.set(event.id, part);
              await callbacks.updatePart(part);
            }
            break;

          case 'tool-call':
            {
              const part = this.toolCalls.get(event.toolCallId);
              if (part) {
                // Doom loop detection
                const isDoomLoop = await this.checkDoomLoop(
                  event.toolName,
                  event.input,
                  callbacks,
                );

                if (isDoomLoop) {
                  this.blocked = true;
                  part.state = {
                    status: 'error',
                    input: event.input as Record<string, unknown>,
                    error: 'Doom loop detected: tool called multiple times with identical arguments',
                    time: { start: Date.now(), end: Date.now() },
                  };
                  await callbacks.updatePart(part);
                  continue;
                }

                part.state = {
                  status: 'running',
                  input: event.input as Record<string, unknown>,
                  time: { start: Date.now() },
                };
                await callbacks.updatePart(part);
              }
            }
            break;

          case 'tool-result':
            {
              const part = this.toolCalls.get(event.toolCallId);
              if (part && part.state.status === 'running') {
                const output = event.output as { output: string; metadata?: Record<string, unknown>; title?: string };
                part.state = {
                  status: 'completed',
                  input: event.input as Record<string, unknown>,
                  output: output.output,
                  metadata: output.metadata ?? {},
                  title: output.title ?? '',
                  time: {
                    start: part.state.time.start,
                    end: Date.now(),
                  },
                };
                await callbacks.updatePart(part);
                this.toolCalls.delete(event.toolCallId);
              }
            }
            break;

          case 'tool-error':
            {
              const part = this.toolCalls.get(event.toolCallId);
              if (part && part.state.status === 'running') {
                const error = event.error as Error;
                part.state = {
                  status: 'error',
                  input: event.input as Record<string, unknown>,
                  error: error.message ?? String(error),
                  time: {
                    start: part.state.time.start,
                    end: Date.now(),
                  },
                };
                await callbacks.updatePart(part);
                this.toolCalls.delete(event.toolCallId);

                // Check if this is a permission rejection
                if (error.name === 'PermissionRejectedError') {
                  this.blocked = true;
                }
              }
            }
            break;

          case 'text-start':
            currentText = {
              id: generateId('part'),
              messageId: this.assistantMessage.id,
              sessionId: this.sessionId,
              type: 'text',
              text: '',
              time: { start: Date.now() },
            };
            break;

          case 'text-delta':
            if (currentText) {
              currentText.text += event.text;
              if (currentText.text) {
                await callbacks.updatePart(currentText, event.text);
              }
            }
            break;

          case 'text-end':
            if (currentText) {
              currentText.text = currentText.text.trimEnd();
              currentText.time = {
                start: currentText.time?.start ?? Date.now(),
                end: Date.now(),
              };
              await callbacks.updatePart(currentText);
              currentText = undefined;
            }
            break;

          case 'step-start':
            this.snapshot = await callbacks.createSnapshot?.();
            await callbacks.updatePart({
              id: generateId('part'),
              messageId: this.assistantMessage.id,
              sessionId: this.sessionId,
              type: 'step-start',
              snapshot: this.snapshot,
            });
            break;

          case 'step-finish':
            {
              const usage = calculateUsage(
                event.usage as { inputTokens?: number; outputTokens?: number; reasoningTokens?: number; cachedInputTokens?: number },
                this.modelCost,
                event.providerMetadata as Record<string, unknown>,
              );

              this.assistantMessage.finish = event.finishReason;
              this.assistantMessage.cost += usage.cost;
              this.assistantMessage.tokens = usage.tokens;

              const newSnapshot = await callbacks.createSnapshot?.();
              await callbacks.updatePart({
                id: generateId('part'),
                messageId: this.assistantMessage.id,
                sessionId: this.sessionId,
                type: 'step-finish',
                reason: event.finishReason,
                snapshot: newSnapshot,
                cost: usage.cost,
                tokens: usage.tokens,
              });

              await callbacks.updateMessage(this.assistantMessage);

              // Create diff if we have snapshots
              if (this.snapshot && newSnapshot) {
                await callbacks.createDiff?.(this.snapshot, newSnapshot);
              }
              this.snapshot = undefined;
            }
            break;

          case 'error':
            throw event.error;

          case 'finish':
            break;
        }
      }
    } catch (error) {
      return this.handleError(error as Error, callbacks);
    }

    // Finalize any incomplete tool calls
    await this.finalizeIncompleteParts(callbacks);

    this.assistantMessage.time.completed = Date.now();
    await callbacks.updateMessage(this.assistantMessage);

    if (this.blocked) return 'stop';
    if (this.assistantMessage.error) return 'stop';
    return 'continue';
  }

  /**
   * Check for doom loop (repeated identical tool calls).
   */
  private async checkDoomLoop(
    toolName: string,
    input: unknown,
    callbacks: ProcessorCallbacks,
  ): Promise<boolean> {
    if (this.config.doomLoopPermission === 'allow') {
      return false;
    }

    const recentParts = await callbacks.getRecentParts?.(this.config.doomLoopThreshold) ?? [];
    const identicalCalls = recentParts.filter(
      (p) =>
        p.type === 'tool' &&
        p.tool === toolName &&
        p.state.status !== 'pending' &&
        isDeepEqual(p.state.input, input),
    );

    if (identicalCalls.length >= this.config.doomLoopThreshold) {
      if (this.config.doomLoopPermission === 'ask') {
        const allowed = await callbacks.askPermission?.({
          type: 'doom_loop',
          tool: toolName,
          input,
          count: identicalCalls.length,
        });
        return !allowed;
      }
      return true; // deny
    }

    return false;
  }

  /**
   * Handle processing errors with retry logic.
   */
  private async handleError(
    error: Error,
    callbacks: ProcessorCallbacks,
  ): Promise<ProcessorResult> {
    const sessionError = this.classifyError(error);

    // Check if error is retryable
    if (sessionError.data?.isRetryable && callbacks.retry) {
      this.attempt++;
      const delay = callbacks.retry.getDelay(this.attempt, error);

      if (delay !== null) {
        this.emitter.emit('status', {
          type: 'retry',
          attempt: this.attempt,
          message: sessionError.message,
          nextRetryAt: Date.now() + delay,
        });

        await callbacks.retry.sleep(delay, callbacks.abort!);
        return 'continue'; // Retry
      }
    }

    // Non-retryable error
    this.assistantMessage.error = {
      name: sessionError.type,
      message: sessionError.message,
      data: sessionError.data,
    };

    this.emitter.emit('error', {
      sessionId: this.sessionId,
      error: this.assistantMessage.error,
    });

    return 'stop';
  }

  /**
   * Classify an error into a SessionError type.
   */
  private classifyError(error: Error): SessionError {
    if (error.name === 'AbortError') {
      return SessionError.aborted(error.message);
    }

    // Check for API errors
    if ('statusCode' in error) {
      const apiError = error as Error & { statusCode?: number; isRetryable?: boolean };
      return SessionError.apiError(
        error.message,
        apiError.statusCode,
        apiError.isRetryable ?? false,
      );
    }

    return new SessionError('unknown', error.message, undefined, error);
  }

  /**
   * Finalize any incomplete parts (e.g., aborted tool calls).
   */
  private async finalizeIncompleteParts(callbacks: ProcessorCallbacks): Promise<void> {
    for (const [_callId, part] of this.toolCalls) {
      if (part.state.status !== 'completed' && part.state.status !== 'error') {
        part.state = {
          status: 'error',
          input: 'input' in part.state ? part.state.input : {},
          error: 'Tool execution aborted',
          time: {
            start: 'time' in part.state ? part.state.time.start : Date.now(),
            end: Date.now(),
          },
        };
        await callbacks.updatePart(part);
      }
    }
    this.toolCalls.clear();
  }

  /**
   * Subscribe to processor events.
   */
  on(event: 'status' | 'error', handler: (payload: unknown) => void): void {
    this.emitter.on(event, handler);
  }

  /**
   * Unsubscribe from processor events.
   */
  off(event: 'status' | 'error', handler: (payload: unknown) => void): void {
    this.emitter.off(event, handler);
  }
}

// =============================================================================
// Processor Callbacks
// =============================================================================

/**
 * Callbacks for processor operations.
 */
export interface ProcessorCallbacks {
  /** Update a message part */
  updatePart(part: MessagePart, delta?: string): Promise<void>;
  /** Update the assistant message */
  updateMessage(message: AssistantMessage): Promise<void>;
  /** Create a snapshot for rollback */
  createSnapshot?(): Promise<string>;
  /** Create a diff between snapshots */
  createDiff?(from: string, to: string): Promise<void>;
  /** Get recent parts for doom loop detection */
  getRecentParts?(count: number): Promise<ToolPart[]>;
  /** Ask for permission */
  askPermission?(request: { type: string; tool: string; input: unknown; count: number }): Promise<boolean>;
  /** Abort signal */
  abort?: AbortSignal;
  /** Retry strategy */
  retry?: RetryStrategy;
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new message processor.
 */
export function createProcessor(
  assistantMessage: AssistantMessage,
  sessionId: string,
  modelCost: ModelCost,
  config?: Partial<ProcessorConfig>,
): MessageProcessor {
  return new MessageProcessor(assistantMessage, sessionId, modelCost, config);
}
