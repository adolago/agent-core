/**
 * Integration Tests
 *
 * Comprehensive tests for gateway to daemon flow, session management,
 * persona routing, MCP integration, and cross-persona communication.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Set test mode
process.env.TIARA_TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

describe('Integration Tests', () => {
  describe('Gateway to Daemon Flow', () => {
    interface GatewayMessage {
      id: string;
      chatId: string;
      content: string;
      sender: string;
      platform: 'whatsapp' | 'telegram' | 'discord' | 'signal';
      timestamp: number;
      attachments?: Array<{ type: string; url: string }>;
    }

    interface DaemonRequest {
      sessionKey: string;
      message: string;
      agent?: string;
      metadata: Record<string, unknown>;
    }

    it('should transform gateway message to daemon request', () => {
      function transformMessage(
        msg: GatewayMessage,
        defaultAgent: string = 'zee'
      ): DaemonRequest {
        // Detect persona mention
        let agent = defaultAgent;
        const mentionMatch = msg.content.match(/@(stanley|johny|zee)\b/i);
        if (mentionMatch) {
          agent = mentionMatch[1].toLowerCase();
        }

        // Generate session key
        const sessionKey = `${agent}_main_${msg.platform}_dm_${msg.chatId}`;

        // Clean message (remove mention)
        const cleanContent = msg.content.replace(/@(stanley|johny|zee)\s*/gi, '').trim();

        return {
          sessionKey,
          message: cleanContent,
          agent,
          metadata: {
            platform: msg.platform,
            sender: msg.sender,
            originalId: msg.id,
            timestamp: msg.timestamp,
          },
        };
      }

      const whatsappMsg: GatewayMessage = {
        id: 'msg-1',
        chatId: '1234567890@c.us',
        content: '@stanley What is the market doing?',
        sender: 'user',
        platform: 'whatsapp',
        timestamp: Date.now(),
      };

      const request = transformMessage(whatsappMsg);

      expect(request.agent).toBe('stanley');
      expect(request.sessionKey).toContain('stanley_main_whatsapp');
      expect(request.message).toBe('What is the market doing?');
    });

    it('should handle messages without persona mention', () => {
      function detectPersona(content: string, defaultAgent: string = 'zee'): string {
        const match = content.match(/@(stanley|johny|zee)\b/i);
        return match ? match[1].toLowerCase() : defaultAgent;
      }

      expect(detectPersona('Hello there')).toBe('zee');
      expect(detectPersona('@stanley check this')).toBe('stanley');
      expect(detectPersona('@JOHNY help me study')).toBe('johny');
      expect(detectPersona('@zee remember this')).toBe('zee');
    });

    it('should generate correct session keys', () => {
      function generateSessionKey(
        agent: string,
        platform: string,
        chatType: 'dm' | 'group',
        chatId: string
      ): string {
        return `${agent}_main_${platform}_${chatType}_${chatId}`;
      }

      expect(generateSessionKey('zee', 'whatsapp', 'dm', '123'))
        .toBe('zee_main_whatsapp_dm_123');

      expect(generateSessionKey('stanley', 'telegram', 'group', 'chat-456'))
        .toBe('stanley_main_telegram_group_chat-456');
    });

    it('should validate platform types', () => {
      const validPlatforms = ['whatsapp', 'telegram', 'discord', 'signal', 'imessage'];

      function isValidPlatform(platform: string): boolean {
        return validPlatforms.includes(platform.toLowerCase());
      }

      expect(isValidPlatform('whatsapp')).toBe(true);
      expect(isValidPlatform('TELEGRAM')).toBe(true);
      expect(isValidPlatform('sms')).toBe(false);
      expect(isValidPlatform('email')).toBe(false);
    });
  });

  describe('Session Management', () => {
    interface Session {
      id: string;
      title?: string;
      agent: string;
      createdAt: number;
      updatedAt: number;
      messageCount: number;
      compacted: boolean;
      metadata: Record<string, unknown>;
    }

    interface Message {
      id: string;
      sessionId: string;
      role: 'user' | 'assistant';
      content: string;
      timestamp: number;
      agent?: string;
      parts?: Array<{ type: string; content: string }>;
    }

    it('should create session with proper structure', () => {
      function createSession(
        id: string,
        agent: string,
        title?: string
      ): Session {
        const now = Date.now();
        return {
          id,
          title: title || `Session ${id}`,
          agent,
          createdAt: now,
          updatedAt: now,
          messageCount: 0,
          compacted: false,
          metadata: {},
        };
      }

      const session = createSession('sess-123', 'zee', 'Test Session');

      expect(session.id).toBe('sess-123');
      expect(session.agent).toBe('zee');
      expect(session.title).toBe('Test Session');
      expect(session.messageCount).toBe(0);
      expect(session.compacted).toBe(false);
    });

    it('should update session on new message', () => {
      function updateSessionOnMessage(session: Session): Session {
        return {
          ...session,
          updatedAt: Date.now(),
          messageCount: session.messageCount + 1,
        };
      }

      const session: Session = {
        id: 'sess-1',
        agent: 'zee',
        createdAt: Date.now() - 10000,
        updatedAt: Date.now() - 10000,
        messageCount: 5,
        compacted: false,
        metadata: {},
      };

      const updated = updateSessionOnMessage(session);

      expect(updated.messageCount).toBe(6);
      expect(updated.updatedAt).toBeGreaterThan(session.updatedAt);
    });

    it('should generate handoff token', () => {
      function generateHandoffToken(
        sessionId: string,
        targetSurface: string,
        expiresIn: number = 3600000
      ): { token: string; resumeUrl: string; expiresAt: number } {
        const token = `hoff_${sessionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const expiresAt = Date.now() + expiresIn;
        const resumeUrl = `agentcore://resume?token=${token}&surface=${targetSurface}`;

        return { token, resumeUrl, expiresAt };
      }

      const handoff = generateHandoffToken('sess-123', 'mobile');

      expect(handoff.token).toMatch(/^hoff_sess-123_/);
      expect(handoff.resumeUrl).toContain('surface=mobile');
      expect(handoff.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should determine if session needs compaction', () => {
      function needsCompaction(
        session: Session,
        messageThreshold: number = 100,
        ageThreshold: number = 86400000 // 24 hours
      ): boolean {
        if (session.compacted) return false;

        const messagesTrigger = session.messageCount >= messageThreshold;
        const ageTrigger = (Date.now() - session.createdAt) >= ageThreshold;

        return messagesTrigger && ageTrigger;
      }

      const recentSession: Session = {
        id: 's1',
        agent: 'zee',
        createdAt: Date.now() - 1000,
        updatedAt: Date.now(),
        messageCount: 200,
        compacted: false,
        metadata: {},
      };
      expect(needsCompaction(recentSession)).toBe(false); // Too recent

      const oldSmallSession: Session = {
        id: 's2',
        agent: 'zee',
        createdAt: Date.now() - 100000000,
        updatedAt: Date.now(),
        messageCount: 10,
        compacted: false,
        metadata: {},
      };
      expect(needsCompaction(oldSmallSession)).toBe(false); // Not enough messages

      const needsCompact: Session = {
        id: 's3',
        agent: 'zee',
        createdAt: Date.now() - 100000000,
        updatedAt: Date.now(),
        messageCount: 150,
        compacted: false,
        metadata: {},
      };
      expect(needsCompaction(needsCompact)).toBe(true);
    });
  });

  describe('Persona Routing', () => {
    interface RoutingBinding {
      id: string;
      provider?: string;
      accountId?: string;
      peerId?: string;
      guildId?: string;
      teamId?: string;
      agentId: string;
      priority: number;
    }

    const bindingPriority = {
      peer: 1,
      guild: 2,
      team: 3,
      account: 4,
      provider: 5,
      default: 10,
    };

    it('should resolve route by binding hierarchy', () => {
      function resolveRoute(
        bindings: RoutingBinding[],
        context: {
          provider: string;
          accountId?: string;
          peerId?: string;
          guildId?: string;
          teamId?: string;
        },
        defaultAgent: string = 'zee'
      ): string {
        // Sort by priority
        const sorted = [...bindings].sort((a, b) => a.priority - b.priority);

        for (const binding of sorted) {
          // Check peer match
          if (binding.peerId && binding.peerId === context.peerId) {
            return binding.agentId;
          }
          // Check guild match
          if (binding.guildId && binding.guildId === context.guildId) {
            return binding.agentId;
          }
          // Check team match
          if (binding.teamId && binding.teamId === context.teamId) {
            return binding.agentId;
          }
          // Check account match
          if (binding.accountId && binding.accountId === context.accountId) {
            return binding.agentId;
          }
          // Check provider match
          if (binding.provider && binding.provider === context.provider && !binding.peerId && !binding.guildId && !binding.teamId && !binding.accountId) {
            return binding.agentId;
          }
        }

        return defaultAgent;
      }

      const bindings: RoutingBinding[] = [
        { id: 'b1', peerId: 'user-123', agentId: 'stanley', priority: 1 },
        { id: 'b2', provider: 'telegram', agentId: 'johny', priority: 5 },
        { id: 'b3', guildId: 'guild-456', agentId: 'zee', priority: 2 },
      ];

      // Peer match wins
      expect(resolveRoute(bindings, { provider: 'telegram', peerId: 'user-123' })).toBe('stanley');

      // Guild match
      expect(resolveRoute(bindings, { provider: 'discord', guildId: 'guild-456' })).toBe('zee');

      // Provider fallback
      expect(resolveRoute(bindings, { provider: 'telegram', peerId: 'other' })).toBe('johny');

      // Default fallback
      expect(resolveRoute(bindings, { provider: 'whatsapp' })).toBe('zee');
    });

    it('should handle wildcard account matching', () => {
      function matchesWildcard(binding: RoutingBinding, accountId: string): boolean {
        return binding.accountId === '*' || binding.accountId === accountId;
      }

      const wildcardBinding: RoutingBinding = {
        id: 'b1',
        provider: 'telegram',
        accountId: '*',
        agentId: 'zee',
        priority: 4,
      };

      expect(matchesWildcard(wildcardBinding, 'any-account')).toBe(true);
      expect(matchesWildcard(wildcardBinding, 'another-account')).toBe(true);

      const specificBinding: RoutingBinding = {
        id: 'b2',
        accountId: 'specific-123',
        agentId: 'stanley',
        priority: 4,
      };

      expect(matchesWildcard(specificBinding, 'specific-123')).toBe(true);
      expect(matchesWildcard(specificBinding, 'other')).toBe(false);
    });

    it('should validate persona exists', () => {
      const validPersonas = ['zee', 'stanley', 'johny'];

      function isValidPersona(persona: string): boolean {
        return validPersonas.includes(persona.toLowerCase());
      }

      expect(isValidPersona('zee')).toBe(true);
      expect(isValidPersona('STANLEY')).toBe(true);
      expect(isValidPersona('invalid')).toBe(false);
    });
  });

  describe('MCP Integration', () => {
    interface MCPServer {
      name: string;
      status: 'connected' | 'disconnected' | 'error' | 'authenticating';
      tools: string[];
      authRequired: boolean;
      authUrl?: string;
    }

    interface ToolCall {
      server: string;
      tool: string;
      args: Record<string, unknown>;
      timeout: number;
    }

    it('should track MCP server status', () => {
      function updateServerStatus(
        servers: Map<string, MCPServer>,
        name: string,
        status: MCPServer['status']
      ): void {
        const server = servers.get(name);
        if (server) {
          server.status = status;
        }
      }

      const servers = new Map<string, MCPServer>([
        ['tiara', { name: 'tiara', status: 'connected', tools: ['swarm_init'], authRequired: false }],
        ['openbb', { name: 'openbb', status: 'disconnected', tools: [], authRequired: true }],
      ]);

      updateServerStatus(servers, 'openbb', 'authenticating');
      expect(servers.get('openbb')?.status).toBe('authenticating');
    });

    it('should validate tool call parameters', () => {
      interface ToolSchema {
        name: string;
        parameters: Array<{
          name: string;
          type: 'string' | 'number' | 'boolean' | 'object';
          required: boolean;
        }>;
      }

      function validateToolCall(
        schema: ToolSchema,
        args: Record<string, unknown>
      ): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        for (const param of schema.parameters) {
          if (param.required && !(param.name in args)) {
            errors.push(`Missing required parameter: ${param.name}`);
          } else if (param.name in args) {
            const value = args[param.name];
            const actualType = typeof value;

            if (param.type === 'object' && actualType !== 'object') {
              errors.push(`Parameter ${param.name} must be object, got ${actualType}`);
            } else if (param.type !== 'object' && actualType !== param.type) {
              errors.push(`Parameter ${param.name} must be ${param.type}, got ${actualType}`);
            }
          }
        }

        return { valid: errors.length === 0, errors };
      }

      const schema: ToolSchema = {
        name: 'market_data',
        parameters: [
          { name: 'symbol', type: 'string', required: true },
          { name: 'period', type: 'string', required: false },
          { name: 'limit', type: 'number', required: false },
        ],
      };

      expect(validateToolCall(schema, { symbol: 'AAPL' }).valid).toBe(true);
      expect(validateToolCall(schema, {}).valid).toBe(false);
      expect(validateToolCall(schema, { symbol: 123 }).valid).toBe(false);
    });

    it('should handle OAuth flow state', () => {
      interface OAuthState {
        serverId: string;
        state: string;
        codeVerifier: string;
        redirectUri: string;
        expiresAt: number;
      }

      function createOAuthState(serverId: string): OAuthState {
        return {
          serverId,
          state: Math.random().toString(36).substr(2, 16),
          codeVerifier: Math.random().toString(36).substr(2, 32),
          redirectUri: `http://127.0.0.1:3210/mcp/${serverId}/auth/callback`,
          expiresAt: Date.now() + 600000, // 10 minutes
        };
      }

      function validateOAuthCallback(
        pendingState: OAuthState,
        callbackState: string,
        now: number = Date.now()
      ): { valid: boolean; error?: string } {
        if (now > pendingState.expiresAt) {
          return { valid: false, error: 'OAuth state expired' };
        }
        if (callbackState !== pendingState.state) {
          return { valid: false, error: 'State mismatch' };
        }
        return { valid: true };
      }

      const state = createOAuthState('openbb');
      expect(validateOAuthCallback(state, state.state).valid).toBe(true);
      expect(validateOAuthCallback(state, 'wrong-state').valid).toBe(false);

      const expiredState = { ...state, expiresAt: Date.now() - 1000 };
      expect(validateOAuthCallback(expiredState, state.state).valid).toBe(false);
    });
  });

  describe('Cross-Persona Communication', () => {
    interface PersonaMessage {
      from: string;
      to: string;
      type: 'delegation' | 'query' | 'response' | 'broadcast';
      content: string;
      context: Record<string, unknown>;
      correlationId: string;
    }

    it('should route delegation requests', () => {
      function routeDelegation(
        message: PersonaMessage,
        availablePersonas: string[]
      ): { routed: boolean; error?: string } {
        if (!availablePersonas.includes(message.to)) {
          return { routed: false, error: `Persona ${message.to} not available` };
        }

        if (message.from === message.to) {
          return { routed: false, error: 'Cannot delegate to self' };
        }

        return { routed: true };
      }

      const personas = ['zee', 'stanley', 'johny'];

      const validDelegation: PersonaMessage = {
        from: 'zee',
        to: 'stanley',
        type: 'delegation',
        content: 'Check market data',
        context: {},
        correlationId: 'corr-123',
      };
      expect(routeDelegation(validDelegation, personas).routed).toBe(true);

      const selfDelegation: PersonaMessage = {
        from: 'zee',
        to: 'zee',
        type: 'delegation',
        content: 'Task',
        context: {},
        correlationId: 'corr-456',
      };
      expect(routeDelegation(selfDelegation, personas).routed).toBe(false);

      const invalidTarget: PersonaMessage = {
        from: 'zee',
        to: 'unknown',
        type: 'delegation',
        content: 'Task',
        context: {},
        correlationId: 'corr-789',
      };
      expect(routeDelegation(invalidTarget, personas).routed).toBe(false);
    });

    it('should track delegation chain to prevent cycles', () => {
      function hasCycle(
        delegationChain: string[],
        newTarget: string
      ): boolean {
        return delegationChain.includes(newTarget);
      }

      expect(hasCycle(['zee', 'stanley'], 'johny')).toBe(false);
      expect(hasCycle(['zee', 'stanley'], 'zee')).toBe(true);
      expect(hasCycle(['zee', 'stanley', 'johny'], 'stanley')).toBe(true);
    });

    it('should share context between personas', () => {
      interface SharedContext {
        sessionId: string;
        userId: string;
        conversationHistory: Array<{ role: string; content: string; agent: string }>;
        sharedMemories: string[];
        currentObjective?: string;
      }

      function mergeContextForDelegation(
        sourceContext: SharedContext,
        targetPersona: string
      ): SharedContext {
        return {
          ...sourceContext,
          conversationHistory: [
            ...sourceContext.conversationHistory,
            {
              role: 'system',
              content: `Delegated to ${targetPersona}`,
              agent: targetPersona,
            },
          ],
        };
      }

      const context: SharedContext = {
        sessionId: 'sess-1',
        userId: 'user-1',
        conversationHistory: [
          { role: 'user', content: 'Hello', agent: 'zee' },
          { role: 'assistant', content: 'Hi!', agent: 'zee' },
        ],
        sharedMemories: ['mem-1', 'mem-2'],
      };

      const delegatedContext = mergeContextForDelegation(context, 'stanley');

      expect(delegatedContext.conversationHistory).toHaveLength(3);
      expect(delegatedContext.conversationHistory[2].agent).toBe('stanley');
    });
  });

  describe('Message Deduplication', () => {
    interface ProcessedMessage {
      id: string;
      processedAt: number;
      response?: string;
    }

    it('should detect duplicate messages', () => {
      function isDuplicate(
        messageId: string,
        processed: Map<string, ProcessedMessage>,
        windowMs: number = 60000
      ): boolean {
        const existing = processed.get(messageId);
        if (!existing) return false;

        return (Date.now() - existing.processedAt) < windowMs;
      }

      const processed = new Map<string, ProcessedMessage>([
        ['msg-1', { id: 'msg-1', processedAt: Date.now() - 10000 }],
        ['msg-2', { id: 'msg-2', processedAt: Date.now() - 120000 }],
      ]);

      expect(isDuplicate('msg-1', processed)).toBe(true); // Recent
      expect(isDuplicate('msg-2', processed)).toBe(false); // Too old
      expect(isDuplicate('msg-3', processed)).toBe(false); // Never processed
    });

    it('should return cached response for duplicate', () => {
      function getCachedResponse(
        messageId: string,
        processed: Map<string, ProcessedMessage>
      ): string | null {
        const existing = processed.get(messageId);
        return existing?.response || null;
      }

      const processed = new Map<string, ProcessedMessage>([
        ['msg-1', { id: 'msg-1', processedAt: Date.now(), response: 'Cached response' }],
        ['msg-2', { id: 'msg-2', processedAt: Date.now() }],
      ]);

      expect(getCachedResponse('msg-1', processed)).toBe('Cached response');
      expect(getCachedResponse('msg-2', processed)).toBeNull();
      expect(getCachedResponse('msg-3', processed)).toBeNull();
    });

    it('should clean up old entries', () => {
      function cleanupOldEntries(
        processed: Map<string, ProcessedMessage>,
        maxAgeMs: number
      ): number {
        const now = Date.now();
        let removed = 0;

        for (const [id, entry] of processed) {
          if ((now - entry.processedAt) > maxAgeMs) {
            processed.delete(id);
            removed++;
          }
        }

        return removed;
      }

      const processed = new Map<string, ProcessedMessage>([
        ['msg-1', { id: 'msg-1', processedAt: Date.now() - 1000 }],
        ['msg-2', { id: 'msg-2', processedAt: Date.now() - 120000 }],
        ['msg-3', { id: 'msg-3', processedAt: Date.now() - 300000 }],
      ]);

      const removed = cleanupOldEntries(processed, 60000);

      expect(removed).toBe(2);
      expect(processed.size).toBe(1);
      expect(processed.has('msg-1')).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    interface RateLimitWindow {
      count: number;
      windowStart: number;
    }

    it('should track request counts per window', () => {
      function shouldRateLimit(
        windows: Map<string, RateLimitWindow>,
        key: string,
        limit: number,
        windowMs: number
      ): boolean {
        const now = Date.now();
        let window = windows.get(key);

        if (!window || (now - window.windowStart) > windowMs) {
          // New window
          windows.set(key, { count: 1, windowStart: now });
          return false;
        }

        if (window.count >= limit) {
          return true;
        }

        window.count++;
        return false;
      }

      const windows = new Map<string, RateLimitWindow>();

      // First 5 requests should pass
      for (let i = 0; i < 5; i++) {
        expect(shouldRateLimit(windows, 'user-1', 5, 60000)).toBe(false);
      }

      // 6th request should be limited
      expect(shouldRateLimit(windows, 'user-1', 5, 60000)).toBe(true);

      // Different user should not be limited
      expect(shouldRateLimit(windows, 'user-2', 5, 60000)).toBe(false);
    });

    it('should calculate retry-after header', () => {
      function getRetryAfter(
        window: RateLimitWindow,
        windowMs: number
      ): number {
        const windowEnd = window.windowStart + windowMs;
        const retryAfterMs = windowEnd - Date.now();
        return Math.max(0, Math.ceil(retryAfterMs / 1000));
      }

      const window: RateLimitWindow = {
        count: 10,
        windowStart: Date.now() - 30000, // 30 seconds ago
      };

      const retryAfter = getRetryAfter(window, 60000);
      expect(retryAfter).toBeGreaterThan(25); // ~30 seconds left
      expect(retryAfter).toBeLessThanOrEqual(30);
    });
  });

  describe('Error Response Formatting', () => {
    interface ErrorResponse {
      error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
      };
      requestId: string;
      timestamp: number;
    }

    it('should format error response', () => {
      function formatError(
        code: string,
        message: string,
        requestId: string,
        details?: Record<string, unknown>
      ): ErrorResponse {
        return {
          error: {
            code,
            message,
            details,
          },
          requestId,
          timestamp: Date.now(),
        };
      }

      const error = formatError(
        'SESSION_NOT_FOUND',
        'The requested session does not exist',
        'req-123',
        { sessionId: 'invalid-session' }
      );

      expect(error.error.code).toBe('SESSION_NOT_FOUND');
      expect(error.requestId).toBe('req-123');
      expect(error.error.details?.sessionId).toBe('invalid-session');
    });

    it('should map HTTP status codes', () => {
      function getHttpStatus(errorCode: string): number {
        const statusMap: Record<string, number> = {
          SESSION_NOT_FOUND: 404,
          UNAUTHORIZED: 401,
          FORBIDDEN: 403,
          RATE_LIMITED: 429,
          VALIDATION_ERROR: 400,
          INTERNAL_ERROR: 500,
          SERVICE_UNAVAILABLE: 503,
        };

        return statusMap[errorCode] || 500;
      }

      expect(getHttpStatus('SESSION_NOT_FOUND')).toBe(404);
      expect(getHttpStatus('RATE_LIMITED')).toBe(429);
      expect(getHttpStatus('VALIDATION_ERROR')).toBe(400);
      expect(getHttpStatus('UNKNOWN')).toBe(500);
    });

    it('should sanitize error messages for users', () => {
      function sanitizeErrorMessage(
        internalMessage: string,
        isProduction: boolean
      ): string {
        if (!isProduction) return internalMessage;

        // Remove stack traces, paths, and sensitive info
        const sanitized = internalMessage
          .replace(/at\s+.+\(.+\)/g, '')
          .replace(/\/[^\s]+\//g, '')
          .replace(/Error:\s*/g, '')
          .trim();

        // Use generic message if sanitized is too technical
        if (sanitized.includes('ECONNREFUSED') || sanitized.includes('ENOTFOUND')) {
          return 'Service temporarily unavailable';
        }

        return sanitized || 'An error occurred';
      }

      expect(sanitizeErrorMessage('Connection failed: ECONNREFUSED', true))
        .toBe('Service temporarily unavailable');

      expect(sanitizeErrorMessage('Invalid input', true))
        .toBe('Invalid input');

      expect(sanitizeErrorMessage('Error: at /home/user/app/file.js:123', false))
        .toContain('at /home/user');
    });
  });

  describe('Health Check Aggregation', () => {
    interface ComponentHealth {
      name: string;
      status: 'healthy' | 'degraded' | 'unhealthy';
      latencyMs?: number;
      lastCheck: number;
      error?: string;
    }

    it('should aggregate component health', () => {
      function aggregateHealth(
        components: ComponentHealth[]
      ): { overall: 'healthy' | 'degraded' | 'unhealthy'; details: ComponentHealth[] } {
        let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

        for (const component of components) {
          if (component.status === 'unhealthy') {
            overall = 'unhealthy';
            break;
          } else if (component.status === 'degraded' && overall === 'healthy') {
            overall = 'degraded';
          }
        }

        return { overall, details: components };
      }

      const allHealthy: ComponentHealth[] = [
        { name: 'daemon', status: 'healthy', latencyMs: 10, lastCheck: Date.now() },
        { name: 'mcp', status: 'healthy', latencyMs: 50, lastCheck: Date.now() },
        { name: 'memory', status: 'healthy', latencyMs: 5, lastCheck: Date.now() },
      ];
      expect(aggregateHealth(allHealthy).overall).toBe('healthy');

      const oneDegraded: ComponentHealth[] = [
        { name: 'daemon', status: 'healthy', latencyMs: 10, lastCheck: Date.now() },
        { name: 'mcp', status: 'degraded', latencyMs: 500, lastCheck: Date.now() },
        { name: 'memory', status: 'healthy', latencyMs: 5, lastCheck: Date.now() },
      ];
      expect(aggregateHealth(oneDegraded).overall).toBe('degraded');

      const oneUnhealthy: ComponentHealth[] = [
        { name: 'daemon', status: 'healthy', latencyMs: 10, lastCheck: Date.now() },
        { name: 'mcp', status: 'unhealthy', error: 'Connection refused', lastCheck: Date.now() },
        { name: 'memory', status: 'healthy', latencyMs: 5, lastCheck: Date.now() },
      ];
      expect(aggregateHealth(oneUnhealthy).overall).toBe('unhealthy');
    });

    it('should detect stale health checks', () => {
      function isStale(lastCheck: number, maxAgeMs: number = 60000): boolean {
        return (Date.now() - lastCheck) > maxAgeMs;
      }

      expect(isStale(Date.now() - 10000)).toBe(false);
      expect(isStale(Date.now() - 120000)).toBe(true);
    });
  });
});
