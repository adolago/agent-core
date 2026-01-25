/**
 * Transport Module
 *
 * QUIC and other transport protocols for high-performance communication.
 *
 * Ported from claude-flow v3 @agentic-flow/transport
 *
 * @module tiara/transport
 */

// Types
export type {
  QuicConfig,
  QuicTransportConfig,
  QuicConnection,
  QuicStream,
  QuicStats,
  HandshakeContext,
  Http3Request,
  Http3Response,
  ConnectionEventPayload,
  StreamEventPayload,
  DataEventPayload,
} from "./types.js";

export { HandshakeState, TransportEventTypes } from "./types.js";

// QUIC Client/Server
export {
  QuicClient,
  QuicServer,
  QuicConnectionPool,
  QuicTransport,
  createQuicClient,
  createQuicServer,
  createQuicTransport,
} from "./quic.js";

// Handshake
export { QuicHandshakeManager, createHandshakeManager } from "./handshake.js";
