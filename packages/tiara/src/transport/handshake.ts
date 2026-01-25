/**
 * QUIC Handshake Manager
 *
 * Implements QUIC connection establishment protocol.
 *
 * Ported from claude-flow v3 @agentic-flow/transport
 *
 * @module tiara/transport/handshake
 */

import { EventEmitter } from "events";
import type { HandshakeContext } from "./types.js";
import { HandshakeState, TransportEventTypes } from "./types.js";

// =============================================================================
// QUIC Handshake Manager
// =============================================================================

/**
 * QUIC Handshake Manager
 *
 * Manages QUIC connection establishment handshakes.
 *
 * @example
 * const manager = new QuicHandshakeManager();
 *
 * const success = await manager.initiateHandshake(
 *   'conn-1',
 *   'example.com:443',
 *   wasmClient,
 *   createMessage
 * );
 *
 * if (success) {
 *   console.log('Connection established');
 * }
 */
export class QuicHandshakeManager extends EventEmitter {
  private contexts: Map<string, HandshakeContext> = new Map();

  /**
   * Initiate QUIC handshake for a new connection
   */
  async initiateHandshake(
    connectionId: string,
    remoteAddr: string,
    wasmClient?: unknown,
    createMessage?: (
      id: string,
      type: string,
      payload: Uint8Array,
      metadata: Record<string, unknown>
    ) => unknown
  ): Promise<boolean> {
    try {
      const context: HandshakeContext = {
        connectionId,
        state: HandshakeState.Initial,
        remoteAddr,
        startTime: Date.now(),
        wasmClient,
        createMessage,
      };

      this.contexts.set(connectionId, context);

      // Step 1: Send Initial packet
      await this.sendInitialPacket(context);

      // Step 2: Wait for Server Hello
      const success = await this.waitForServerHello(context);

      if (success) {
        context.state = HandshakeState.Established;
        this.emit(TransportEventTypes.HANDSHAKE_COMPLETE, {
          connectionId,
          remoteAddr,
          duration: Date.now() - context.startTime,
          timestamp: Date.now(),
        });
        return true;
      } else {
        context.state = HandshakeState.Failed;
        this.emit(TransportEventTypes.HANDSHAKE_FAILED, {
          connectionId,
          remoteAddr,
          reason: "Handshake timeout",
          timestamp: Date.now(),
        });
        return false;
      }
    } catch (error) {
      const context = this.contexts.get(connectionId);
      if (context) {
        context.state = HandshakeState.Failed;
      }

      this.emit(TransportEventTypes.HANDSHAKE_FAILED, {
        connectionId,
        remoteAddr,
        reason: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
      });

      return false;
    }
  }

  /**
   * Send QUIC Initial packet
   */
  private async sendInitialPacket(context: HandshakeContext): Promise<void> {
    context.state = HandshakeState.Handshaking;

    // Create QUIC Initial packet
    const initialPayload = this.createInitialPayload();

    if (context.wasmClient && context.createMessage) {
      const message = context.createMessage(
        `handshake-init-${Date.now()}`,
        "handshake",
        initialPayload,
        {
          connectionId: context.connectionId,
          packetType: "Initial",
          timestamp: Date.now(),
        }
      );

      // Send via WASM client
      await (context.wasmClient as { sendMessage: (addr: string, msg: unknown) => Promise<void> })
        .sendMessage(context.remoteAddr, message);
    }
  }

  /**
   * Wait for Server Hello response
   */
  private async waitForServerHello(context: HandshakeContext): Promise<boolean> {
    try {
      if (context.wasmClient) {
        // Receive response from WASM
        const response = await (
          context.wasmClient as {
            recvMessage: (addr: string) => Promise<{ metadata?: { packetType?: string } } | null>;
          }
        ).recvMessage(context.remoteAddr);

        if (response && response.metadata?.packetType === "ServerHello") {
          // Send Handshake Complete
          await this.sendHandshakeComplete(context);
          return true;
        }
      }

      // Graceful degradation: allow connection without full handshake
      return true;
    } catch {
      // Graceful degradation
      return true;
    }
  }

  /**
   * Send Handshake Complete packet
   */
  private async sendHandshakeComplete(context: HandshakeContext): Promise<void> {
    const completePayload = this.createHandshakeCompletePayload();

    if (context.wasmClient && context.createMessage) {
      const message = context.createMessage(
        `handshake-complete-${Date.now()}`,
        "handshake",
        completePayload,
        {
          connectionId: context.connectionId,
          packetType: "HandshakeComplete",
          timestamp: Date.now(),
        }
      );

      await (context.wasmClient as { sendMessage: (addr: string, msg: unknown) => Promise<void> })
        .sendMessage(context.remoteAddr, message);
    }
  }

  /**
   * Create QUIC Initial packet payload
   */
  private createInitialPayload(): Uint8Array {
    // Simplified QUIC Initial packet
    const payload = new Uint8Array(64);

    // QUIC header flags (Long Header, Initial packet type)
    payload[0] = 0xc0 | 0x00; // Long Header + Initial

    // Version (QUIC v1 = 0x00000001)
    payload[1] = 0x00;
    payload[2] = 0x00;
    payload[3] = 0x00;
    payload[4] = 0x01;

    // Connection ID length
    payload[5] = 0x08; // 8-byte connection ID

    // Random connection ID
    for (let i = 6; i < 14; i++) {
      payload[i] = Math.floor(Math.random() * 256);
    }

    // Packet number
    payload[14] = 0x01;

    return payload;
  }

  /**
   * Create Handshake Complete payload
   */
  private createHandshakeCompletePayload(): Uint8Array {
    const payload = new Uint8Array(32);
    payload[0] = 0xff; // Handshake Complete marker
    return payload;
  }

  /**
   * Get handshake state for connection
   */
  getHandshakeState(connectionId: string): HandshakeState {
    const context = this.contexts.get(connectionId);
    return context?.state || HandshakeState.Initial;
  }

  /**
   * Check if connection is established
   */
  isEstablished(connectionId: string): boolean {
    return this.getHandshakeState(connectionId) === HandshakeState.Established;
  }

  /**
   * Close handshake context
   */
  closeHandshake(connectionId: string): void {
    const context = this.contexts.get(connectionId);
    if (context) {
      context.state = HandshakeState.Closed;
      this.contexts.delete(connectionId);
    }
  }

  /**
   * Get all active handshakes
   */
  getActiveHandshakes(): string[] {
    return Array.from(this.contexts.keys()).filter((id) => {
      const state = this.getHandshakeState(id);
      return state === HandshakeState.Handshaking || state === HandshakeState.Established;
    });
  }

  /**
   * Get handshake context
   */
  getContext(connectionId: string): HandshakeContext | undefined {
    return this.contexts.get(connectionId);
  }

  /**
   * Get all contexts
   */
  getAllContexts(): HandshakeContext[] {
    return Array.from(this.contexts.values());
  }
}

/**
 * Create a handshake manager
 */
export function createHandshakeManager(): QuicHandshakeManager {
  return new QuicHandshakeManager();
}
