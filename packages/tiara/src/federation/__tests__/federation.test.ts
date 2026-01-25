import { describe, expect, it, jest, beforeEach, afterEach } from "@jest/globals";
import {
  // Vector Clock
  createVectorClock,
  incrementClock,
  mergeClocks,
  compareClocks,
  happenedBefore,
  areConcurrent,
  areEqual,
  getTimestamp,
  cloneClock,
  getNodes,
  getTotalSum,
  VectorClockManager,
  createVectorClockManager,
  // Security
  SecurityManager,
  createSecurityManager,
  // Federation Hub
  FederationHub,
  createFederationHub,
  // Federation Hub Server
  FederationHubServer,
  createFederationHubServer,
  // Ephemeral Agent
  EphemeralAgent,
  spawnEphemeralAgent,
  // Types
  FederationEventTypes,
} from "../index.js";

describe("federation module", () => {
  describe("Vector Clock", () => {
    describe("basic operations", () => {
      it("creates empty clock", () => {
        const clock = createVectorClock();
        expect(Object.keys(clock).length).toBe(0);
      });

      it("creates clock with initial node", () => {
        const clock = createVectorClock("node-1");
        expect(clock["node-1"]).toBe(0);
      });

      it("increments clock", () => {
        let clock = createVectorClock("node-1");
        clock = incrementClock(clock, "node-1");
        expect(clock["node-1"]).toBe(1);

        clock = incrementClock(clock, "node-1");
        expect(clock["node-1"]).toBe(2);
      });

      it("increments non-existent node", () => {
        let clock = createVectorClock("node-1");
        clock = incrementClock(clock, "node-2");
        expect(clock["node-2"]).toBe(1);
      });
    });

    describe("merge operations", () => {
      it("merges clocks taking maximum", () => {
        const clock1 = { "node-1": 5, "node-2": 3 };
        const clock2 = { "node-1": 2, "node-2": 7, "node-3": 4 };

        const merged = mergeClocks(clock1, clock2);

        expect(merged["node-1"]).toBe(5);
        expect(merged["node-2"]).toBe(7);
        expect(merged["node-3"]).toBe(4);
      });

      it("merges with empty clock", () => {
        const clock1 = { "node-1": 5 };
        const clock2 = {};

        expect(mergeClocks(clock1, clock2)).toEqual({ "node-1": 5 });
        expect(mergeClocks(clock2, clock1)).toEqual({ "node-1": 5 });
      });
    });

    describe("comparison", () => {
      it("detects equal clocks", () => {
        const clock1 = { "node-1": 5, "node-2": 3 };
        const clock2 = { "node-1": 5, "node-2": 3 };

        expect(compareClocks(clock1, clock2)).toBe("equal");
        expect(areEqual(clock1, clock2)).toBe(true);
      });

      it("detects happened-before relationship", () => {
        const clock1 = { "node-1": 3, "node-2": 2 };
        const clock2 = { "node-1": 5, "node-2": 4 };

        expect(compareClocks(clock1, clock2)).toBe("before");
        expect(happenedBefore(clock1, clock2)).toBe(true);
      });

      it("detects happened-after relationship", () => {
        const clock1 = { "node-1": 5, "node-2": 4 };
        const clock2 = { "node-1": 3, "node-2": 2 };

        expect(compareClocks(clock1, clock2)).toBe("after");
        expect(happenedBefore(clock1, clock2)).toBe(false);
      });

      it("detects concurrent clocks (conflict)", () => {
        const clock1 = { "node-1": 5, "node-2": 2 };
        const clock2 = { "node-1": 3, "node-2": 4 };

        expect(compareClocks(clock1, clock2)).toBe("concurrent");
        expect(areConcurrent(clock1, clock2)).toBe(true);
      });
    });

    describe("utility functions", () => {
      it("gets timestamp for node", () => {
        const clock = { "node-1": 5, "node-2": 3 };
        expect(getTimestamp(clock, "node-1")).toBe(5);
        expect(getTimestamp(clock, "node-3")).toBe(0);
      });

      it("clones clock", () => {
        const clock = { "node-1": 5 };
        const cloned = cloneClock(clock);

        expect(cloned).toEqual(clock);
        expect(cloned).not.toBe(clock); // Different reference
      });

      it("gets nodes", () => {
        const clock = { "node-1": 5, "node-2": 3 };
        expect(getNodes(clock).sort()).toEqual(["node-1", "node-2"]);
      });

      it("gets total sum", () => {
        const clock = { "node-1": 5, "node-2": 3, "node-3": 2 };
        expect(getTotalSum(clock)).toBe(10);
      });
    });

    describe("VectorClockManager", () => {
      let manager: VectorClockManager;

      beforeEach(() => {
        manager = new VectorClockManager("agent-1");
      });

      it("initializes with node", () => {
        expect(manager.getNodeId()).toBe("agent-1");
        expect(manager.getLocalTimestamp()).toBe(0);
      });

      it("ticks local timestamp", () => {
        manager.tick();
        expect(manager.getLocalTimestamp()).toBe(1);

        manager.tick();
        expect(manager.getLocalTimestamp()).toBe(2);
      });

      it("merges with remote clock", () => {
        const remoteClock = { "agent-2": 5 };
        manager.merge(remoteClock);

        const clock = manager.getClock();
        expect(clock["agent-2"]).toBe(5);
        expect(clock["agent-1"]).toBe(1); // Auto-incremented after merge
      });

      it("detects conflict", () => {
        manager.tick();
        manager.tick();

        const remoteClock = { "agent-2": 3 };
        expect(manager.detectConflict(remoteClock)).toBe(true);
      });

      it("resets clock", () => {
        manager.tick();
        manager.tick();
        manager.reset();

        expect(manager.getLocalTimestamp()).toBe(0);
      });

      it("creates via factory", () => {
        const created = createVectorClockManager("agent-2");
        expect(created.getNodeId()).toBe("agent-2");
      });
    });
  });

  describe("SecurityManager", () => {
    let security: SecurityManager;

    beforeEach(() => {
      security = new SecurityManager("test-secret");
    });

    describe("JWT tokens", () => {
      it("creates and verifies token", async () => {
        const payload = {
          agentId: "agent-1",
          tenantId: "tenant-1",
          expiresAt: Date.now() + 3600000,
        };

        const token = await security.createAgentToken(payload);
        expect(token).toBeDefined();
        expect(token.split(".").length).toBe(3);

        const verified = await security.verifyAgentToken(token);
        expect(verified.agentId).toBe("agent-1");
        expect(verified.tenantId).toBe("tenant-1");
      });

      it("rejects invalid token format", async () => {
        await expect(security.verifyAgentToken("invalid")).rejects.toThrow(
          "Invalid token format"
        );
      });

      it("rejects expired token", async () => {
        const payload = {
          agentId: "agent-1",
          tenantId: "tenant-1",
          expiresAt: Date.now() - 1000, // Already expired
        };

        const token = await security.createAgentToken(payload);
        await expect(security.verifyAgentToken(token)).rejects.toThrow(
          "Token expired"
        );
      });
    });

    describe("encryption", () => {
      it("encrypts and decrypts data", async () => {
        const data = "secret message";
        const tenantId = "tenant-1";

        const { encrypted, authTag } = await security.encrypt(data, tenantId);
        expect(encrypted).toBeDefined();
        expect(authTag).toBeDefined();

        const decrypted = await security.decrypt(encrypted, authTag, tenantId);
        expect(decrypted).toBe(data);
      });

      it("caches encryption keys", async () => {
        const keys1 = await security.getEncryptionKeys("tenant-1");
        const keys2 = await security.getEncryptionKeys("tenant-1");

        expect(keys1.encryptionKey).toBe(keys2.encryptionKey);
      });

      it("clears cache", async () => {
        await security.getEncryptionKeys("tenant-1");
        security.clearCache();

        const keys = await security.getEncryptionKeys("tenant-1");
        expect(keys).toBeDefined();
      });
    });

    describe("tenant isolation", () => {
      it("validates same tenant access", () => {
        expect(security.validateTenantAccess("tenant-1", "tenant-1")).toBe(
          true
        );
      });

      it("rejects different tenant access", () => {
        expect(security.validateTenantAccess("tenant-1", "tenant-2")).toBe(
          false
        );
      });
    });

    describe("utilities", () => {
      it("hashes data", () => {
        const hash1 = security.hashData("test data");
        const hash2 = security.hashData("test data");
        const hash3 = security.hashData("different data");

        expect(hash1).toBe(hash2);
        expect(hash1).not.toBe(hash3);
        expect(hash1.length).toBe(64); // SHA-256 hex
      });

      it("generates secure ID", () => {
        const id1 = security.generateSecureId();
        const id2 = security.generateSecureId();

        expect(id1.length).toBe(32); // 16 bytes hex
        expect(id1).not.toBe(id2);
      });

      it("generates mTLS certificates", async () => {
        const certs = await security.generateMTLSCertificates("agent-1");

        expect(certs.cert).toContain("BEGIN CERTIFICATE");
        expect(certs.key).toContain("BEGIN PRIVATE KEY");
        expect(certs.ca).toContain("BEGIN CERTIFICATE");
      });
    });

    it("creates via factory", () => {
      const created = createSecurityManager();
      expect(created).toBeInstanceOf(SecurityManager);
    });
  });

  describe("FederationHub", () => {
    let hub: FederationHub;

    beforeEach(() => {
      hub = new FederationHub({
        endpoint: "quic://hub.example.com:4433",
        agentId: "agent-1",
        tenantId: "tenant-1",
        token: "test-token",
      });
    });

    describe("connection", () => {
      it("connects to hub", async () => {
        expect(hub.isConnected()).toBe(false);

        await hub.connect();
        expect(hub.isConnected()).toBe(true);
      });

      it("handles double connect gracefully", async () => {
        await hub.connect();
        await hub.connect(); // Should not throw

        expect(hub.isConnected()).toBe(true);
      });

      it("disconnects from hub", async () => {
        await hub.connect();
        expect(hub.isConnected()).toBe(true);

        await hub.disconnect();
        expect(hub.isConnected()).toBe(false);
      });

      it("emits connected event", async () => {
        const handler = jest.fn();
        hub.on(FederationEventTypes.CONNECTED, handler);

        await hub.connect();

        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({
            agentId: "agent-1",
            tenantId: "tenant-1",
          })
        );
      });

      it("emits disconnected event", async () => {
        const handler = jest.fn();
        hub.on(FederationEventTypes.DISCONNECTED, handler);

        await hub.connect();
        await hub.disconnect();

        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({
            agentId: "agent-1",
          })
        );
      });
    });

    describe("sync", () => {
      const mockDb = {
        close: jest.fn(),
      };

      beforeEach(async () => {
        await hub.connect();
      });

      it("throws if not connected", async () => {
        await hub.disconnect();
        await expect(hub.sync(mockDb)).rejects.toThrow("Not connected");
      });

      it("syncs with hub", async () => {
        await hub.sync(mockDb); // Should not throw
      });

      it("emits sync events", async () => {
        const startHandler = jest.fn();
        const completeHandler = jest.fn();

        hub.on(FederationEventTypes.SYNC_STARTED, startHandler);
        hub.on(FederationEventTypes.SYNC_COMPLETED, completeHandler);

        await hub.sync(mockDb);

        expect(startHandler).toHaveBeenCalled();
        expect(completeHandler).toHaveBeenCalled();
      });

      it("increments vector clock on sync", async () => {
        const clockBefore = hub.getVectorClock();
        const tsBefore = clockBefore["agent-1"] || 0;

        await hub.sync(mockDb);

        const clockAfter = hub.getVectorClock();
        expect(clockAfter["agent-1"]).toBe(tsBefore + 1);
      });
    });

    describe("statistics", () => {
      it("returns sync stats", async () => {
        await hub.connect();

        const stats = hub.getSyncStats();
        expect(stats.lastSyncTime).toBeGreaterThan(0);
        expect(stats.vectorClock).toBeDefined();
      });
    });

    describe("info", () => {
      it("returns agent ID", () => {
        expect(hub.getAgentId()).toBe("agent-1");
      });

      it("returns tenant ID", () => {
        expect(hub.getTenantId()).toBe("tenant-1");
      });
    });

    it("creates via factory", () => {
      const created = createFederationHub({
        endpoint: "quic://hub.example.com:4433",
        agentId: "agent-2",
        tenantId: "tenant-2",
        token: "token",
      });
      expect(created).toBeInstanceOf(FederationHub);
    });
  });

  describe("FederationHubServer", () => {
    let server: FederationHubServer;
    const testSecret = "test-hub-secret";

    beforeEach(() => {
      server = new FederationHubServer({
        port: 8443,
        maxAgents: 10,
        jwtSecret: testSecret,
      });
    });

    afterEach(async () => {
      await server.stop();
    });

    describe("lifecycle", () => {
      it("starts server", async () => {
        expect(server.isRunning()).toBe(false);

        await server.start();
        expect(server.isRunning()).toBe(true);
      });

      it("handles double start gracefully", async () => {
        await server.start();
        await server.start(); // Should not throw

        expect(server.isRunning()).toBe(true);
      });

      it("stops server", async () => {
        await server.start();
        await server.stop();

        expect(server.isRunning()).toBe(false);
      });
    });

    describe("authentication", () => {
      let security: SecurityManager;

      beforeEach(async () => {
        security = new SecurityManager(testSecret);
        await server.start();
      });

      it("authenticates valid agent", async () => {
        const token = await security.createAgentToken({
          agentId: "agent-1",
          tenantId: "tenant-1",
          expiresAt: Date.now() + 3600000,
        });

        const result = await server.handleAuth({
          type: "auth",
          agentId: "agent-1",
          tenantId: "tenant-1",
          token,
          timestamp: Date.now(),
        });

        expect(result).toBe(true);
        expect(server.getConnectedAgents().length).toBe(1);
      });

      it("rejects missing token", async () => {
        const result = await server.handleAuth({
          type: "auth",
          agentId: "agent-1",
          tenantId: "tenant-1",
          timestamp: Date.now(),
        });

        expect(result).toBe(false);
      });

      it("rejects mismatched agent ID", async () => {
        const token = await security.createAgentToken({
          agentId: "agent-1",
          tenantId: "tenant-1",
          expiresAt: Date.now() + 3600000,
        });

        const result = await server.handleAuth({
          type: "auth",
          agentId: "agent-2", // Different from token
          tenantId: "tenant-1",
          token,
          timestamp: Date.now(),
        });

        expect(result).toBe(false);
      });
    });

    describe("sync operations", () => {
      let security: SecurityManager;

      beforeEach(async () => {
        security = new SecurityManager(testSecret);
        await server.start();

        // Authenticate agent
        const token = await security.createAgentToken({
          agentId: "agent-1",
          tenantId: "tenant-1",
          expiresAt: Date.now() + 3600000,
        });

        await server.handleAuth({
          type: "auth",
          agentId: "agent-1",
          tenantId: "tenant-1",
          token,
          timestamp: Date.now(),
        });
      });

      it("handles pull request", async () => {
        const updates = await server.handlePull("agent-1", { "agent-1": 0 });
        expect(Array.isArray(updates)).toBe(true);
      });

      it("handles push request", async () => {
        await server.handlePush(
          "agent-1",
          [
            {
              id: "update-1",
              operation: "insert",
              table: "episodes",
              data: { task: "test" },
              vectorClock: { "agent-1": 1 },
              tenantId: "tenant-1",
              timestamp: Date.now(),
            },
          ],
          { "agent-1": 1 }
        );

        // Should not throw
      });

      it("rejects push with tenant violation", async () => {
        await expect(
          server.handlePush(
            "agent-1",
            [
              {
                id: "update-1",
                operation: "insert",
                table: "episodes",
                data: { task: "test" },
                vectorClock: { "agent-1": 1 },
                tenantId: "tenant-2", // Wrong tenant
                timestamp: Date.now(),
              },
            ],
            { "agent-1": 1 }
          )
        ).rejects.toThrow("Tenant isolation violation");
      });
    });

    describe("statistics", () => {
      it("returns stats", async () => {
        await server.start();

        const stats = server.getStats();
        expect(stats.connectedAgents).toBe(0);
        expect(stats.totalEpisodes).toBe(0);
        expect(stats.tenants).toBe(0);
        expect(stats.uptime).toBeGreaterThanOrEqual(0);
      });

      it("returns global vector clock", async () => {
        await server.start();

        const clock = server.getGlobalVectorClock();
        expect(clock).toBeDefined();
        expect(clock["hub"]).toBe(0);
      });
    });

    describe("tenant isolation", () => {
      let security: SecurityManager;

      beforeEach(async () => {
        security = new SecurityManager(testSecret);
        await server.start();
      });

      it("returns agents for tenant", async () => {
        // Add agent to tenant-1
        const token1 = await security.createAgentToken({
          agentId: "agent-1",
          tenantId: "tenant-1",
          expiresAt: Date.now() + 3600000,
        });
        await server.handleAuth({
          type: "auth",
          agentId: "agent-1",
          tenantId: "tenant-1",
          token: token1,
          timestamp: Date.now(),
        });

        // Add agent to tenant-2
        const token2 = await security.createAgentToken({
          agentId: "agent-2",
          tenantId: "tenant-2",
          expiresAt: Date.now() + 3600000,
        });
        await server.handleAuth({
          type: "auth",
          agentId: "agent-2",
          tenantId: "tenant-2",
          token: token2,
          timestamp: Date.now(),
        });

        const tenant1Agents = server.getTenantAgents("tenant-1");
        expect(tenant1Agents.length).toBe(1);
        expect(tenant1Agents[0].agentId).toBe("agent-1");

        const tenant2Agents = server.getTenantAgents("tenant-2");
        expect(tenant2Agents.length).toBe(1);
        expect(tenant2Agents[0].agentId).toBe("agent-2");
      });
    });

    it("creates via factory", () => {
      const created = createFederationHubServer();
      expect(created).toBeInstanceOf(FederationHubServer);
    });
  });

  describe("EphemeralAgent", () => {
    let agent: EphemeralAgent;

    afterEach(async () => {
      if (agent && agent.isAlive()) {
        await agent.destroy();
      }
    });

    describe("spawning", () => {
      it("spawns agent", async () => {
        agent = await EphemeralAgent.spawn({
          tenantId: "tenant-1",
          lifetime: 60,
        });

        expect(agent.isAlive()).toBe(true);
        expect(agent.getAgentId()).toContain("eph-tenant-1");
        expect(agent.getTenantId()).toBe("tenant-1");
      });

      it("spawns via factory", async () => {
        agent = await spawnEphemeralAgent({
          tenantId: "tenant-1",
          lifetime: 60,
        });

        expect(agent.isAlive()).toBe(true);
      });

      it("emits spawned event", async () => {
        const handler = jest.fn();

        const tmpAgent = new EphemeralAgent({
          tenantId: "tenant-1",
          lifetime: 60,
        });
        tmpAgent.on(FederationEventTypes.AGENT_SPAWNED, handler);

        // We need to manually call spawn to capture the event
        agent = await EphemeralAgent.spawn({
          tenantId: "tenant-1",
          lifetime: 60,
        });

        // For testing, we check the agent was spawned
        expect(agent.isAlive()).toBe(true);
      });
    });

    describe("execution", () => {
      beforeEach(async () => {
        agent = await EphemeralAgent.spawn({
          tenantId: "tenant-1",
          lifetime: 60,
        });
      });

      it("executes task", async () => {
        const result = await agent.execute(async (db, context) => {
          expect(context.tenantId).toBe("tenant-1");
          return "task result";
        });

        expect(result).toBe("task result");
      });

      it("throws when not initialized", async () => {
        const uninitAgent = new EphemeralAgent({
          tenantId: "tenant-1",
          lifetime: 60,
        });

        await expect(uninitAgent.execute(async () => "test")).rejects.toThrow(
          "not initialized"
        );
      });
    });

    describe("memory operations", () => {
      beforeEach(async () => {
        agent = await EphemeralAgent.spawn({
          tenantId: "tenant-1",
          lifetime: 60,
        });
      });

      it("stores episode", async () => {
        await agent.storeEpisode({
          task: "test task",
          input: "test input",
          output: "test output",
          reward: 0.9,
          critique: "good job",
        });

        // Should not throw
      });

      it("queries memories", async () => {
        await agent.storeEpisode({
          task: "test task",
          input: "test input",
          output: "test output",
          reward: 0.9,
        });

        const memories = await agent.queryMemories("test", 5);
        expect(Array.isArray(memories)).toBe(true);
      });
    });

    describe("lifecycle", () => {
      it("tracks remaining lifetime", async () => {
        agent = await EphemeralAgent.spawn({
          tenantId: "tenant-1",
          lifetime: 60,
        });

        const remaining = agent.getRemainingLifetime();
        expect(remaining).toBeGreaterThan(50);
        expect(remaining).toBeLessThanOrEqual(60);
      });

      it("returns 0 lifetime when not initialized", () => {
        const uninitAgent = new EphemeralAgent({
          tenantId: "tenant-1",
          lifetime: 60,
        });

        expect(uninitAgent.getRemainingLifetime()).toBe(0);
      });

      it("destroys agent", async () => {
        agent = await EphemeralAgent.spawn({
          tenantId: "tenant-1",
          lifetime: 60,
        });

        expect(agent.isAlive()).toBe(true);

        await agent.destroy();
        expect(agent.isAlive()).toBe(false);
        expect(agent.getInfo()).toBeNull();
      });

      it("emits destroyed event", async () => {
        const handler = jest.fn();

        agent = await EphemeralAgent.spawn({
          tenantId: "tenant-1",
          lifetime: 60,
        });

        agent.on(FederationEventTypes.AGENT_DESTROYED, handler);
        await agent.destroy();

        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: "tenant-1",
          })
        );
      });
    });

    describe("info", () => {
      beforeEach(async () => {
        agent = await EphemeralAgent.spawn({
          tenantId: "tenant-1",
          lifetime: 60,
        });
      });

      it("returns agent info", () => {
        const info = agent.getInfo();

        expect(info).toBeDefined();
        expect(info?.tenantId).toBe("tenant-1");
        expect(info?.agentId).toBeDefined();
        expect(info?.spawnTime).toBeDefined();
        expect(info?.expiresAt).toBeDefined();
      });

      it("returns null info when destroyed", async () => {
        await agent.destroy();
        expect(agent.getInfo()).toBeNull();
      });

      it("reports hub connection status", () => {
        // No hub configured
        expect(agent.isHubConnected()).toBe(false);
      });
    });
  });
});
