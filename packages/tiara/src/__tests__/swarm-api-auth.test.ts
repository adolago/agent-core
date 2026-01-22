
import { describe, it, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { SwarmApi } from '../api/swarm-api.js';

// Mocks
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

const mockClaudeClient = {
  getHealthStatus: jest.fn().mockReturnValue({ healthy: true }),
} as any;

const mockConfigManager = {} as any;
const mockCoordinationManager = {
  getHealthStatus: jest.fn().mockResolvedValue({ healthy: true, metrics: {} }),
} as any;
const mockAgentManager = {
  getHealthStatus: jest.fn().mockResolvedValue({ healthy: true, metrics: {} }),
} as any;
const mockResourceManager = {} as any;

const mockAuthService = {
  verifyJWT: jest.fn(),
  authenticateApiKey: jest.fn(),
} as any;

describe('SwarmApi Authentication', () => {
  let app: express.Express;

  it('should allow requests when authentication is disabled', async () => {
    const config = {
      rateLimit: { windowMs: 60000, maxRequests: 100 },
      authentication: { enabled: false }, // Auth disabled
      cors: { origins: ['*'], methods: ['GET', 'POST'] },
      swagger: { enabled: false, title: '', version: '', description: '' },
    };

    const api = new SwarmApi(
      config,
      mockLogger as any,
      mockClaudeClient,
      mockConfigManager,
      mockCoordinationManager,
      mockAgentManager,
      mockResourceManager,
      mockAuthService
    );

    app = express();
    app.use(api.getRouter());

    const res = await request(app).get('/swarms');
    expect(res.status).not.toBe(401);
  });

  it('should block requests when authentication is enabled and no token provided', async () => {
    const config = {
      rateLimit: { windowMs: 60000, maxRequests: 100 },
      authentication: { enabled: true }, // Auth enabled
      cors: { origins: ['*'], methods: ['GET', 'POST'] },
      swagger: { enabled: false, title: '', version: '', description: '' },
    };

    const api = new SwarmApi(
      config,
      mockLogger as any,
      mockClaudeClient,
      mockConfigManager,
      mockCoordinationManager,
      mockAgentManager,
      mockResourceManager,
      mockAuthService
    );

    app = express();
    app.use(api.getRouter());

    const res = await request(app).get('/swarms');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing authorization header');
  });

  it('should block requests with invalid token format', async () => {
    const config = {
      rateLimit: { windowMs: 60000, maxRequests: 100 },
      authentication: { enabled: true },
      cors: { origins: ['*'], methods: ['GET', 'POST'] },
      swagger: { enabled: false, title: '', version: '', description: '' },
    };

    const api = new SwarmApi(
      config,
      mockLogger as any,
      mockClaudeClient,
      mockConfigManager,
      mockCoordinationManager,
      mockAgentManager,
      mockResourceManager,
      mockAuthService
    );

    app = express();
    app.use(api.getRouter());

    const res = await request(app).get('/swarms').set('Authorization', 'InvalidFormat');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid authorization header format');
  });

  it('should allow requests with valid JWT token', async () => {
    const config = {
      rateLimit: { windowMs: 60000, maxRequests: 100 },
      authentication: { enabled: true },
      cors: { origins: ['*'], methods: ['GET', 'POST'] },
      swagger: { enabled: false, title: '', version: '', description: '' },
    };

    // Mock successful JWT verification
    mockAuthService.verifyJWT.mockResolvedValue({ user: { id: 'user1', role: 'admin' } });

    const api = new SwarmApi(
      config,
      mockLogger as any,
      mockClaudeClient,
      mockConfigManager,
      mockCoordinationManager,
      mockAgentManager,
      mockResourceManager,
      mockAuthService
    );

    app = express();
    app.use(api.getRouter());

    const res = await request(app)
      .get('/swarms')
      .set('Authorization', 'Bearer valid.token');

    expect(res.status).not.toBe(401);
    expect(mockAuthService.verifyJWT).toHaveBeenCalledWith('valid.token');
  });

  it('should allow requests with valid API Key', async () => {
    const config = {
      rateLimit: { windowMs: 60000, maxRequests: 100 },
      authentication: { enabled: true },
      cors: { origins: ['*'], methods: ['GET', 'POST'] },
      swagger: { enabled: false, title: '', version: '', description: '' },
    };

    // Mock successful API Key authentication
    mockAuthService.authenticateApiKey.mockResolvedValue({
      user: { id: 'user1' },
      key: { id: 'key1' }
    });

    const api = new SwarmApi(
      config,
      mockLogger as any,
      mockClaudeClient,
      mockConfigManager,
      mockCoordinationManager,
      mockAgentManager,
      mockResourceManager,
      mockAuthService
    );

    app = express();
    app.use(api.getRouter());

    const res = await request(app)
      .get('/swarms')
      .set('Authorization', 'ApiKey valid-api-key');

    expect(res.status).not.toBe(401);
    expect(mockAuthService.authenticateApiKey).toHaveBeenCalledWith('valid-api-key');
  });

  it('should block requests with invalid JWT token', async () => {
    const config = {
      rateLimit: { windowMs: 60000, maxRequests: 100 },
      authentication: { enabled: true },
      cors: { origins: ['*'], methods: ['GET', 'POST'] },
      swagger: { enabled: false, title: '', version: '', description: '' },
    };

    // Mock failed JWT verification
    mockAuthService.verifyJWT.mockRejectedValue(new Error('Invalid token'));

    const api = new SwarmApi(
      config,
      mockLogger as any,
      mockClaudeClient,
      mockConfigManager,
      mockCoordinationManager,
      mockAgentManager,
      mockResourceManager,
      mockAuthService
    );

    app = express();
    app.use(api.getRouter());

    const res = await request(app)
      .get('/swarms')
      .set('Authorization', 'Bearer invalid.token');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication failed');
  });

  it('should allow access to health check endpoint without authentication', async () => {
    const config = {
      rateLimit: { windowMs: 60000, maxRequests: 100 },
      authentication: { enabled: true },
      cors: { origins: ['*'], methods: ['GET', 'POST'] },
      swagger: { enabled: false, title: '', version: '', description: '' },
    };

    const api = new SwarmApi(
      config,
      mockLogger as any,
      mockClaudeClient,
      mockConfigManager,
      mockCoordinationManager,
      mockAgentManager,
      mockResourceManager,
      mockAuthService
    );

    app = express();
    app.use(api.getRouter());

    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.healthy).toBe(true);
  });
});
