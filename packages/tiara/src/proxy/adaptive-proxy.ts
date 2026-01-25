/**
 * Adaptive Multi-Protocol Proxy
 *
 * Automatically selects optimal protocol based on:
 * - Client capabilities
 * - Network conditions
 * - Configuration priorities
 *
 * Fallback chain: HTTP/3 → HTTP/2 → HTTP/1.1 → WebSocket
 *
 * Ported from claude-flow v3 @agentic-flow/proxy
 *
 * @module tiara/proxy/adaptive-proxy
 */

import { EventEmitter } from "events";
import type {
  AdaptiveProxyConfig,
  ProxyServer,
  ProxyStatus,
} from "./types.js";
import { ProxyEventTypes } from "./types.js";

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: Required<AdaptiveProxyConfig> = {
  enableHTTP2: true,
  enableHTTP3: false, // Requires QUIC implementation
  enableWebSocket: true,
  enableHTTP1: true,
  http1Port: 8080,
  http2Port: 8443,
  http3Port: 4433,
  wsPort: 8081,
  cert: "",
  key: "",
};

// =============================================================================
// Adaptive Proxy
// =============================================================================

/**
 * Adaptive Multi-Protocol Proxy
 *
 * Manages multiple proxy protocols with automatic selection and fallback.
 *
 * @example
 * const proxy = new AdaptiveProxy({
 *   enableHTTP2: true,
 *   enableWebSocket: true,
 *   http2Port: 8443,
 *   cert: fs.readFileSync('cert.pem', 'utf8'),
 *   key: fs.readFileSync('key.pem', 'utf8')
 * });
 *
 * const servers = await proxy.start();
 * console.log('Started servers:', servers.map(s => s.url));
 *
 * // Later...
 * await proxy.stop();
 */
export class AdaptiveProxy extends EventEmitter {
  private config: Required<AdaptiveProxyConfig>;
  private servers: ProxyServer[] = [];
  private isRunning = false;

  constructor(config?: AdaptiveProxyConfig) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get list of enabled protocols
   */
  private getEnabledProtocols(): string[] {
    const protocols: string[] = [];

    if (this.config.enableHTTP3) {
      protocols.push("http3");
    }
    if (this.config.enableHTTP2) {
      protocols.push("http2");
    }
    if (this.config.enableHTTP1) {
      protocols.push("http1");
    }
    if (this.config.enableWebSocket) {
      protocols.push("websocket");
    }

    return protocols;
  }

  /**
   * Start all enabled proxy servers
   */
  async start(): Promise<ProxyServer[]> {
    if (this.isRunning) {
      return this.servers;
    }

    const enabledProtocols = this.getEnabledProtocols();
    this.servers = [];

    // Start HTTP/3 (QUIC) if enabled
    if (this.config.enableHTTP3) {
      try {
        const server = await this.startHTTP3();
        this.servers.push(server);
      } catch (error) {
        this.emit(ProxyEventTypes.FALLBACK_TRIGGERED, {
          protocol: "http3",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now(),
        });
      }
    }

    // Start HTTP/2 if enabled
    if (this.config.enableHTTP2) {
      try {
        const server = await this.startHTTP2();
        this.servers.push(server);
      } catch (error) {
        this.emit(ProxyEventTypes.FALLBACK_TRIGGERED, {
          protocol: "http2",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now(),
        });
      }
    }

    // Start HTTP/1.1 if enabled
    if (this.config.enableHTTP1) {
      try {
        const server = await this.startHTTP1();
        this.servers.push(server);
      } catch (error) {
        this.emit(ProxyEventTypes.FALLBACK_TRIGGERED, {
          protocol: "http1",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now(),
        });
      }
    }

    // Start WebSocket if enabled
    if (this.config.enableWebSocket) {
      try {
        const server = await this.startWebSocket();
        this.servers.push(server);
      } catch (error) {
        this.emit(ProxyEventTypes.FALLBACK_TRIGGERED, {
          protocol: "websocket",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now(),
        });
      }
    }

    this.isRunning = true;

    for (const server of this.servers) {
      this.emit(ProxyEventTypes.PROTOCOL_SELECTED, {
        protocol: server.protocol,
        url: server.url,
        timestamp: Date.now(),
      });
    }

    return this.servers;
  }

  /**
   * Start HTTP/3 (QUIC) server
   */
  private async startHTTP3(): Promise<ProxyServer> {
    // HTTP/3 requires QUIC implementation
    // This is a placeholder - actual implementation would use the QUIC transport module
    const port = this.config.http3Port;
    const url = `https://localhost:${port}`;

    return {
      protocol: "http3",
      port,
      url,
      server: null, // Placeholder
    };
  }

  /**
   * Start HTTP/2 server
   */
  private async startHTTP2(): Promise<ProxyServer> {
    const port = this.config.http2Port;
    const url = `https://localhost:${port}`;

    // Placeholder for actual HTTP/2 server
    // Would use node:http2 with TLS
    return {
      protocol: "http2",
      port,
      url,
      server: null, // Placeholder
    };
  }

  /**
   * Start HTTP/1.1 server
   */
  private async startHTTP1(): Promise<ProxyServer> {
    const port = this.config.http1Port;
    const url = `http://localhost:${port}`;

    // Placeholder for actual HTTP/1.1 server
    // Would use node:http or express
    return {
      protocol: "http1",
      port,
      url,
      server: null, // Placeholder
    };
  }

  /**
   * Start WebSocket server
   */
  private async startWebSocket(): Promise<ProxyServer> {
    const port = this.config.wsPort;
    const url = `ws://localhost:${port}`;

    // Placeholder for actual WebSocket server
    // Would use ws package
    return {
      protocol: "websocket",
      port,
      url,
      server: null, // Placeholder
    };
  }

  /**
   * Stop all proxy servers
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // Close all servers
    for (const server of this.servers) {
      if (server.server && typeof (server.server as any).close === "function") {
        await new Promise<void>((resolve) => {
          (server.server as any).close(() => resolve());
        });
      }
    }

    this.servers = [];
    this.isRunning = false;
  }

  /**
   * Get active servers
   */
  getServers(): ProxyServer[] {
    return [...this.servers];
  }

  /**
   * Get proxy status
   */
  getStatus(): ProxyStatus {
    return {
      isRunning: this.isRunning,
      servers: this.servers.map((s) => ({
        protocol: s.protocol,
        port: s.port,
        url: s.url,
      })),
      enabledProtocols: this.getEnabledProtocols(),
    };
  }

  /**
   * Select best protocol for a request
   */
  selectProtocol(
    clientCapabilities?: string[],
    _networkConditions?: { latency?: number; bandwidth?: number }
  ): string | null {
    const availableProtocols = this.servers.map((s) => s.protocol);

    if (availableProtocols.length === 0) {
      return null;
    }

    // Priority order: http3 > http2 > http1 > websocket
    const priority = ["http3", "http2", "http1", "websocket"];

    // Filter by client capabilities if provided
    const candidates = clientCapabilities
      ? availableProtocols.filter((p) => clientCapabilities.includes(p))
      : availableProtocols;

    // Return highest priority available
    for (const protocol of priority) {
      if (candidates.includes(protocol)) {
        return protocol;
      }
    }

    // Fallback to first available
    return candidates[0] || null;
  }

  /**
   * Get server for a specific protocol
   */
  getServerByProtocol(protocol: string): ProxyServer | undefined {
    return this.servers.find((s) => s.protocol === protocol);
  }

  /**
   * Check if a protocol is available
   */
  hasProtocol(protocol: string): boolean {
    return this.servers.some((s) => s.protocol === protocol);
  }

  /**
   * Get configuration
   */
  getConfig(): AdaptiveProxyConfig {
    return { ...this.config };
  }
}

/**
 * Create an adaptive proxy
 */
export function createAdaptiveProxy(
  config?: AdaptiveProxyConfig
): AdaptiveProxy {
  return new AdaptiveProxy(config);
}
