/**
 * Transport Types
 *
 * Types for QUIC and other transport protocols.
 * Designed for WASM-based implementation.
 *
 * Ported from claude-flow v3 @agentic-flow/transport
 *
 * @module tiara/transport/types
 */

// =============================================================================
// QUIC Configuration
// =============================================================================

/**
 * QUIC client/server configuration
 */
export interface QuicConfig {
  /** Bind host */
  host?: string;
  /** Bind port */
  port?: number;
  /** TLS certificate path */
  certPath?: string;
  /** TLS private key path */
  keyPath?: string;
  /** Server host to connect to (client only) */
  serverHost?: string;
  /** Server port to connect to (client only) */
  serverPort?: number;
  /** Verify peer certificate */
  verifyPeer?: boolean;
  /** Maximum concurrent connections */
  maxConnections?: number;
  /** Connection timeout in ms */
  connectionTimeout?: number;
  /** Idle timeout in ms */
  idleTimeout?: number;
  /** Maximum concurrent streams per connection */
  maxConcurrentStreams?: number;
  /** Stream timeout in ms */
  streamTimeout?: number;
  /** Initial congestion window */
  initialCongestionWindow?: number;
  /** Maximum datagram size */
  maxDatagramSize?: number;
  /** Enable 0-RTT early data */
  enableEarlyData?: boolean;
}

/**
 * Simplified transport config
 */
export interface QuicTransportConfig {
  host?: string;
  port?: number;
  maxConcurrentStreams?: number;
  certPath?: string;
  keyPath?: string;
}

// =============================================================================
// Connection Types
// =============================================================================

/**
 * QUIC connection information
 */
export interface QuicConnection {
  /** Unique connection identifier */
  id: string;
  /** Remote address (host:port) */
  remoteAddr: string;
  /** Number of active streams */
  streamCount: number;
  /** Connection creation time */
  createdAt: Date;
  /** Last activity time */
  lastActivity: Date;
}

/**
 * QUIC bidirectional stream
 */
export interface QuicStream {
  /** Stream ID */
  id: number;
  /** Parent connection ID */
  connectionId: string;
  /** Send data on stream */
  send(data: Uint8Array): Promise<void>;
  /** Receive data from stream */
  receive(): Promise<Uint8Array>;
  /** Close stream */
  close(): Promise<void>;
}

/**
 * QUIC connection/transport statistics
 */
export interface QuicStats {
  /** Total connections (historical) */
  totalConnections: number;
  /** Currently active connections */
  activeConnections: number;
  /** Total streams created */
  totalStreams: number;
  /** Currently active streams */
  activeStreams: number;
  /** Total bytes received */
  bytesReceived: number;
  /** Total bytes sent */
  bytesSent: number;
  /** Packets lost */
  packetsLost: number;
  /** Round-trip time in ms */
  rttMs: number;
}

// =============================================================================
// Handshake Types
// =============================================================================

/**
 * QUIC handshake state
 */
export enum HandshakeState {
  Initial = "initial",
  Handshaking = "handshaking",
  Established = "established",
  Failed = "failed",
  Closed = "closed",
}

/**
 * Handshake context for a connection
 */
export interface HandshakeContext {
  connectionId: string;
  state: HandshakeState;
  remoteAddr: string;
  startTime: number;
  wasmClient?: unknown;
  createMessage?: (
    id: string,
    type: string,
    payload: Uint8Array,
    metadata: Record<string, unknown>
  ) => unknown;
}

// =============================================================================
// HTTP/3 Types
// =============================================================================

/**
 * HTTP/3 request
 */
export interface Http3Request {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: Uint8Array;
}

/**
 * HTTP/3 response
 */
export interface Http3Response {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

// =============================================================================
// Transport Events
// =============================================================================

/**
 * Transport event types
 */
export enum TransportEventTypes {
  CONNECTION_ESTABLISHED = "transport:connection_established",
  CONNECTION_CLOSED = "transport:connection_closed",
  CONNECTION_ERROR = "transport:connection_error",
  STREAM_OPENED = "transport:stream_opened",
  STREAM_CLOSED = "transport:stream_closed",
  DATA_RECEIVED = "transport:data_received",
  DATA_SENT = "transport:data_sent",
  HANDSHAKE_COMPLETE = "transport:handshake_complete",
  HANDSHAKE_FAILED = "transport:handshake_failed",
}

/**
 * Connection event payload
 */
export interface ConnectionEventPayload {
  connectionId: string;
  remoteAddr: string;
  timestamp: number;
}

/**
 * Stream event payload
 */
export interface StreamEventPayload {
  connectionId: string;
  streamId: number;
  timestamp: number;
}

/**
 * Data event payload
 */
export interface DataEventPayload {
  connectionId: string;
  streamId?: number;
  bytes: number;
  timestamp: number;
}
