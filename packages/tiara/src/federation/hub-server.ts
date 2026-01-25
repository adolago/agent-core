/**
 * Federation Hub Server
 *
 * WebSocket-based hub for agent synchronization.
 * Uses WebSocket (HTTP/2 upgrade) as fallback until native QUIC is implemented.
 *
 * Features:
 * - Multi-tenant agent synchronization
 * - Vector clock-based conflict resolution
 * - Tenant isolation
 * - Memory pattern sharing
 *
 * Ported from claude-flow v3 @agentic-flow/federation
 *
 * @module tiara/federation/hub-server
 */

import { EventEmitter } from "events";
import type {
  HubServerConfig,
  AgentConnection,
  SyncMessage,
  SyncUpdate,
  HubStats,
  VectorClock,
} from "./types.js";
import { FederationEventTypes } from "./types.js";
import { VectorClockManager, mergeClocks } from "./vector-clock.js";
import { SecurityManager } from "./security.js";

// =============================================================================
// Federation Hub Server
// =============================================================================

/**
 * Federation Hub Server
 *
 * Central hub for coordinating agent memory synchronization.
 *
 * @example
 * const hub = new FederationHubServer({
 *   port: 8443,
 *   maxAgents: 100
 * });
 *
 * await hub.start();
 *
 * // Query patterns for a tenant
 * const patterns = await hub.queryPatterns('tenant-1', 'task description', 5);
 *
 * await hub.stop();
 */
export class FederationHubServer extends EventEmitter {
  private config: Required<HubServerConfig>;
  private connections: Map<string, AgentConnection> = new Map();
  private globalVectorClock: VectorClockManager;
  private security: SecurityManager;
  private episodeStore: Map<string, SyncUpdate[]> = new Map(); // tenantId -> episodes
  private startTime = 0;
  private running = false;

  constructor(config?: HubServerConfig) {
    super();
    this.config = {
      port: 8443,
      dbPath: ":memory:",
      maxAgents: 100,
      syncInterval: 5000,
      jwtSecret: "",
      ...config,
    };
    this.globalVectorClock = new VectorClockManager("hub");
    // Use provided secret or generate random one
    this.security = new SecurityManager(
      this.config.jwtSecret || undefined
    );
  }

  /**
   * Start the hub server
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    // Initialize database (placeholder)
    await this.initializeDatabase();

    // Start WebSocket server (placeholder - actual implementation would use ws)
    this.running = true;
    this.startTime = Date.now();
  }

  /**
   * Initialize hub database schema
   */
  private async initializeDatabase(): Promise<void> {
    // Create tables for:
    // - episodes (learning memories)
    // - sync_log (change tracking)
    // - agents (registered agents)
    // Placeholder for actual database initialization
  }

  /**
   * Handle agent authentication
   */
  async handleAuth(message: SyncMessage): Promise<boolean> {
    if (!message.token || !message.agentId || !message.tenantId) {
      return false;
    }

    try {
      const payload = await this.security.verifyAgentToken(message.token);

      // Verify token matches message
      if (
        payload.agentId !== message.agentId ||
        payload.tenantId !== message.tenantId
      ) {
        return false;
      }

      // Check max agents limit
      if (this.connections.size >= this.config.maxAgents) {
        return false;
      }

      // Register connection
      const connection: AgentConnection = {
        agentId: message.agentId,
        tenantId: message.tenantId,
        connectedAt: Date.now(),
        lastSyncAt: Date.now(),
        vectorClock: message.vectorClock || {},
      };

      this.connections.set(message.agentId, connection);

      this.emit(FederationEventTypes.CONNECTED, {
        agentId: message.agentId,
        tenantId: message.tenantId,
        timestamp: Date.now(),
      });

      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Handle pull request (agent wants updates from hub)
   */
  async handlePull(
    agentId: string,
    vectorClock: VectorClock
  ): Promise<SyncUpdate[]> {
    const connection = this.connections.get(agentId);
    if (!connection) {
      return [];
    }

    // Get changes since agent's vector clock
    const updates = await this.getChangesSince(
      connection.tenantId,
      vectorClock
    );

    // Update connection's last sync time
    connection.lastSyncAt = Date.now();

    return updates;
  }

  /**
   * Handle push request (agent sending updates to hub)
   */
  async handlePush(
    agentId: string,
    updates: SyncUpdate[],
    vectorClock: VectorClock
  ): Promise<void> {
    const connection = this.connections.get(agentId);
    if (!connection) {
      return;
    }

    // Validate tenant isolation
    for (const update of updates) {
      if (update.tenantId !== connection.tenantId) {
        throw new Error("Tenant isolation violation");
      }
    }

    // Store updates
    const tenantEpisodes = this.episodeStore.get(connection.tenantId) || [];
    tenantEpisodes.push(...updates);
    this.episodeStore.set(connection.tenantId, tenantEpisodes);

    // Update global vector clock
    this.globalVectorClock.mergeSilent(vectorClock);
    this.globalVectorClock.tick();

    // Update connection's vector clock
    connection.vectorClock = mergeClocks(connection.vectorClock, vectorClock);
    connection.lastSyncAt = Date.now();

    // Broadcast to other agents in same tenant
    await this.broadcastToTenant(connection.tenantId, agentId, updates);
  }

  /**
   * Get changes since a given vector clock
   * Returns memories from other agents in the same tenant
   */
  private async getChangesSince(
    tenantId: string,
    _agentClock: VectorClock
  ): Promise<SyncUpdate[]> {
    const tenantEpisodes = this.episodeStore.get(tenantId) || [];

    // In production, filter by vector clock comparison
    // For now, return all episodes (simplified)
    return tenantEpisodes;
  }

  /**
   * Broadcast message to all agents in a tenant (except sender)
   */
  private async broadcastToTenant(
    tenantId: string,
    senderId: string,
    updates: SyncUpdate[]
  ): Promise<void> {
    for (const [agentId, connection] of this.connections) {
      if (connection.tenantId === tenantId && agentId !== senderId) {
        // Would send via WebSocket in actual implementation
        const _broadcastMessage: SyncMessage = {
          type: "broadcast",
          agentId: senderId,
          tenantId,
          data: updates,
          vectorClock: this.globalVectorClock.getClock(),
          timestamp: Date.now(),
        };
        // In actual implementation: send(connection.ws, broadcastMessage)
      }
    }
  }

  /**
   * Disconnect an agent
   */
  async disconnectAgent(agentId: string): Promise<void> {
    const connection = this.connections.get(agentId);
    if (!connection) {
      return;
    }

    this.connections.delete(agentId);

    this.emit(FederationEventTypes.DISCONNECTED, {
      agentId,
      tenantId: connection.tenantId,
      timestamp: Date.now(),
    });
  }

  /**
   * Get hub statistics
   */
  getStats(): HubStats {
    // Count unique tenants
    const tenants = new Set<string>();
    for (const connection of this.connections.values()) {
      tenants.add(connection.tenantId);
    }

    // Count total episodes
    let totalEpisodes = 0;
    for (const episodes of this.episodeStore.values()) {
      totalEpisodes += episodes.length;
    }

    return {
      connectedAgents: this.connections.size,
      totalEpisodes,
      tenants: tenants.size,
      uptime: this.running ? Date.now() - this.startTime : 0,
    };
  }

  /**
   * Stop the hub server
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    // Disconnect all agents
    for (const agentId of this.connections.keys()) {
      await this.disconnectAgent(agentId);
    }

    // Close WebSocket server (placeholder)
    this.running = false;
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Query patterns from store with tenant isolation
   */
  async queryPatterns(
    tenantId: string,
    _task: string,
    k = 5
  ): Promise<SyncUpdate[]> {
    const tenantEpisodes = this.episodeStore.get(tenantId) || [];

    // In production, this would use vector similarity search
    // For now, return latest k episodes
    return tenantEpisodes.slice(-k);
  }

  /**
   * Get all connected agents
   */
  getConnectedAgents(): AgentConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get agents for a specific tenant
   */
  getTenantAgents(tenantId: string): AgentConnection[] {
    return Array.from(this.connections.values()).filter(
      (conn) => conn.tenantId === tenantId
    );
  }

  /**
   * Get global vector clock
   */
  getGlobalVectorClock(): VectorClock {
    return this.globalVectorClock.getClock();
  }
}

/**
 * Create a federation hub server
 */
export function createFederationHubServer(
  config?: HubServerConfig
): FederationHubServer {
  return new FederationHubServer(config);
}
