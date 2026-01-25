/**
 * QUIC Transport
 *
 * QUIC client/server with connection pooling and stream multiplexing.
 * Designed for WASM-based implementation.
 *
 * Ported from claude-flow v3 @agentic-flow/transport
 *
 * @module tiara/transport/quic
 */

import { EventEmitter } from "events";
import type {
  QuicConfig,
  QuicTransportConfig,
  QuicConnection,
  QuicStream,
  QuicStats,
  Http3Response,
} from "./types.js";
import { TransportEventTypes } from "./types.js";

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CLIENT_CONFIG: Required<QuicConfig> = {
  host: "0.0.0.0",
  port: 4433,
  certPath: "./certs/cert.pem",
  keyPath: "./certs/key.pem",
  serverHost: "localhost",
  serverPort: 4433,
  verifyPeer: true,
  maxConnections: 100,
  connectionTimeout: 30000,
  idleTimeout: 60000,
  maxConcurrentStreams: 100,
  streamTimeout: 30000,
  initialCongestionWindow: 10,
  maxDatagramSize: 1200,
  enableEarlyData: true,
};

const DEFAULT_SERVER_CONFIG: Required<QuicConfig> = {
  ...DEFAULT_CLIENT_CONFIG,
  verifyPeer: false,
  maxConnections: 1000,
  idleTimeout: 120000,
  enableEarlyData: false,
};

// =============================================================================
// QUIC Client
// =============================================================================

/**
 * QUIC Client
 *
 * Manages outbound QUIC connections and stream multiplexing.
 * Uses WASM module for actual QUIC protocol handling.
 *
 * @example
 * const client = new QuicClient({
 *   serverHost: 'example.com',
 *   serverPort: 443,
 *   verifyPeer: true
 * });
 *
 * await client.initialize();
 * const conn = await client.connect();
 * const stream = await client.createStream(conn.id);
 * await stream.send(data);
 */
export class QuicClient extends EventEmitter {
  private config: Required<QuicConfig>;
  private connections: Map<string, QuicConnection> = new Map();
  private wasmModule: unknown = null;
  private initialized = false;
  private totalBytesReceived = 0;
  private totalBytesSent = 0;

  constructor(config?: QuicConfig) {
    super();
    this.config = { ...DEFAULT_CLIENT_CONFIG, ...config };
  }

  /**
   * Initialize QUIC client with WASM module
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Load WASM module (placeholder - actual implementation will use WASM bindings)
    this.wasmModule = await this.loadWasmModule();
    this.initialized = true;
  }

  /**
   * Check if client is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Connect to QUIC server
   */
  async connect(host?: string, port?: number): Promise<QuicConnection> {
    if (!this.initialized) {
      throw new Error("QUIC client not initialized. Call initialize() first.");
    }

    const targetHost = host || this.config.serverHost;
    const targetPort = port || this.config.serverPort;
    const connectionId = `${targetHost}:${targetPort}`;

    // Check if connection already exists
    const existing = this.connections.get(connectionId);
    if (existing) {
      existing.lastActivity = new Date();
      return existing;
    }

    // Check connection limit
    if (this.connections.size >= this.config.maxConnections) {
      throw new Error(`Maximum connections (${this.config.maxConnections}) reached`);
    }

    // Create connection
    const connection: QuicConnection = {
      id: connectionId,
      remoteAddr: `${targetHost}:${targetPort}`,
      streamCount: 0,
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    this.connections.set(connectionId, connection);

    this.emit(TransportEventTypes.CONNECTION_ESTABLISHED, {
      connectionId,
      remoteAddr: connection.remoteAddr,
      timestamp: Date.now(),
    });

    return connection;
  }

  /**
   * Create bidirectional stream on connection
   */
  async createStream(connectionId: string): Promise<QuicStream> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    if (connection.streamCount >= this.config.maxConcurrentStreams) {
      throw new Error(`Maximum concurrent streams (${this.config.maxConcurrentStreams}) reached`);
    }

    const streamId = connection.streamCount++;
    connection.lastActivity = new Date();

    const self = this;
    const stream: QuicStream = {
      id: streamId,
      connectionId,
      async send(data: Uint8Array): Promise<void> {
        connection.lastActivity = new Date();
        self.totalBytesSent += data.length;
        self.emit(TransportEventTypes.DATA_SENT, {
          connectionId,
          streamId,
          bytes: data.length,
          timestamp: Date.now(),
        });
        // WASM call placeholder
      },
      async receive(): Promise<Uint8Array> {
        connection.lastActivity = new Date();
        // WASM call placeholder
        return new Uint8Array();
      },
      async close(): Promise<void> {
        connection.streamCount--;
        connection.lastActivity = new Date();
        self.emit(TransportEventTypes.STREAM_CLOSED, {
          connectionId,
          streamId,
          timestamp: Date.now(),
        });
      },
    };

    this.emit(TransportEventTypes.STREAM_OPENED, {
      connectionId,
      streamId,
      timestamp: Date.now(),
    });

    return stream;
  }

  /**
   * Send HTTP/3 request over QUIC
   */
  async sendRequest(
    connectionId: string,
    method: string,
    path: string,
    headers: Record<string, string>,
    body?: Uint8Array
  ): Promise<Http3Response> {
    const stream = await this.createStream(connectionId);

    try {
      // Encode and send HTTP/3 request
      const request = this.encodeHttp3Request(method, path, headers, body);
      await stream.send(request);

      // Receive and decode HTTP/3 response
      const responseData = await stream.receive();
      return this.decodeHttp3Response(responseData);
    } finally {
      await stream.close();
    }
  }

  /**
   * Close connection
   */
  async closeConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    this.connections.delete(connectionId);

    this.emit(TransportEventTypes.CONNECTION_CLOSED, {
      connectionId,
      remoteAddr: connection.remoteAddr,
      timestamp: Date.now(),
    });
  }

  /**
   * Close all connections and cleanup
   */
  async shutdown(): Promise<void> {
    for (const connectionId of this.connections.keys()) {
      await this.closeConnection(connectionId);
    }
    this.initialized = false;
    this.wasmModule = null;
  }

  /**
   * Get connection by ID
   */
  getConnection(connectionId: string): QuicConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get all connections
   */
  getConnections(): QuicConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get connection statistics
   */
  getStats(): QuicStats {
    const connections = Array.from(this.connections.values());
    return {
      totalConnections: connections.length,
      activeConnections: connections.length,
      totalStreams: connections.reduce((sum, c) => sum + c.streamCount, 0),
      activeStreams: connections.reduce((sum, c) => sum + c.streamCount, 0),
      bytesReceived: this.totalBytesReceived,
      bytesSent: this.totalBytesSent,
      packetsLost: 0, // From WASM
      rttMs: 0, // From WASM
    };
  }

  /**
   * Get configuration
   */
  getConfig(): QuicConfig {
    return { ...this.config };
  }

  /**
   * Load WASM module (placeholder)
   */
  private async loadWasmModule(): Promise<unknown> {
    // This will be implemented to load the actual WASM module
    return {};
  }

  /**
   * Encode HTTP/3 request (placeholder)
   */
  private encodeHttp3Request(
    _method: string,
    _path: string,
    _headers: Record<string, string>,
    _body?: Uint8Array
  ): Uint8Array {
    // HTTP/3 QPACK encoding will be implemented
    return new Uint8Array();
  }

  /**
   * Decode HTTP/3 response (placeholder)
   */
  private decodeHttp3Response(_data: Uint8Array): Http3Response {
    // HTTP/3 QPACK decoding will be implemented
    return {
      status: 200,
      headers: {},
      body: new Uint8Array(),
    };
  }
}

// =============================================================================
// QUIC Server
// =============================================================================

/**
 * QUIC Server
 *
 * Listens for inbound QUIC connections.
 *
 * @example
 * const server = new QuicServer({
 *   host: '0.0.0.0',
 *   port: 4433,
 *   certPath: '/path/to/cert.pem',
 *   keyPath: '/path/to/key.pem'
 * });
 *
 * await server.initialize();
 * await server.listen();
 */
export class QuicServer extends EventEmitter {
  private config: Required<QuicConfig>;
  private connections: Map<string, QuicConnection> = new Map();
  private wasmModule: unknown = null;
  private initialized = false;
  private listening = false;

  constructor(config?: QuicConfig) {
    super();
    this.config = { ...DEFAULT_SERVER_CONFIG, ...config };
  }

  /**
   * Initialize QUIC server
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Load WASM module (placeholder)
    this.wasmModule = await this.loadWasmModule();
    this.initialized = true;
  }

  /**
   * Check if server is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if server is listening
   */
  isListening(): boolean {
    return this.listening;
  }

  /**
   * Start listening for connections
   */
  async listen(): Promise<void> {
    if (!this.initialized) {
      throw new Error("QUIC server not initialized. Call initialize() first.");
    }

    if (this.listening) {
      return;
    }

    // Start QUIC server via WASM (placeholder)
    this.listening = true;
  }

  /**
   * Stop server and close all connections
   */
  async stop(): Promise<void> {
    if (!this.listening) {
      return;
    }

    // Close all connections
    for (const connectionId of this.connections.keys()) {
      await this.closeConnection(connectionId);
    }

    this.listening = false;
  }

  /**
   * Close connection
   */
  async closeConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    this.connections.delete(connectionId);

    this.emit(TransportEventTypes.CONNECTION_CLOSED, {
      connectionId,
      remoteAddr: connection.remoteAddr,
      timestamp: Date.now(),
    });
  }

  /**
   * Get all connections
   */
  getConnections(): QuicConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get server statistics
   */
  getStats(): QuicStats {
    const connections = Array.from(this.connections.values());
    return {
      totalConnections: connections.length,
      activeConnections: connections.length,
      totalStreams: connections.reduce((sum, c) => sum + c.streamCount, 0),
      activeStreams: connections.reduce((sum, c) => sum + c.streamCount, 0),
      bytesReceived: 0,
      bytesSent: 0,
      packetsLost: 0,
      rttMs: 0,
    };
  }

  /**
   * Get server address
   */
  getAddress(): string {
    return `${this.config.host}:${this.config.port}`;
  }

  /**
   * Load WASM module (placeholder)
   */
  private async loadWasmModule(): Promise<unknown> {
    return {};
  }
}

// =============================================================================
// Connection Pool
// =============================================================================

/**
 * QUIC Connection Pool
 *
 * Manages a pool of QUIC connections for reuse.
 *
 * @example
 * const pool = new QuicConnectionPool(client, 10);
 * const conn = await pool.getConnection('example.com', 443);
 */
export class QuicConnectionPool {
  private client: QuicClient;
  private connections: Map<string, QuicConnection> = new Map();
  private maxPoolSize: number;

  constructor(client: QuicClient, maxPoolSize = 10) {
    this.client = client;
    this.maxPoolSize = maxPoolSize;
  }

  /**
   * Get or create connection from pool
   */
  async getConnection(host: string, port: number): Promise<QuicConnection> {
    const key = `${host}:${port}`;

    // Check if connection exists in pool
    const existing = this.connections.get(key);
    if (existing) {
      existing.lastActivity = new Date();
      return existing;
    }

    // Remove oldest if pool is full
    if (this.connections.size >= this.maxPoolSize) {
      await this.removeOldestConnection();
    }

    // Create new connection
    const connection = await this.client.connect(host, port);
    this.connections.set(key, connection);
    return connection;
  }

  /**
   * Remove oldest idle connection
   */
  private async removeOldestConnection(): Promise<void> {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, conn] of this.connections.entries()) {
      const lastActivity = conn.lastActivity.getTime();
      if (lastActivity < oldestTime) {
        oldestTime = lastActivity;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      await this.client.closeConnection(oldestKey);
      this.connections.delete(oldestKey);
    }
  }

  /**
   * Get pool size
   */
  getSize(): number {
    return this.connections.size;
  }

  /**
   * Get max pool size
   */
  getMaxSize(): number {
    return this.maxPoolSize;
  }

  /**
   * Clear all connections in pool
   */
  async clear(): Promise<void> {
    for (const connectionId of this.connections.keys()) {
      await this.client.closeConnection(connectionId);
    }
    this.connections.clear();
  }
}

// =============================================================================
// High-Level Transport
// =============================================================================

/**
 * QUIC Transport
 *
 * High-level QUIC transport interface for simple use cases.
 *
 * @example
 * const transport = new QuicTransport({
 *   host: 'example.com',
 *   port: 443
 * });
 *
 * await transport.connect();
 * await transport.send({ type: 'message', data: 'hello' });
 * await transport.close();
 */
export class QuicTransport {
  private client: QuicClient;
  private config: QuicTransportConfig;
  private connectionId: string | null = null;

  constructor(config?: QuicTransportConfig) {
    this.config = config || {};
    this.client = new QuicClient({
      serverHost: config?.host || "localhost",
      serverPort: config?.port || 4433,
      maxConcurrentStreams: config?.maxConcurrentStreams || 100,
      certPath: config?.certPath,
      keyPath: config?.keyPath,
    });
  }

  /**
   * Connect to QUIC server
   */
  async connect(): Promise<void> {
    await this.client.initialize();
    const conn = await this.client.connect();
    this.connectionId = conn.id;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connectionId !== null;
  }

  /**
   * Send data over QUIC
   */
  async send(data: unknown): Promise<void> {
    if (!this.connectionId) {
      throw new Error("Not connected");
    }

    const stream = await this.client.createStream(this.connectionId);
    try {
      const jsonStr = JSON.stringify(data);
      const bytes = new TextEncoder().encode(jsonStr);
      await stream.send(bytes);
    } finally {
      await stream.close();
    }
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    await this.client.shutdown();
    this.connectionId = null;
  }

  /**
   * Get connection statistics
   */
  getStats(): QuicStats {
    return this.client.getStats();
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a QUIC client
 */
export function createQuicClient(config?: QuicConfig): QuicClient {
  return new QuicClient(config);
}

/**
 * Create a QUIC server
 */
export function createQuicServer(config?: QuicConfig): QuicServer {
  return new QuicServer(config);
}

/**
 * Create a QUIC transport
 */
export function createQuicTransport(config?: QuicTransportConfig): QuicTransport {
  return new QuicTransport(config);
}
