/**
 * AgentCoreClient Tests
 *
 * Tests for the agent-core client that communicates with the daemon.
 * Uses mock responses in test mode.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Set test mode before imports
process.env.TIARA_TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('AgentCoreClient', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('Connection Management', () => {
    it('should check daemon health', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: [] })
      } as Response);

      const { createAgentCoreClient } = await import('../../../src/agent-core/client');
      const client = createAgentCoreClient({ baseUrl: 'http://localhost:3210' });

      // isDaemonRunning should call /session endpoint
      const isRunning = await client.isDaemonRunning();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/session'),
        expect.any(Object)
      );
      expect(isRunning).toBe(true);
    });

    it('should handle connection timeout', async () => {
      // Mock all retry attempts to fail
      mockFetch.mockImplementation(() =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 10)
        )
      );

      const { createAgentCoreClient } = await import('../../../src/agent-core/client');
      const client = createAgentCoreClient({
        baseUrl: 'http://localhost:3210',
        timeoutMs: 50
      });

      const isRunning = await client.isDaemonRunning();
      expect(isRunning).toBe(false);
    });

    it('should handle connection refused', async () => {
      // Mock all retry attempts to fail
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const { createAgentCoreClient } = await import('../../../src/agent-core/client');
      const client = createAgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const isRunning = await client.isDaemonRunning();
      expect(isRunning).toBe(false);
    });
  });

  describe('Session Management', () => {
    it('should create a new session', async () => {
      const sessionId = 'test-session-123';
      // First call: ensureConnected (isDaemonRunning)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: [] })
      } as Response);
      // Second call: createSession
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: sessionId, title: 'Test Session' })
      } as Response);

      const { createAgentCoreClient } = await import('../../../src/agent-core/client');
      const client = createAgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const session = await client.createSession({ title: 'Test Session' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/session'),
        expect.objectContaining({
          method: 'POST'
        })
      );
      expect(session.id).toBe(sessionId);
    });

    it('should delete a session', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      } as Response);

      const { createAgentCoreClient } = await import('../../../src/agent-core/client');
      const client = createAgentCoreClient({ baseUrl: 'http://localhost:3210' });

      await client.deleteSession('test-session-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/session/test-session-123'),
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });
  });

  describe('MCP Tool Calling', () => {
    it('should call MCP tool via daemon', async () => {
      const toolResult = { result: 'success', data: { key: 'value' } };
      // First call: ensureConnected (isDaemonRunning)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: [] })
      } as Response);
      // Second call: callMcpTool
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => toolResult
      } as Response);

      const { createAgentCoreClient } = await import('../../../src/agent-core/client');
      const client = createAgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const result = await client.callMcpTool('test-server', 'test-tool', { arg: 'value' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/mcp'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('test-tool')
        })
      );
    });

    it('should handle MCP tool errors', async () => {
      // First call: ensureConnected (isDaemonRunning)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: [] })
      } as Response);
      // Second call: callMcpTool fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Tool execution failed'
      } as Response);

      const { createAgentCoreClient } = await import('../../../src/agent-core/client');
      const client = createAgentCoreClient({ baseUrl: 'http://localhost:3210' });

      await expect(
        client.callMcpTool('test-server', 'failing-tool', {})
      ).rejects.toThrow();
    });
  });

  describe('Prompt Execution', () => {
    it('should send prompt with callbacks', async () => {
      // Mock non-streaming JSON response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          parts: [
            { type: 'text', text: 'Hello World' }
          ],
          info: {
            tokens: { input: 10, output: 5 }
          }
        })
      } as Response);

      const { createAgentCoreClient } = await import('../../../src/agent-core/client');
      const client = createAgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const textChunks: string[] = [];
      const result = await client.prompt(
        { sessionId: 'test', prompt: 'Hello' },
        { onText: (text) => textChunks.push(text) }
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/session/test/message'),
        expect.any(Object)
      );
      expect(result.success).toBe(true);
      expect(result.text).toBe('Hello World');
    });

    it('should handle abort signal', async () => {
      const controller = new AbortController();

      mockFetch.mockImplementation(() =>
        new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        })
      );

      const { createAgentCoreClient } = await import('../../../src/agent-core/client');
      const client = createAgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const promptPromise = client.prompt(
        { sessionId: 'test', prompt: 'Hello', signal: controller.signal },
        {}
      );

      controller.abort();

      // Implementation returns result object with aborted: true instead of throwing
      const result = await promptPromise;
      expect(result.success).toBe(false);
      expect(result.aborted).toBe(true);
    });
  });

  describe('SPARC Execution', () => {
    it('should execute SPARC methodology', async () => {
      // Mock fetch calls:
      // 1. ensureConnected for createSession
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: [] })
      } as Response);
      // 2. createSession
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'sparc-session', title: 'test' })
      } as Response);
      // 3. prompt call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          parts: [{ type: 'text', text: 'SPARC result' }],
          info: { tokens: { input: 100, output: 50 } }
        })
      } as Response);
      // 4. deleteSession
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      } as Response);

      const { createAgentCoreClient } = await import('../../../src/agent-core/client');
      const client = createAgentCoreClient({ baseUrl: 'http://localhost:3210' });

      const result = await client.executeSPARC({
        task: 'Build a REST API',
        mode: 'code',
        context: { project: 'Node.js project' }
      });

      expect(mockFetch).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.phase).toBe('code');
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance from getAgentCoreClient', async () => {
      const { getAgentCoreClient } = await import('../../../src/agent-core/client');

      const client1 = getAgentCoreClient();
      const client2 = getAgentCoreClient();

      expect(client1).toBe(client2);
    });

    it('should create new instance with createAgentCoreClient', async () => {
      const { createAgentCoreClient } = await import('../../../src/agent-core/client');

      const client1 = createAgentCoreClient({ baseUrl: 'http://localhost:3210' });
      const client2 = createAgentCoreClient({ baseUrl: 'http://localhost:3211' });

      expect(client1).not.toBe(client2);
    });
  });
});
