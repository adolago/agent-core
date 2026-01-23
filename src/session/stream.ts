/**
 * Session Module - Streaming Handler
 *
 * Provides streaming capabilities for LLM responses, tool execution,
 * and reasoning content. Supports both Server-Sent Events (SSE) and
 * WebSocket-based streaming.
 *
 * Key Features:
 * - Real-time text streaming with deltas
 * - Reasoning content streaming (for supported models)
 * - Tool call input streaming
 * - Backpressure handling
 * - Reconnection support
 */

import { EventEmitter } from 'events';
import type { StreamEvent, StreamEventType } from './types';

// =============================================================================
// Stream Configuration
// =============================================================================

export interface StreamConfig {
  /** Buffer size for backpressure handling */
  bufferSize: number;
  /** Enable automatic reconnection */
  autoReconnect: boolean;
  /** Maximum reconnection attempts */
  maxReconnectAttempts: number;
  /** Reconnection delay in milliseconds */
  reconnectDelay: number;
  /** Heartbeat interval for connection keep-alive */
  heartbeatInterval: number;
}

const DEFAULT_STREAM_CONFIG: StreamConfig = {
  bufferSize: 100,
  autoReconnect: true,
  maxReconnectAttempts: 3,
  reconnectDelay: 1000,
  heartbeatInterval: 30000,
};

// =============================================================================
// Stream State
// =============================================================================

export type StreamState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error';

// =============================================================================
// Stream Handler Interface
// =============================================================================

export interface IStreamHandler {
  /** Current stream state */
  readonly state: StreamState;

  /** Start streaming */
  start(): Promise<void>;

  /** Stop streaming */
  stop(): Promise<void>;

  /** Subscribe to stream events */
  on<T extends StreamEventType>(
    event: T,
    handler: (data: Extract<StreamEvent, { type: T }>) => void,
  ): void;

  /** Unsubscribe from stream events */
  off<T extends StreamEventType>(
    event: T,
    handler: (data: Extract<StreamEvent, { type: T }>) => void,
  ): void;

  /** Get the async iterator for the stream */
  [Symbol.asyncIterator](): AsyncIterator<StreamEvent>;
}

// =============================================================================
// Stream Handler Implementation
// =============================================================================

/**
 * Handler for streaming LLM responses and events.
 */
export class StreamHandler implements IStreamHandler {
  private readonly config: StreamConfig;
  private readonly emitter: EventEmitter;
  private readonly buffer: StreamEvent[] = [];
  private _state: StreamState = 'idle';
  private reconnectAttempts = 0;
  private abortController: AbortController | null = null;
  private resolvers: Array<{
    resolve: (value: IteratorResult<StreamEvent>) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(
    private readonly source: () => AsyncIterable<StreamEvent>,
    config: Partial<StreamConfig> = {},
  ) {
    this.config = { ...DEFAULT_STREAM_CONFIG, ...config };
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50);
  }

  get state(): StreamState {
    return this._state;
  }

  async start(): Promise<void> {
    if (this._state !== 'idle' && this._state !== 'closed') {
      return;
    }

    this._state = 'connecting';
    this.abortController = new AbortController();
    this.reconnectAttempts = 0;

    try {
      await this.connect();
    } catch (error) {
      this._state = 'error';
      this.emitter.emit('error', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this._state === 'closed' || this._state === 'idle') {
      return;
    }

    this.abortController?.abort();
    this._state = 'closed';

    // Resolve any pending iterators
    for (const resolver of this.resolvers) {
      resolver.resolve({ done: true, value: undefined });
    }
    this.resolvers = [];

    this.emitter.emit('close');
  }

  on<T extends StreamEventType>(
    event: T,
    handler: (data: Extract<StreamEvent, { type: T }>) => void,
  ): void {
    this.emitter.on(event, handler);
  }

  off<T extends StreamEventType>(
    event: T,
    handler: (data: Extract<StreamEvent, { type: T }>) => void,
  ): void {
    this.emitter.off(event, handler);
  }

  [Symbol.asyncIterator](): AsyncIterator<StreamEvent> {
    return {
      next: () => this.next(),
      return: async () => {
        await this.stop();
        return { done: true, value: undefined };
      },
      throw: async (error: Error) => {
        this._state = 'error';
        this.emitter.emit('error', error);
        return { done: true, value: undefined };
      },
    };
  }

  private async next(): Promise<IteratorResult<StreamEvent>> {
    // Return buffered event if available
    if (this.buffer.length > 0) {
      const buffered = this.buffer.shift();
      if (buffered) {
        return { done: false, value: buffered };
      }
    }

    // Check if stream is closed
    if (this._state === 'closed' || this._state === 'error') {
      return { done: true, value: undefined };
    }

    // Wait for next event
    return new Promise((resolve, reject) => {
      this.resolvers.push({ resolve, reject });
    });
  }

  private async connect(): Promise<void> {
    this._state = 'connected';
    this.emitter.emit('connect');

    try {
      for await (const event of this.source()) {
        if (this.abortController?.signal.aborted) {
          break;
        }

        // Emit event
        this.emitter.emit(event.type, event);
        this.emitter.emit('event', event);

        // Resolve pending iterator or buffer
        if (this.resolvers.length > 0) {
          const resolver = this.resolvers.shift();
          if (resolver) {
            resolver.resolve({ done: false, value: event });
          } else if (this.buffer.length < this.config.bufferSize) {
            this.buffer.push(event);
          } else {
            // Buffer full - apply backpressure
            this.emitter.emit('backpressure', { size: this.buffer.length });
          }
        } else if (this.buffer.length < this.config.bufferSize) {
          this.buffer.push(event);
        } else {
          // Buffer full - apply backpressure
          this.emitter.emit('backpressure', { size: this.buffer.length });
        }

        // Check for terminal events
        if (event.type === 'finish' || event.type === 'error') {
          break;
        }
      }

      // Stream completed normally
      this._state = 'closed';
      for (const resolver of this.resolvers) {
        resolver.resolve({ done: true, value: undefined });
      }
      this.resolvers = [];
      this.emitter.emit('complete');
    } catch (error) {
      if (this.config.autoReconnect && this.shouldReconnect(error as Error)) {
        await this.reconnect();
      } else {
        this._state = 'error';
        for (const resolver of this.resolvers) {
          resolver.reject(error as Error);
        }
        this.resolvers = [];
        this.emitter.emit('error', error);
        throw error;
      }
    }
  }

  private shouldReconnect(error: Error): boolean {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      return false;
    }

    // Check if error is recoverable
    const recoverableErrors = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'];
    if ('code' in error && recoverableErrors.includes(error.code as string)) {
      return true;
    }

    return false;
  }

  private async reconnect(): Promise<void> {
    this._state = 'reconnecting';
    this.reconnectAttempts++;

    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    this.emitter.emit('reconnecting', {
      attempt: this.reconnectAttempts,
      delay,
    });

    await new Promise((resolve) => setTimeout(resolve, delay));

    if (this.abortController?.signal.aborted) {
      return;
    }

    try {
      await this.connect();
    } catch (error) {
      if (this.shouldReconnect(error as Error)) {
        await this.reconnect();
      } else {
        throw error;
      }
    }
  }
}

// =============================================================================
// Text Stream Aggregator
// =============================================================================

/**
 * Aggregates text deltas into complete text.
 */
export class TextStreamAggregator {
  private text = '';
  private readonly emitter = new EventEmitter();

  constructor(private readonly stream: IStreamHandler) {
    this.stream.on('text-delta', this.handleDelta.bind(this));
    this.stream.on('text-end', this.handleEnd.bind(this));
  }

  private handleDelta(event: Extract<StreamEvent, { type: 'text-delta' }>): void {
    this.text += event.text;
    this.emitter.emit('delta', { text: event.text, accumulated: this.text });
  }

  private handleEnd(): void {
    this.emitter.emit('complete', { text: this.text });
  }

  get currentText(): string {
    return this.text;
  }

  on(event: 'delta' | 'complete', handler: (data: { text: string; accumulated?: string }) => void): void {
    this.emitter.on(event, handler);
  }

  off(event: 'delta' | 'complete', handler: (data: { text: string; accumulated?: string }) => void): void {
    this.emitter.off(event, handler);
  }
}

// =============================================================================
// Reasoning Stream Aggregator
// =============================================================================

/**
 * Aggregates reasoning content by ID.
 */
export class ReasoningStreamAggregator {
  private readonly reasonings = new Map<string, string>();
  private readonly emitter = new EventEmitter();

  constructor(private readonly stream: IStreamHandler) {
    this.stream.on('reasoning-start', this.handleStart.bind(this));
    this.stream.on('reasoning-delta', this.handleDelta.bind(this));
    this.stream.on('reasoning-end', this.handleEnd.bind(this));
  }

  private handleStart(event: Extract<StreamEvent, { type: 'reasoning-start' }>): void {
    this.reasonings.set(event.id, '');
    this.emitter.emit('start', { id: event.id });
  }

  private handleDelta(event: Extract<StreamEvent, { type: 'reasoning-delta' }>): void {
    const current = this.reasonings.get(event.id) ?? '';
    this.reasonings.set(event.id, current + event.text);
    this.emitter.emit('delta', {
      id: event.id,
      text: event.text,
      accumulated: this.reasonings.get(event.id),
    });
  }

  private handleEnd(event: Extract<StreamEvent, { type: 'reasoning-end' }>): void {
    const text = this.reasonings.get(event.id);
    this.emitter.emit('complete', { id: event.id, text });
  }

  getReasoning(id: string): string | undefined {
    return this.reasonings.get(id);
  }

  getAllReasonings(): Map<string, string> {
    return new Map(this.reasonings);
  }

  on(
    event: 'start' | 'delta' | 'complete',
    handler: (data: { id: string; text?: string; accumulated?: string }) => void,
  ): void {
    this.emitter.on(event, handler);
  }

  off(
    event: 'start' | 'delta' | 'complete',
    handler: (data: { id: string; text?: string; accumulated?: string }) => void,
  ): void {
    this.emitter.off(event, handler);
  }
}

// =============================================================================
// Tool Call Stream Aggregator
// =============================================================================

/**
 * Aggregates tool call inputs.
 */
export class ToolCallStreamAggregator {
  private readonly toolCalls = new Map<string, { name: string; input: string }>();
  private readonly emitter = new EventEmitter();

  constructor(private readonly stream: IStreamHandler) {
    this.stream.on('tool-input-start', this.handleStart.bind(this));
    this.stream.on('tool-input-delta', this.handleDelta.bind(this));
    this.stream.on('tool-input-end', this.handleEnd.bind(this));
    this.stream.on('tool-call', this.handleCall.bind(this));
    this.stream.on('tool-result', this.handleResult.bind(this));
    this.stream.on('tool-error', this.handleError.bind(this));
  }

  private handleStart(event: Extract<StreamEvent, { type: 'tool-input-start' }>): void {
    this.toolCalls.set(event.id, { name: event.toolName, input: '' });
    this.emitter.emit('start', { id: event.id, toolName: event.toolName });
  }

  private handleDelta(event: Extract<StreamEvent, { type: 'tool-input-delta' }>): void {
    const call = this.toolCalls.get(event.id);
    if (call) {
      call.input += event.delta;
      this.emitter.emit('delta', {
        id: event.id,
        delta: event.delta,
        accumulated: call.input,
      });
    }
  }

  private handleEnd(event: Extract<StreamEvent, { type: 'tool-input-end' }>): void {
    const call = this.toolCalls.get(event.id);
    if (call) {
      this.emitter.emit('input-complete', {
        id: event.id,
        toolName: call.name,
        input: call.input,
      });
    }
  }

  private handleCall(event: Extract<StreamEvent, { type: 'tool-call' }>): void {
    this.emitter.emit('call', {
      id: event.toolCallId,
      toolName: event.toolName,
      input: event.input,
    });
  }

  private handleResult(event: Extract<StreamEvent, { type: 'tool-result' }>): void {
    this.toolCalls.delete(event.toolCallId);
    this.emitter.emit('result', {
      id: event.toolCallId,
      input: event.input,
      output: event.output,
    });
  }

  private handleError(event: Extract<StreamEvent, { type: 'tool-error' }>): void {
    this.toolCalls.delete(event.toolCallId);
    this.emitter.emit('error', {
      id: event.toolCallId,
      input: event.input,
      error: event.error,
    });
  }

  getToolCall(id: string): { name: string; input: string } | undefined {
    return this.toolCalls.get(id);
  }

  on(
    event: 'start' | 'delta' | 'input-complete' | 'call' | 'result' | 'error',
    handler: (data: unknown) => void,
  ): void {
    this.emitter.on(event, handler);
  }

  off(
    event: 'start' | 'delta' | 'input-complete' | 'call' | 'result' | 'error',
    handler: (data: unknown) => void,
  ): void {
    this.emitter.off(event, handler);
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a stream handler from an async iterable source.
 */
export function createStreamHandler(
  source: () => AsyncIterable<StreamEvent>,
  config?: Partial<StreamConfig>,
): StreamHandler {
  return new StreamHandler(source, config);
}

/**
 * Create a combined stream with all aggregators.
 */
export function createAggregatedStream(
  source: () => AsyncIterable<StreamEvent>,
  config?: Partial<StreamConfig>,
): {
  stream: StreamHandler;
  text: TextStreamAggregator;
  reasoning: ReasoningStreamAggregator;
  toolCalls: ToolCallStreamAggregator;
} {
  const stream = createStreamHandler(source, config);
  return {
    stream,
    text: new TextStreamAggregator(stream),
    reasoning: new ReasoningStreamAggregator(stream),
    toolCalls: new ToolCallStreamAggregator(stream),
  };
}
