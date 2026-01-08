/**
 * Transport Layer Types
 *
 * Abstractions for communication between components
 */

/** Transport message */
export interface TransportMessage<T = unknown> {
  id: string;
  type: string;
  payload: T;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/** Transport options */
export interface TransportOptions {
  /** Connection timeout in ms */
  timeout?: number;

  /** Retry configuration */
  retry?: {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
  };

  /** Heartbeat interval in ms */
  heartbeat?: number;

  /** Buffer size for backpressure */
  bufferSize?: number;
}

/** Transport interface */
export interface Transport {
  /** Connect to remote */
  connect(): Promise<void>;

  /** Disconnect from remote */
  disconnect(): Promise<void>;

  /** Send message */
  send<T>(message: TransportMessage<T>): Promise<void>;

  /** Receive messages */
  receive<T>(): AsyncIterable<TransportMessage<T>>;

  /** Request-response pattern */
  request<TReq, TRes>(
    type: string,
    payload: TReq,
    timeout?: number
  ): Promise<TRes>;

  /** Subscribe to message type */
  subscribe<T>(
    type: string,
    handler: (message: TransportMessage<T>) => void
  ): () => void;

  /** Connection state */
  readonly state: TransportState;

  /** State change events */
  onStateChange(handler: (state: TransportState) => void): () => void;
}

/** Transport states */
export type TransportState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

/** IPC transport for local process communication */
export interface IPCTransport extends Transport {
  /** Process handle */
  readonly process?: unknown;

  /** Send to specific channel */
  sendToChannel(channel: string, message: unknown): void;
}

/** WebSocket transport */
export interface WebSocketTransport extends Transport {
  /** WebSocket URL */
  readonly url: string;

  /** Send binary data */
  sendBinary(data: ArrayBuffer): Promise<void>;
}

/** HTTP transport */
export interface HTTPTransport extends Transport {
  /** Base URL */
  readonly baseUrl: string;

  /** HTTP methods */
  get<T>(path: string, options?: HTTPRequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, options?: HTTPRequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, options?: HTTPRequestOptions): Promise<T>;
  delete<T>(path: string, options?: HTTPRequestOptions): Promise<T>;

  /** Server-sent events */
  sse(path: string): AsyncIterable<unknown>;
}

/** HTTP request options */
export interface HTTPRequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
}

/** Stream transport for AI model responses */
export interface StreamTransport {
  /** Start streaming */
  start(): Promise<void>;

  /** Read stream chunks */
  read(): AsyncIterable<StreamChunk>;

  /** Abort stream */
  abort(): void;

  /** Stream state */
  readonly state: "idle" | "streaming" | "completed" | "error" | "aborted";
}

/** Stream chunk */
export interface StreamChunk {
  type: "text" | "tool_call" | "tool_result" | "usage" | "error" | "done";
  data: unknown;
}

/** RPC interface for remote procedure calls */
export interface RPCClient {
  /** Call remote procedure */
  call<TParams, TResult>(
    method: string,
    params: TParams,
    options?: { timeout?: number }
  ): Promise<TResult>;

  /** Subscribe to notifications */
  notify(method: string, params: unknown): void;

  /** Listen for notifications */
  onNotification(
    method: string,
    handler: (params: unknown) => void
  ): () => void;
}

/** RPC server interface */
export interface RPCServer {
  /** Register method handler */
  handle<TParams, TResult>(
    method: string,
    handler: (params: TParams) => Promise<TResult>
  ): void;

  /** Start server */
  start(): Promise<void>;

  /** Stop server */
  stop(): Promise<void>;
}

/** Message queue interface */
export interface MessageQueue<T = unknown> {
  /** Enqueue message */
  enqueue(message: T): Promise<void>;

  /** Dequeue message */
  dequeue(): Promise<T | undefined>;

  /** Peek at next message */
  peek(): Promise<T | undefined>;

  /** Queue length */
  length(): Promise<number>;

  /** Clear queue */
  clear(): Promise<void>;

  /** Subscribe to new messages */
  subscribe(handler: (message: T) => void): () => void;
}

/** Pub/sub interface */
export interface PubSub<T = unknown> {
  /** Publish to topic */
  publish(topic: string, message: T): Promise<void>;

  /** Subscribe to topic */
  subscribe(
    topic: string,
    handler: (message: T) => void
  ): () => void;

  /** Unsubscribe from topic */
  unsubscribe(topic: string): void;

  /** List active topics */
  topics(): string[];
}
