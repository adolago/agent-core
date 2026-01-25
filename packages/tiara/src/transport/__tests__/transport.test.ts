import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import {
  QuicClient,
  QuicServer,
  QuicConnectionPool,
  QuicTransport,
  QuicHandshakeManager,
  createQuicClient,
  createQuicServer,
  createQuicTransport,
  createHandshakeManager,
  HandshakeState,
  TransportEventTypes,
} from "../index.js";

describe("transport module", () => {
  describe("QuicClient", () => {
    let client: QuicClient;

    beforeEach(() => {
      client = new QuicClient({
        serverHost: "localhost",
        serverPort: 4433,
      });
    });

    describe("initialization", () => {
      it("initializes successfully", async () => {
        expect(client.isInitialized()).toBe(false);
        await client.initialize();
        expect(client.isInitialized()).toBe(true);
      });

      it("handles double initialization gracefully", async () => {
        await client.initialize();
        await client.initialize(); // Should not throw
        expect(client.isInitialized()).toBe(true);
      });
    });

    describe("connections", () => {
      beforeEach(async () => {
        await client.initialize();
      });

      it("connects to server", async () => {
        const conn = await client.connect();
        expect(conn.id).toBe("localhost:4433");
        expect(conn.remoteAddr).toBe("localhost:4433");
        expect(conn.streamCount).toBe(0);
      });

      it("connects with custom host and port", async () => {
        const conn = await client.connect("example.com", 443);
        expect(conn.id).toBe("example.com:443");
      });

      it("reuses existing connection", async () => {
        const conn1 = await client.connect();
        const conn2 = await client.connect();
        expect(conn1.id).toBe(conn2.id);
      });

      it("throws when not initialized", async () => {
        const uninitClient = new QuicClient();
        await expect(uninitClient.connect()).rejects.toThrow("not initialized");
      });

      it("enforces max connections", async () => {
        const limitedClient = new QuicClient({ maxConnections: 2 });
        await limitedClient.initialize();

        await limitedClient.connect("host1.com", 443);
        await limitedClient.connect("host2.com", 443);

        await expect(limitedClient.connect("host3.com", 443)).rejects.toThrow(
          "Maximum connections"
        );
      });

      it("closes connection", async () => {
        const conn = await client.connect();
        expect(client.getConnection(conn.id)).toBeDefined();

        await client.closeConnection(conn.id);
        expect(client.getConnection(conn.id)).toBeUndefined();
      });

      it("emits connection events", async () => {
        const establishedHandler = jest.fn();
        const closedHandler = jest.fn();

        client.on(TransportEventTypes.CONNECTION_ESTABLISHED, establishedHandler);
        client.on(TransportEventTypes.CONNECTION_CLOSED, closedHandler);

        const conn = await client.connect();
        expect(establishedHandler).toHaveBeenCalledWith(
          expect.objectContaining({ connectionId: conn.id })
        );

        await client.closeConnection(conn.id);
        expect(closedHandler).toHaveBeenCalledWith(
          expect.objectContaining({ connectionId: conn.id })
        );
      });
    });

    describe("streams", () => {
      beforeEach(async () => {
        await client.initialize();
      });

      it("creates stream on connection", async () => {
        const conn = await client.connect();
        const stream = await client.createStream(conn.id);

        expect(stream.id).toBe(0);
        expect(stream.connectionId).toBe(conn.id);
      });

      it("throws for non-existent connection", async () => {
        await expect(client.createStream("non-existent")).rejects.toThrow(
          "Connection non-existent not found"
        );
      });

      it("enforces max concurrent streams", async () => {
        const limitedClient = new QuicClient({ maxConcurrentStreams: 2 });
        await limitedClient.initialize();
        const conn = await limitedClient.connect();

        await limitedClient.createStream(conn.id);
        await limitedClient.createStream(conn.id);

        await expect(limitedClient.createStream(conn.id)).rejects.toThrow(
          "Maximum concurrent streams"
        );
      });

      it("increments stream count", async () => {
        const conn = await client.connect();
        expect(client.getConnection(conn.id)?.streamCount).toBe(0);

        await client.createStream(conn.id);
        expect(client.getConnection(conn.id)?.streamCount).toBe(1);

        await client.createStream(conn.id);
        expect(client.getConnection(conn.id)?.streamCount).toBe(2);
      });

      it("decrements stream count on close", async () => {
        const conn = await client.connect();
        const stream = await client.createStream(conn.id);

        expect(client.getConnection(conn.id)?.streamCount).toBe(1);

        await stream.close();
        expect(client.getConnection(conn.id)?.streamCount).toBe(0);
      });

      it("emits stream events", async () => {
        const openedHandler = jest.fn();
        const closedHandler = jest.fn();

        client.on(TransportEventTypes.STREAM_OPENED, openedHandler);
        client.on(TransportEventTypes.STREAM_CLOSED, closedHandler);

        const conn = await client.connect();
        const stream = await client.createStream(conn.id);

        expect(openedHandler).toHaveBeenCalledWith(
          expect.objectContaining({ connectionId: conn.id, streamId: stream.id })
        );

        await stream.close();
        expect(closedHandler).toHaveBeenCalledWith(
          expect.objectContaining({ connectionId: conn.id, streamId: stream.id })
        );
      });
    });

    describe("statistics", () => {
      it("returns stats", async () => {
        await client.initialize();
        await client.connect("host1.com", 443);
        await client.connect("host2.com", 443);

        const stats = client.getStats();
        expect(stats.activeConnections).toBe(2);
        expect(stats.totalConnections).toBe(2);
      });

      it("tracks bytes sent", async () => {
        await client.initialize();
        const conn = await client.connect();
        const stream = await client.createStream(conn.id);

        const data = new Uint8Array([1, 2, 3, 4, 5]);
        await stream.send(data);

        const stats = client.getStats();
        expect(stats.bytesSent).toBe(5);
      });
    });

    describe("shutdown", () => {
      it("closes all connections", async () => {
        await client.initialize();
        await client.connect("host1.com", 443);
        await client.connect("host2.com", 443);

        expect(client.getConnections().length).toBe(2);

        await client.shutdown();
        expect(client.getConnections().length).toBe(0);
        expect(client.isInitialized()).toBe(false);
      });
    });

    describe("configuration", () => {
      it("returns config", () => {
        const config = client.getConfig();
        expect(config.serverHost).toBe("localhost");
        expect(config.serverPort).toBe(4433);
      });
    });
  });

  describe("QuicServer", () => {
    let server: QuicServer;

    beforeEach(() => {
      server = new QuicServer({
        host: "0.0.0.0",
        port: 4433,
      });
    });

    describe("initialization", () => {
      it("initializes successfully", async () => {
        expect(server.isInitialized()).toBe(false);
        await server.initialize();
        expect(server.isInitialized()).toBe(true);
      });
    });

    describe("listening", () => {
      it("starts listening", async () => {
        await server.initialize();
        expect(server.isListening()).toBe(false);

        await server.listen();
        expect(server.isListening()).toBe(true);
      });

      it("throws when not initialized", async () => {
        await expect(server.listen()).rejects.toThrow("not initialized");
      });

      it("handles double listen gracefully", async () => {
        await server.initialize();
        await server.listen();
        await server.listen(); // Should not throw
        expect(server.isListening()).toBe(true);
      });
    });

    describe("stop", () => {
      it("stops server", async () => {
        await server.initialize();
        await server.listen();
        expect(server.isListening()).toBe(true);

        await server.stop();
        expect(server.isListening()).toBe(false);
      });
    });

    describe("address", () => {
      it("returns server address", () => {
        expect(server.getAddress()).toBe("0.0.0.0:4433");
      });
    });

    describe("statistics", () => {
      it("returns stats", async () => {
        await server.initialize();
        const stats = server.getStats();
        expect(stats.activeConnections).toBe(0);
      });
    });
  });

  describe("QuicConnectionPool", () => {
    let client: QuicClient;
    let pool: QuicConnectionPool;

    beforeEach(async () => {
      client = new QuicClient();
      await client.initialize();
      pool = new QuicConnectionPool(client, 3);
    });

    it("creates connection", async () => {
      const conn = await pool.getConnection("localhost", 443);
      expect(conn.id).toBe("localhost:443");
      expect(pool.getSize()).toBe(1);
    });

    it("reuses existing connection", async () => {
      const conn1 = await pool.getConnection("localhost", 443);
      const conn2 = await pool.getConnection("localhost", 443);
      expect(conn1.id).toBe(conn2.id);
      expect(pool.getSize()).toBe(1);
    });

    it("evicts oldest when full", async () => {
      await pool.getConnection("host1.com", 443);

      // Add delay to ensure different lastActivity times
      await new Promise((r) => setTimeout(r, 10));
      await pool.getConnection("host2.com", 443);

      await new Promise((r) => setTimeout(r, 10));
      await pool.getConnection("host3.com", 443);

      expect(pool.getSize()).toBe(3);

      // This should evict host1
      await new Promise((r) => setTimeout(r, 10));
      await pool.getConnection("host4.com", 443);

      expect(pool.getSize()).toBe(3);
    });

    it("clears all connections", async () => {
      await pool.getConnection("host1.com", 443);
      await pool.getConnection("host2.com", 443);
      expect(pool.getSize()).toBe(2);

      await pool.clear();
      expect(pool.getSize()).toBe(0);
    });

    it("reports max size", () => {
      expect(pool.getMaxSize()).toBe(3);
    });
  });

  describe("QuicTransport", () => {
    let transport: QuicTransport;

    beforeEach(() => {
      transport = new QuicTransport({
        host: "localhost",
        port: 4433,
      });
    });

    it("connects and disconnects", async () => {
      expect(transport.isConnected()).toBe(false);

      await transport.connect();
      expect(transport.isConnected()).toBe(true);

      await transport.close();
      expect(transport.isConnected()).toBe(false);
    });

    it("throws when sending without connection", async () => {
      await expect(transport.send({ data: "test" })).rejects.toThrow("Not connected");
    });

    it("sends data", async () => {
      await transport.connect();
      await transport.send({ data: "test" });
      // Should not throw
    });

    it("returns stats", async () => {
      await transport.connect();
      const stats = transport.getStats();
      expect(stats.activeConnections).toBe(1);
    });
  });

  describe("QuicHandshakeManager", () => {
    let manager: QuicHandshakeManager;

    beforeEach(() => {
      manager = new QuicHandshakeManager();
    });

    describe("handshake initiation", () => {
      it("initiates handshake", async () => {
        const success = await manager.initiateHandshake("conn-1", "localhost:443");

        // With graceful degradation, should succeed
        expect(success).toBe(true);
        expect(manager.isEstablished("conn-1")).toBe(true);
      });

      it("emits handshake complete event", async () => {
        const handler = jest.fn();
        manager.on(TransportEventTypes.HANDSHAKE_COMPLETE, handler);

        await manager.initiateHandshake("conn-1", "localhost:443");

        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({
            connectionId: "conn-1",
            remoteAddr: "localhost:443",
          })
        );
      });
    });

    describe("state management", () => {
      it("tracks handshake state", async () => {
        expect(manager.getHandshakeState("conn-1")).toBe(HandshakeState.Initial);

        await manager.initiateHandshake("conn-1", "localhost:443");
        expect(manager.getHandshakeState("conn-1")).toBe(HandshakeState.Established);
      });

      it("checks if established", async () => {
        expect(manager.isEstablished("conn-1")).toBe(false);

        await manager.initiateHandshake("conn-1", "localhost:443");
        expect(manager.isEstablished("conn-1")).toBe(true);
      });

      it("closes handshake", async () => {
        await manager.initiateHandshake("conn-1", "localhost:443");
        expect(manager.isEstablished("conn-1")).toBe(true);

        manager.closeHandshake("conn-1");
        expect(manager.getHandshakeState("conn-1")).toBe(HandshakeState.Initial);
      });
    });

    describe("active handshakes", () => {
      it("lists active handshakes", async () => {
        await manager.initiateHandshake("conn-1", "host1:443");
        await manager.initiateHandshake("conn-2", "host2:443");

        const active = manager.getActiveHandshakes();
        expect(active).toContain("conn-1");
        expect(active).toContain("conn-2");
        expect(active.length).toBe(2);
      });

      it("excludes closed handshakes", async () => {
        await manager.initiateHandshake("conn-1", "host1:443");
        await manager.initiateHandshake("conn-2", "host2:443");

        manager.closeHandshake("conn-1");

        const active = manager.getActiveHandshakes();
        expect(active).not.toContain("conn-1");
        expect(active).toContain("conn-2");
      });
    });

    describe("context management", () => {
      it("gets context", async () => {
        await manager.initiateHandshake("conn-1", "localhost:443");

        const context = manager.getContext("conn-1");
        expect(context).toBeDefined();
        expect(context?.connectionId).toBe("conn-1");
        expect(context?.remoteAddr).toBe("localhost:443");
      });

      it("gets all contexts", async () => {
        await manager.initiateHandshake("conn-1", "host1:443");
        await manager.initiateHandshake("conn-2", "host2:443");

        const contexts = manager.getAllContexts();
        expect(contexts.length).toBe(2);
      });
    });
  });

  describe("Factory functions", () => {
    it("creates QuicClient", () => {
      const client = createQuicClient();
      expect(client).toBeInstanceOf(QuicClient);
    });

    it("creates QuicServer", () => {
      const server = createQuicServer();
      expect(server).toBeInstanceOf(QuicServer);
    });

    it("creates QuicTransport", () => {
      const transport = createQuicTransport();
      expect(transport).toBeInstanceOf(QuicTransport);
    });

    it("creates HandshakeManager", () => {
      const manager = createHandshakeManager();
      expect(manager).toBeInstanceOf(QuicHandshakeManager);
    });
  });
});
