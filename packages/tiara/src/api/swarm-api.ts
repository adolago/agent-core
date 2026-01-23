/**
 * Swarm API - RESTful API for swarm coordination and management
 * Provides HTTP endpoints for swarm operations, agent management, and task orchestration
 */

import { Router } from 'express';
import { ILogger } from '../core/logger.js';
import { ClaudeAPIClient } from './claude-client.js';
import { ConfigManager } from '../config/config-manager.js';
import { ICoordinationManager } from '../coordination/manager.js';
import { SwarmCoordinator } from '../swarm/coordinator.js';
import { AgentManager } from '../agents/agent-manager.js';
import { ResourceManager } from '../resources/resource-manager.js';
import { AuthService } from './auth-service.js';
import type {
  AgentCapabilities,
  AgentType,
  SwarmConfig,
  SwarmMode,
  SwarmStrategy,
  TaskPriority,
  TaskType,
} from '../swarm/types.js';
import { ValidationError, SwarmError } from '../utils/errors.js';
import { nanoid } from 'nanoid';

export interface SwarmApiConfig {
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  authentication: {
    enabled: boolean;
    apiKeys?: string[];
    jwtSecret?: string;
  };
  cors: {
    origins: string[];
    methods: string[];
  };
  swagger: {
    enabled: boolean;
    title: string;
    version: string;
    description: string;
  };
}

export interface SwarmCreateRequest {
  name: string;
  topology: 'hierarchical' | 'mesh' | 'ring' | 'star';
  maxAgents?: number;
  strategy?: 'balanced' | 'specialized' | 'adaptive';
  config?: Partial<SwarmConfig>;
}

export interface AgentSpawnRequest {
  type: string;
  name?: string;
  capabilities?: string[];
  config?: Record<string, unknown>;
}

export interface TaskOrchestrationRequest {
  task: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  strategy?: 'parallel' | 'sequential' | 'adaptive';
  maxAgents?: number;
  requirements?: string[];
  metadata?: Record<string, unknown>;
}

export interface SwarmMetrics {
  swarmId: string;
  agentCount: number;
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageResponseTime: number;
  resourceUtilization: Record<string, number>;
  healthScore: number;
}

interface SwarmRecord {
  coordinator: SwarmCoordinator;
  metadata: {
    name: string;
    topology: SwarmCreateRequest['topology'];
    strategy: SwarmCreateRequest['strategy'];
    maxAgents: number;
    createdAt: string;
    config: Partial<SwarmConfig>;
  };
}

const DEFAULT_MAX_AGENTS = 8;
const AGENT_TYPES = new Set<AgentType>([
  'coordinator',
  'researcher',
  'coder',
  'analyst',
  'architect',
  'tester',
  'reviewer',
  'optimizer',
  'documenter',
  'monitor',
  'specialist',
  'design-architect',
  'system-architect',
  'task-planner',
  'developer',
  'requirements-engineer',
  'steering-author',
]);

const mapSwarmMode = (topology: SwarmCreateRequest['topology']): SwarmMode => {
  switch (topology) {
    case 'hierarchical':
      return 'hierarchical';
    case 'mesh':
      return 'mesh';
    case 'ring':
      return 'mesh';
    case 'star':
    default:
      return 'centralized';
  }
};

const mapSwarmStrategy = (strategy?: SwarmCreateRequest['strategy']): SwarmStrategy => {
  switch (strategy) {
    case 'specialized':
      return 'custom';
    case 'adaptive':
    case 'balanced':
    default:
      return 'auto';
  }
};

const mapTaskPriority = (priority?: TaskOrchestrationRequest['priority']): TaskPriority => {
  switch (priority) {
    case 'low':
      return 'low';
    case 'high':
      return 'high';
    case 'critical':
      return 'critical';
    case 'medium':
    default:
      return 'normal';
  }
};

const resolveTaskType = (request: TaskOrchestrationRequest): TaskType => {
  if (request.strategy === 'parallel' || (request.maxAgents && request.maxAgents > 1)) {
    return 'coordination';
  }
  return 'custom';
};

const resolveAgentType = (type: string): AgentType =>
  AGENT_TYPES.has(type as AgentType) ? (type as AgentType) : 'specialist';

const buildAgentCapabilities = (capabilities?: string[]): Partial<AgentCapabilities> => {
  if (!capabilities?.length) {
    return {};
  }

  const overrides: Partial<AgentCapabilities> = {};
  const tools: string[] = [];

  for (const capability of capabilities) {
    switch (capability) {
      case 'codeGeneration':
      case 'codeReview':
      case 'testing':
      case 'documentation':
      case 'research':
      case 'analysis':
      case 'webSearch':
      case 'apiIntegration':
      case 'fileSystem':
      case 'terminalAccess':
        (overrides as Record<string, boolean>)[capability] = true;
        break;
      default:
        tools.push(capability);
        break;
    }
  }

  if (tools.length) {
    overrides.tools = tools;
  }

  return overrides;
};

const buildTaskName = (description: string): string => {
  const firstLine = description.split('\n')[0]?.trim();
  if (!firstLine) {
    return 'user-task';
  }
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
};

/**
 * Swarm API implementation
 */
export class SwarmApi {
  private router: Router;
  private swarms = new Map<string, SwarmRecord>();

  constructor(
    private config: SwarmApiConfig,
    private logger: ILogger,
    private claudeClient: ClaudeAPIClient,
    private configManager: ConfigManager,
    private coordinationManager: ICoordinationManager,
    private agentManager: AgentManager,
    private resourceManager: ResourceManager,
    private authService?: AuthService,
  ) {
    if (config.authentication.enabled && !authService) {
      throw new Error('AuthService is required when authentication is enabled');
    }
    this.router = Router();
    this.setupRequestMiddleware();
    this.setupRoutes();
    this.setupErrorMiddleware();
  }

  getRouter(): Router {
    return this.router;
  }

  private setupRequestMiddleware(): void {
    // Request logging
    this.router.use((req, res, next) => {
      this.logger.info('Swarm API request', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      next();
    });

    // Authentication
    this.router.use(this.authenticateRequest.bind(this));

    // Request validation
    this.router.use((req, res, next) => {
      if (req.method === 'POST' || req.method === 'PUT') {
        if (!req.body) {
          res.status(400).json({
            error: 'Request body is required',
            code: 'MISSING_BODY',
          });
          return;
        }
      }
      return next();
    });
  }

  private setupErrorMiddleware(): void {
    // Error handling
    this.router.use((err: Error, req: any, res: any, _next: any) => {
      this.logger.error('Swarm API error', {
        error: err.message,
        stack: err.stack,
        method: req.method,
        path: req.path,
      });

      if (err instanceof ValidationError) {
        return res.status(400).json({
          error: err.message,
          code: 'VALIDATION_ERROR',
          details: err.details,
        });
      }

      if (err instanceof SwarmError) {
        return res.status(409).json({
          error: err.message,
          code: 'SWARM_ERROR',
          details: err.details,
        });
      }

      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    });
  }

  private async authenticateRequest(req: any, res: any, next: any): Promise<void> {
    // Public endpoints
    if (req.path === '/health') {
      return next();
    }

    if (!this.config.authentication.enabled) {
      return next();
    }

    if (!this.authService) {
      // Should not happen due to constructor check, but for safety
      return res.status(500).json({ error: 'Authentication service not initialized' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing authorization header', code: 'UNAUTHORIZED' });
    }

    const [scheme, token] = authHeader.split(' ');
    if (!token) {
      return res
        .status(401)
        .json({ error: 'Invalid authorization header format', code: 'UNAUTHORIZED' });
    }

    try {
      if (scheme === 'Bearer') {
        const { user } = await this.authService.verifyJWT(token);
        req.user = user;
      } else if (scheme === 'ApiKey') {
        const { user, key } = await this.authService.authenticateApiKey(token);
        req.user = user;
        req.apiKey = key;
      } else {
        return res
          .status(401)
          .json({ error: 'Unsupported authentication scheme', code: 'UNAUTHORIZED' });
      }
      next();
    } catch (error) {
      this.logger.warn('Authentication failed', {
        error: error instanceof Error ? error.message : String(error),
        ip: req.ip,
      });
      return res.status(401).json({
        error: 'Authentication failed',
        code: 'UNAUTHORIZED',
      });
    }
  }

  private setupRoutes(): void {
    // Health check
    this.router.get('/health', async (req, res) => {
      try {
        const health = await this.getSystemHealth();
        res.json(health);
      } catch (error) {
        res.status(500).json({
          healthy: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Swarm management
    this.router.post('/swarms', this.createSwarm.bind(this));
    this.router.get('/swarms', this.listSwarms.bind(this));
    this.router.get('/swarms/:swarmId', this.getSwarm.bind(this));
    this.router.delete('/swarms/:swarmId', this.destroySwarm.bind(this));
    this.router.post('/swarms/:swarmId/scale', this.scaleSwarm.bind(this));

    // Agent management
    this.router.post('/swarms/:swarmId/agents', this.spawnAgent.bind(this));
    this.router.get('/swarms/:swarmId/agents', this.listAgents.bind(this));
    this.router.get('/swarms/:swarmId/agents/:agentId', this.getAgent.bind(this));
    this.router.delete('/swarms/:swarmId/agents/:agentId', this.terminateAgent.bind(this));

    // Task orchestration
    this.router.post('/swarms/:swarmId/tasks', this.orchestrateTask.bind(this));
    this.router.get('/swarms/:swarmId/tasks', this.listTasks.bind(this));
    this.router.get('/swarms/:swarmId/tasks/:taskId', this.getTask.bind(this));
    this.router.delete('/swarms/:swarmId/tasks/:taskId', this.cancelTask.bind(this));

    // Metrics and monitoring
    this.router.get('/swarms/:swarmId/metrics', this.getSwarmMetrics.bind(this));
    this.router.get('/swarms/:swarmId/status', this.getSwarmStatus.bind(this));
    this.router.get('/system/metrics', this.getSystemMetrics.bind(this));
  }

  private async createSwarm(req: any, res: any): Promise<void> {
    try {
      const request = req.body as SwarmCreateRequest;

      // Validate request
      if (!request.name || !request.topology) {
        return res.status(400).json({
          error: 'Name and topology are required',
          code: 'VALIDATION_ERROR',
        });
      }

      const apiStrategy = request.strategy ?? 'balanced';
      const maxAgents = request.maxAgents ?? request.config?.maxAgents ?? DEFAULT_MAX_AGENTS;

      // Create swarm configuration
      const swarmConfig: Partial<SwarmConfig> = {
        ...request.config,
        name: request.name,
        mode: request.config?.mode ?? mapSwarmMode(request.topology),
        strategy: request.config?.strategy ?? mapSwarmStrategy(request.strategy),
        maxAgents,
      };

      // Create swarm coordinator
      const swarm = new SwarmCoordinator(swarmConfig);

      // Initialize swarm
      await swarm.initialize();

      // Generate swarm ID
      const swarmId = swarm.getSwarmId().id;
      const createdAt = new Date().toISOString();

      // Store swarm
      this.swarms.set(swarmId, {
        coordinator: swarm,
        metadata: {
          name: request.name,
          topology: request.topology,
          strategy: apiStrategy,
          maxAgents,
          createdAt,
          config: swarmConfig,
        },
      });

      this.logger.info('Swarm created', {
        swarmId,
        name: request.name,
        topology: request.topology,
      });

      res.status(201).json({
        swarmId,
        name: request.name,
        topology: request.topology,
        maxAgents,
        strategy: apiStrategy,
        status: 'active',
        createdAt,
      });
    } catch (error) {
      throw error;
    }
  }

  private async listSwarms(req: any, res: any): Promise<void> {
    try {
      const swarmList = Array.from(this.swarms.entries()).map(([swarmId, record]) => ({
        swarmId,
        name: record.metadata.name,
        topology: record.metadata.topology,
        agentCount: record.coordinator.getAgents().length,
        status: record.coordinator.getStatus(),
        createdAt: record.metadata.createdAt,
      }));

      res.json({
        swarms: swarmList,
        total: swarmList.length,
      });
    } catch (error) {
      throw error;
    }
  }

  private async getSwarm(req: any, res: any): Promise<void> {
    try {
      const { swarmId } = req.params;
      const record = this.swarms.get(swarmId);

      if (!record) {
        return res.status(404).json({
          error: 'Swarm not found',
          code: 'SWARM_NOT_FOUND',
        });
      }

      const config = record.metadata.config;
      const status = record.coordinator.getStatus();
      const agents = record.coordinator.getAgents();
      const metrics = record.coordinator.getMetrics();

      res.json({
        swarmId,
        config,
        status,
        agents: agents.map((agent) => ({
          id: agent.id.id,
          type: agent.type,
          name: agent.name,
          status: agent.status,
          capabilities: agent.capabilities,
        })),
        metrics,
        createdAt: record.metadata.createdAt,
      });
    } catch (error) {
      throw error;
    }
  }

  private async destroySwarm(req: any, res: any): Promise<void> {
    try {
      const { swarmId } = req.params;
      const record = this.swarms.get(swarmId);

      if (!record) {
        return res.status(404).json({
          error: 'Swarm not found',
          code: 'SWARM_NOT_FOUND',
        });
      }

      await record.coordinator.shutdown();
      this.swarms.delete(swarmId);

      this.logger.info('Swarm destroyed', { swarmId });

      res.json({
        message: 'Swarm destroyed successfully',
        swarmId,
      });
    } catch (error) {
      throw error;
    }
  }

  private async scaleSwarm(req: any, res: any): Promise<void> {
    try {
      const { swarmId } = req.params;
      const { targetSize } = req.body;

      if (!targetSize || targetSize < 1) {
        return res.status(400).json({
          error: 'Valid targetSize is required',
          code: 'VALIDATION_ERROR',
        });
      }

      const record = this.swarms.get(swarmId);
      if (!record) {
        return res.status(404).json({
          error: 'Swarm not found',
          code: 'SWARM_NOT_FOUND',
        });
      }

      const swarm = record.coordinator;
      const agents = swarm.getAgents();
      const currentSize = agents.length;

      if (targetSize > currentSize) {
        const toCreate = targetSize - currentSize;
        for (let index = 0; index < toCreate; index += 1) {
          await swarm.registerAgent(`agent-${nanoid(6)}`, 'specialist');
        }
      } else if (targetSize < currentSize) {
        const toRemove = currentSize - targetSize;
        const candidates = [
          ...agents.filter((agent) => agent.status === 'idle'),
          ...agents.filter((agent) => agent.status !== 'idle'),
        ].slice(0, toRemove);

        for (const agent of candidates) {
          await swarm.unregisterAgent(agent.id.id);
        }
      }

      res.json({
        message: 'Swarm scaled successfully',
        swarmId,
        newSize: swarm.getAgents().length,
      });
    } catch (error) {
      throw error;
    }
  }

  private async spawnAgent(req: any, res: any): Promise<void> {
    try {
      const { swarmId } = req.params;
      const request = req.body as AgentSpawnRequest;

      if (!request.type) {
        return res.status(400).json({
          error: 'Agent type is required',
          code: 'VALIDATION_ERROR',
        });
      }

      const record = this.swarms.get(swarmId);
      if (!record) {
        return res.status(404).json({
          error: 'Swarm not found',
          code: 'SWARM_NOT_FOUND',
        });
      }

      const agentType = resolveAgentType(request.type);
      if (agentType !== request.type) {
        this.logger.warn('Unknown agent type, defaulting to specialist', {
          swarmId,
          requestedType: request.type,
        });
      }

      const agentId = await record.coordinator.registerAgent(
        request.name || `agent-${nanoid(6)}`,
        agentType,
        buildAgentCapabilities(request.capabilities),
      );

      const agent = record.coordinator.getAgent(agentId);
      if (!agent) {
        throw new Error(`Agent registration failed for ${agentId}`);
      }

      res.status(201).json({
        agent: {
          id: agent.id.id,
          type: agent.type,
          name: agent.name,
          status: agent.status,
          capabilities: agent.capabilities,
        },
        swarmId,
      });
    } catch (error) {
      throw error;
    }
  }

  private async orchestrateTask(req: any, res: any): Promise<void> {
    try {
      const { swarmId } = req.params;
      const request = req.body as TaskOrchestrationRequest;

      if (!request.task) {
        return res.status(400).json({
          error: 'Task description is required',
          code: 'VALIDATION_ERROR',
        });
      }

      const record = this.swarms.get(swarmId);
      if (!record) {
        return res.status(404).json({
          error: 'Swarm not found',
          code: 'SWARM_NOT_FOUND',
        });
      }

      const swarm = record.coordinator;
      const taskId = await swarm.createTask(
        resolveTaskType(request),
        buildTaskName(request.task),
        request.task,
        request.task,
        {
          priority: mapTaskPriority(request.priority),
          context: {
            strategy: request.strategy ?? 'adaptive',
            maxAgents: request.maxAgents,
            requirements: request.requirements,
            metadata: request.metadata,
          },
          input: request.metadata ?? {},
        },
      );

      await swarm.assignTask(taskId);
      const task = swarm.getTask(taskId);
      if (!task) {
        throw new Error(`Task creation failed for ${taskId}`);
      }

      res.status(201).json({
        task: {
          id: task.id.id,
          description: task.description,
          status: task.status,
          priority: task.priority,
          strategy: request.strategy || 'adaptive',
        },
        swarmId,
      });
    } catch (error) {
      throw error;
    }
  }

  private async getSwarmMetrics(req: any, res: any): Promise<void> {
    try {
      const { swarmId } = req.params;
      const record = this.swarms.get(swarmId);

      if (!record) {
        return res.status(404).json({
          error: 'Swarm not found',
          code: 'SWARM_NOT_FOUND',
        });
      }

      const metrics = record.coordinator.getMetrics();
      res.json(metrics);
    } catch (error) {
      throw error;
    }
  }

  private async getSwarmStatus(req: any, res: any): Promise<void> {
    try {
      const { swarmId } = req.params;
      const record = this.swarms.get(swarmId);

      if (!record) {
        return res.status(404).json({
          error: 'Swarm not found',
          code: 'SWARM_NOT_FOUND',
        });
      }

      const status = record.coordinator.getSwarmStatus();
      res.json(status);
    } catch (error) {
      throw error;
    }
  }

  private async getSystemHealth(): Promise<{
    healthy: boolean;
    services: Record<string, { healthy: boolean; error?: string }>;
    metrics: Record<string, number>;
  }> {
    const services: Record<string, { healthy: boolean; error?: string }> = {};
    let allHealthy = true;

    // Check Claude API health
    const claudeHealth = this.claudeClient.getHealthStatus();
    services.claude = {
      healthy: claudeHealth?.healthy || false,
      error: claudeHealth?.error,
    };
    allHealthy = allHealthy && services.claude.healthy;

    // Check coordination manager health
    const coordHealth = await this.coordinationManager.getHealthStatus();
    services.coordination = {
      healthy: coordHealth.healthy,
      error: coordHealth.error,
    };
    allHealthy = allHealthy && services.coordination.healthy;

    // Check agent manager health
    const agentStats = this.agentManager.getSystemStats();
    const agentHealthy = agentStats.totalAgents === 0 ? true : agentStats.averageHealth >= 0.7;
    services.agents = {
      healthy: agentHealthy,
    };
    allHealthy = allHealthy && services.agents.healthy;

    // Collect metrics
    const metrics = {
      totalSwarms: this.swarms.size,
      ...(coordHealth.metrics ?? {}),
      totalAgents: agentStats.totalAgents,
      activeAgents: agentStats.activeAgents,
      healthyAgents: agentStats.healthyAgents,
      averageAgentHealth: agentStats.averageHealth,
      agentCpu: agentStats.resourceUtilization.cpu,
      agentMemory: agentStats.resourceUtilization.memory,
      agentDisk: agentStats.resourceUtilization.disk,
    };

    return {
      healthy: allHealthy,
      services,
      metrics,
    };
  }

  private async getSystemMetrics(req: any, res: any): Promise<void> {
    try {
      const systemMetrics = await this.getSystemHealth();
      const swarmMetrics = await Promise.all(
        Array.from(this.swarms.values()).map(async (record) => {
          const metrics = record.coordinator.getMetrics();
          return {
            swarmId: record.coordinator.getSwarmId().id,
            ...metrics,
          };
        }),
      );

      res.json({
        system: systemMetrics,
        swarms: swarmMetrics,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      throw error;
    }
  }

  // Additional helper methods
  private async listAgents(req: any, res: any): Promise<void> {
    try {
      const { swarmId } = req.params;
      const record = this.swarms.get(swarmId);

      if (!record) {
        return res.status(404).json({
          error: 'Swarm not found',
          code: 'SWARM_NOT_FOUND',
        });
      }

      const agents = record.coordinator.getAgents();
      res.json({
        agents: agents.map((agent) => ({
          id: agent.id.id,
          type: agent.type,
          name: agent.name,
          status: agent.status,
          capabilities: agent.capabilities,
          createdAt: agent.lastHeartbeat,
        })),
        total: agents.length,
      });
    } catch (error) {
      throw error;
    }
  }

  private async getAgent(req: any, res: any): Promise<void> {
    try {
      const { swarmId, agentId } = req.params;
      const record = this.swarms.get(swarmId);

      if (!record) {
        return res.status(404).json({
          error: 'Swarm not found',
          code: 'SWARM_NOT_FOUND',
        });
      }

      const agent = record.coordinator.getAgent(agentId);
      if (!agent) {
        return res.status(404).json({
          error: 'Agent not found',
          code: 'AGENT_NOT_FOUND',
        });
      }

      res.json(agent);
    } catch (error) {
      throw error;
    }
  }

  private async terminateAgent(req: any, res: any): Promise<void> {
    try {
      const { swarmId, agentId } = req.params;
      const record = this.swarms.get(swarmId);

      if (!record) {
        return res.status(404).json({
          error: 'Swarm not found',
          code: 'SWARM_NOT_FOUND',
        });
      }

      await record.coordinator.unregisterAgent(agentId);
      res.json({
        message: 'Agent terminated successfully',
        agentId,
        swarmId,
      });
    } catch (error) {
      throw error;
    }
  }

  private async listTasks(req: any, res: any): Promise<void> {
    try {
      const { swarmId } = req.params;
      const record = this.swarms.get(swarmId);

      if (!record) {
        return res.status(404).json({
          error: 'Swarm not found',
          code: 'SWARM_NOT_FOUND',
        });
      }

      const tasks = record.coordinator.getTasks();
      res.json({
        tasks: tasks.map((task) => ({
          id: task.id.id,
          description: task.description,
          status: task.status,
          priority: task.priority,
          assignedTo: task.assignedTo?.id,
          createdAt: task.createdAt,
          completedAt: task.completedAt,
        })),
        total: tasks.length,
      });
    } catch (error) {
      throw error;
    }
  }

  private async getTask(req: any, res: any): Promise<void> {
    try {
      const { swarmId, taskId } = req.params;
      const record = this.swarms.get(swarmId);

      if (!record) {
        return res.status(404).json({
          error: 'Swarm not found',
          code: 'SWARM_NOT_FOUND',
        });
      }

      const task = record.coordinator.getTask(taskId);
      if (!task) {
        return res.status(404).json({
          error: 'Task not found',
          code: 'TASK_NOT_FOUND',
        });
      }

      res.json(task);
    } catch (error) {
      throw error;
    }
  }

  private async cancelTask(req: any, res: any): Promise<void> {
    try {
      const { swarmId, taskId } = req.params;
      const { reason } = req.body;
      const record = this.swarms.get(swarmId);

      if (!record) {
        return res.status(404).json({
          error: 'Swarm not found',
          code: 'SWARM_NOT_FOUND',
        });
      }

      await record.coordinator.cancelTask(taskId, reason || 'User requested cancellation');
      res.json({
        message: 'Task cancelled successfully',
        taskId,
        swarmId,
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    this.logger.info('Destroying Swarm API');

    // Destroy all swarms
    for (const [swarmId, record] of this.swarms) {
      try {
        await record.coordinator.shutdown();
      } catch (error) {
        this.logger.error('Error destroying swarm', { swarmId, error });
      }
    }

    this.swarms.clear();
  }
}
