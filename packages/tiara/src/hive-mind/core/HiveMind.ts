/**
 * HiveMind Core Class
 *
 * Main orchestrator for the collective intelligence swarm system.
 * Manages agents, tasks, memory, and coordination.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Queen } from './Queen.js';
import { Agent } from './Agent.js';
import { Memory } from './Memory.js';
import { Communication } from './Communication.js';
import { QdrantStore, getQdrantStore } from './QdrantStore.js';
import { SwarmOrchestrator } from '../integration/SwarmOrchestrator.js';
import { ConsensusEngine } from '../integration/ConsensusEngine.js';
import {
  HiveMindConfig,
  SwarmTopology,
  AgentType,
  Task,
  TaskPriority,
  TaskStrategy,
  SwarmStatus,
  AgentSpawnOptions,
  TaskSubmitOptions,
} from '../types.js';
import {
  AgentCoreClient,
  getAgentCoreClient,
  TiaraNamespaces,
} from '../integration/AgentCoreClient.js';

export class HiveMind extends EventEmitter {
  private id: string;
  private config: HiveMindConfig;
  private queen: Queen;
  private agents: Map<string, Agent>;
  private memory: Memory;
  private communication: Communication;
  private orchestrator: SwarmOrchestrator;
  private consensus: ConsensusEngine;
  private store: QdrantStore;
  private agentCore: AgentCoreClient;
  private started: boolean = false;
  private startTime: number;

  constructor(config: HiveMindConfig) {
    super();
    this.config = config;
    this.id = uuidv4();
    this.agents = new Map();
    this.startTime = Date.now();
  }

  /**
   * Initialize the Hive Mind and all subsystems
   */
  async initialize(): Promise<string> {
    try {
      // Initialize agent-core client for centralized registry
      this.agentCore = getAgentCoreClient();

      // Initialize Qdrant store (replaces SQLite)
      this.store = await getQdrantStore();

      // Create swarm in Qdrant
      await this.store.createSwarm({
        name: this.config.name,
        topology: this.config.topology,
        queenMode: this.config.queenMode,
        maxAgents: this.config.maxAgents,
        consensusThreshold: this.config.consensusThreshold,
        memoryTTL: this.config.memoryTTL,
        config: this.config as Record<string, unknown>,
      });

      // Register swarm with agent-core process registry
      try {
        await this.agentCore.registerProcess({
          id: this.id,
          type: 'swarm',
          name: this.config.name,
          capabilities: ['orchestration', `topology:${this.config.topology}`],
          metadata: {
            queenMode: this.config.queenMode,
            maxAgents: this.config.maxAgents,
            topology: this.config.topology,
          },
        });
        this.agentCore.startHeartbeat(this.id);
      } catch (err) {
        // Non-fatal: agent-core may not be running
        console.warn('Could not register swarm with agent-core:', err);
      }

      // Initialize Queen
      this.queen = new Queen({
        swarmId: this.id,
        mode: this.config.queenMode,
        topology: this.config.topology,
      });

      // Initialize subsystems
      this.memory = new Memory(this.id);
      this.communication = new Communication(this.id);
      this.orchestrator = new SwarmOrchestrator(this);
      this.consensus = new ConsensusEngine(this.config.consensusThreshold);

      // Initialize subsystems
      await Promise.all([
        this.queen.initialize(),
        this.memory.initialize(),
        this.communication.initialize(),
        this.orchestrator.initialize(),
      ]);

      // Set as active swarm
      await this.store.setActiveSwarm(this.id);

      // Auto-spawn agents if configured
      if (this.config.autoSpawn) {
        await this.autoSpawnAgents();
      }

      this.started = true;
      this.emit('initialized', { swarmId: this.id });

      return this.id;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Load an existing Hive Mind from the store
   */
  static async load(swarmId: string): Promise<HiveMind> {
    const store = await getQdrantStore();
    const swarmData = await store.getSwarm(swarmId);

    if (!swarmData) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    const config = swarmData.config as HiveMindConfig;
    const hiveMind = new HiveMind(config);
    hiveMind.id = swarmId;

    await hiveMind.initialize();

    // Load existing agents
    const agents = await store.getAgents(swarmId);
    for (const agentData of agents) {
      const agent = new Agent({
        id: agentData.id,
        name: agentData.name,
        type: agentData.type,
        swarmId: swarmId,
        capabilities: agentData.capabilities,
      });

      await agent.initialize();
      hiveMind.agents.set(agent.id, agent);
    }

    return hiveMind;
  }

  /**
   * Auto-spawn initial agents based on topology
   */
  async autoSpawnAgents(): Promise<Agent[]> {
    const topologyConfigs = {
      hierarchical: [
        { type: 'coordinator', count: 1 },
        { type: 'researcher', count: 2 },
        { type: 'coder', count: 2 },
        { type: 'analyst', count: 1 },
        { type: 'tester', count: 1 },
      ],
      mesh: [
        { type: 'coordinator', count: 2 },
        { type: 'researcher', count: 2 },
        { type: 'coder', count: 2 },
        { type: 'specialist', count: 2 },
      ],
      ring: [
        { type: 'coordinator', count: 1 },
        { type: 'coder', count: 3 },
        { type: 'reviewer', count: 2 },
      ],
      star: [
        { type: 'coordinator', count: 1 },
        { type: 'specialist', count: 4 },
      ],
      // Maestro specs-driven topology
      'specs-driven': [
        { type: 'requirements_analyst', count: 1 },
        { type: 'design_architect', count: 2 },
        { type: 'task_planner', count: 1 },
        { type: 'implementation_coder', count: 2 },
        { type: 'quality_reviewer', count: 1 },
        { type: 'steering_documenter', count: 1 },
      ],
    };

    const config = topologyConfigs[this.config.topology];
    const spawnedAgents: Agent[] = [];

    for (const agentConfig of config) {
      for (let i = 0; i < agentConfig.count; i++) {
        const agent = await this.spawnAgent({
          type: agentConfig.type as AgentType,
          name: `${agentConfig.type}-${i + 1}`,
        });
        spawnedAgents.push(agent);
      }
    }

    return spawnedAgents;
  }

  /**
   * Spawn a new agent into the swarm
   */
  async spawnAgent(options: AgentSpawnOptions): Promise<Agent> {
    if (this.agents.size >= this.config.maxAgents) {
      throw new Error('Maximum agent limit reached');
    }

    const agent = new Agent({
      name: options.name || `${options.type}-${Date.now()}`,
      type: options.type,
      swarmId: this.id,
      capabilities: options.capabilities || this.getDefaultCapabilities(options.type),
    });

    await agent.initialize();

    // Register with Queen
    await this.queen.registerAgent(agent);

    // Store in Qdrant
    await this.store.createAgent({
      swarmId: this.id,
      name: agent.name,
      type: agent.type,
      capabilities: agent.capabilities,
      status: 'idle',
      metadata: {},
    });

    // Register with agent-core process registry
    try {
      await this.agentCore.registerProcess({
        id: agent.id,
        type: 'agent',
        name: agent.name,
        swarmId: this.id,
        capabilities: agent.capabilities,
        metadata: {
          agentType: agent.type,
        },
      });
      this.agentCore.startHeartbeat(agent.id);
    } catch (err) {
      // Non-fatal: agent-core may not be running
      console.warn('Could not register agent with agent-core:', err);
    }

    // Add to local map
    this.agents.set(agent.id, agent);

    // Setup communication channels
    this.communication.addAgent(agent);

    // Auto-assign to pending tasks if configured
    if (options.autoAssign) {
      await this.assignPendingTasksToAgent(agent);
    }

    this.emit('agentSpawned', { agent });

    return agent;
  }

  /**
   * Get the agent-core client for direct access
   */
  getAgentCoreClient(): AgentCoreClient {
    return this.agentCore;
  }

  /**
   * Submit a task to the Hive Mind
   */
  async submitTask(options: TaskSubmitOptions): Promise<Task> {
    const task: Task = {
      id: uuidv4(),
      swarmId: this.id,
      description: options.description,
      priority: options.priority,
      strategy: options.strategy,
      status: 'pending',
      progress: 0,
      dependencies: options.dependencies || [],
      assignedAgents: [],
      requireConsensus: options.requireConsensus || false,
      maxAgents: options.maxAgents || 3,
      requiredCapabilities: options.requiredCapabilities || [],
      createdAt: new Date(),
      metadata: options.metadata || {},
    };

    // Store in Qdrant
    await this.store.createTask({
      swarmId: task.swarmId,
      description: task.description,
      priority: task.priority,
      strategy: task.strategy,
      status: task.status,
      dependencies: task.dependencies,
      assignedAgents: task.assignedAgents,
      requireConsensus: task.requireConsensus,
      maxAgents: task.maxAgents,
      requiredCapabilities: task.requiredCapabilities,
      metadata: task.metadata,
    });

    // Submit to orchestrator
    await this.orchestrator.submitTask(task);

    // Notify Queen
    await this.queen.onTaskSubmitted(task);

    this.emit('taskSubmitted', { task });

    return task;
  }

  /**
   * Get full status of the Hive Mind
   */
  async getFullStatus(): Promise<SwarmStatus> {
    const agents = Array.from(this.agents.values());
    const tasks = await this.store.getTasks(this.id);
    const memoryStats = await this.memory.getStats();
    const communicationStats = await this.communication.getStats();

    // Calculate agent statistics
    const agentsByType = agents.reduce(
      (acc, agent) => {
        acc[agent.type] = (acc[agent.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Calculate task statistics
    const taskStats = {
      total: tasks.length,
      pending: tasks.filter((t) => t.status === 'pending').length,
      inProgress: tasks.filter((t) => t.status === 'in_progress').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
    };

    // Calculate performance metrics
    const performance = await this.calculatePerformanceMetrics();

    // Determine health status
    const health = this.determineHealth(agents, tasks, performance);

    // Get any warnings
    const warnings = this.getSystemWarnings(agents, tasks, performance);

    return {
      swarmId: this.id,
      name: this.config.name,
      topology: this.config.topology,
      queenMode: this.config.queenMode,
      health,
      uptime: Date.now() - this.startTime,
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        status: a.status,
        currentTask: a.currentTask,
        messageCount: a.messageCount,
        createdAt: a.createdAt.getTime(),
      })),
      agentsByType,
      tasks: tasks.map((t) => ({
        id: t.id,
        description: t.description,
        status: t.status,
        priority: t.priority,
        progress: t.progress,
        assignedAgent: t.assigned_agents ? JSON.parse(t.assigned_agents)[0] : null,
      })),
      taskStats,
      memoryStats,
      communicationStats,
      performance,
      warnings,
    };
  }

  /**
   * Get basic statistics
   */
  async getStats() {
    const agents = Array.from(this.agents.values());
    const tasks = await this.store.getTasks(this.id);

    return {
      totalAgents: agents.length,
      activeAgents: agents.filter((a) => a.status === 'busy').length,
      pendingTasks: tasks.filter((t) => t.status === 'pending').length,
      availableCapacity: Math.round(
        (1 - agents.filter((a) => a.status === 'busy').length / agents.length) * 100,
      ),
    };
  }

  /**
   * Get list of agents
   */
  async getAgents(): Promise<Agent[]> {
    return Array.from(this.agents.values());
  }

  /**
   * Get list of tasks
   */
  async getTasks(): Promise<any[]> {
    return this.store.getTasks(this.id);
  }

  /**
   * Get specific task
   */
  async getTask(taskId: string): Promise<any> {
    return this.store.getTask(taskId);
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<void> {
    await this.orchestrator.cancelTask(taskId);
    await this.store.updateTaskStatus(taskId, 'cancelled');
    this.emit('taskCancelled', { taskId });
  }

  /**
   * Retry a failed task
   */
  async retryTask(taskId: string): Promise<Task> {
    const originalTask = await this.store.getTask(taskId);
    if (!originalTask) {
      throw new Error('Task not found');
    }

    const newTask = await this.submitTask({
      description: originalTask.description + ' (Retry)',
      priority: originalTask.priority,
      strategy: originalTask.strategy,
      dependencies: [],
      requireConsensus: originalTask.requireConsensus,
      maxAgents: originalTask.maxAgents,
      requiredCapabilities: originalTask.requiredCapabilities || [],
      metadata: {
        ...(originalTask.metadata || {}),
        retryOf: taskId,
      },
    });

    return newTask;
  }

  /**
   * Rebalance agents across tasks
   */
  async rebalanceAgents(): Promise<void> {
    await this.orchestrator.rebalance();
    this.emit('agentsRebalanced');
  }

  /**
   * Shutdown the Hive Mind
   */
  async shutdown(): Promise<void> {
    this.started = false;

    // Shutdown all agents
    for (const agent of this.agents.values()) {
      await agent.shutdown();
    }

    // Shutdown subsystems
    await Promise.all([
      this.queen.shutdown(),
      this.memory.shutdown(),
      this.communication.shutdown(),
      this.orchestrator.shutdown(),
    ]);

    // Deregister from agent-core
    try {
      this.agentCore.stopHeartbeat(this.id);
      await this.agentCore.deregisterProcess(this.id);

      // Store swarm history in agent-core memory
      await this.agentCore.storeSwarmHistory(this.id, {
        type: 'shutdown',
        description: `Swarm ${this.config.name} shutdown after ${Date.now() - this.startTime}ms uptime`,
        metadata: {
          uptime: Date.now() - this.startTime,
          agentCount: this.agents.size,
        },
      });
    } catch (err) {
      // Non-fatal
      console.warn('Could not deregister swarm from agent-core:', err);
    }

    this.emit('shutdown');
  }

  // Private helper methods

  private getDefaultCapabilities(type: AgentType): string[] {
    const capabilityMap: Record<AgentType, string[]> = {
      coordinator: ['task_management', 'resource_allocation', 'consensus_building'],
      researcher: ['information_gathering', 'pattern_recognition', 'knowledge_synthesis'],
      coder: ['code_generation', 'refactoring', 'debugging'],
      analyst: ['data_analysis', 'performance_metrics', 'bottleneck_detection'],
      architect: ['system_design', 'architecture_patterns', 'integration_planning'],
      tester: ['test_generation', 'quality_assurance', 'edge_case_detection'],
      reviewer: ['code_review', 'standards_enforcement', 'best_practices'],
      optimizer: ['performance_optimization', 'resource_optimization', 'algorithm_improvement'],
      documenter: ['documentation_generation', 'api_docs', 'user_guides'],
      monitor: ['system_monitoring', 'health_checks', 'alerting'],
      specialist: ['domain_expertise', 'custom_capabilities', 'problem_solving'],
      // Maestro specs-driven agent capabilities
      requirements_analyst: ['requirements_analysis', 'user_story_creation', 'acceptance_criteria'],
      design_architect: ['system_design', 'architecture', 'technical_writing', 'specs_driven_design'],
      task_planner: ['task_management', 'workflow_orchestration', 'project_management'],
      implementation_coder: ['code_generation', 'implementation', 'debugging', 'refactoring'],
      quality_reviewer: ['code_review', 'quality_assurance', 'testing', 'standards_enforcement'],
      steering_documenter: ['documentation_generation', 'governance', 'technical_writing'],
    };

    return capabilityMap[type] || [];
  }

  private async assignPendingTasksToAgent(agent: Agent): Promise<void> {
    const pendingTasks = await this.store.getPendingTasks(this.id);

    for (const task of pendingTasks) {
      const requiredCapabilities = task.requiredCapabilities || [];

      // Check if agent has required capabilities
      if (requiredCapabilities.every((cap: string) => agent.capabilities.includes(cap))) {
        await this.orchestrator.assignTaskToAgent(task.id, agent.id);
        break; // Only assign one task at a time
      }
    }
  }

  private async calculatePerformanceMetrics() {
    // This would calculate real metrics from the database
    return {
      avgTaskCompletion: 3500,
      messageThroughput: 120,
      consensusSuccessRate: 92,
      memoryHitRate: 85,
      agentUtilization: 78,
    };
  }

  private determineHealth(agents: Agent[], tasks: any[], performance: any): string {
    if (agents.length === 0) return 'critical';

    const busyAgents = agents.filter((a) => a.status === 'busy').length;
    const utilization = busyAgents / agents.length;

    if (utilization > 0.9) return 'degraded';
    if (performance.consensusSuccessRate < 50) return 'degraded';
    if (agents.filter((a) => a.status === 'error').length > agents.length * 0.2) return 'critical';

    return 'healthy';
  }

  private getSystemWarnings(agents: Agent[], tasks: any[], performance: any): string[] {
    const warnings: string[] = [];

    const utilization = agents.filter((a) => a.status === 'busy').length / agents.length;
    if (utilization > 0.8) {
      warnings.push('High agent utilization - consider spawning more agents');
    }

    const pendingTasks = tasks.filter((t) => t.status === 'pending').length;
    if (pendingTasks > agents.length * 2) {
      warnings.push('Large task backlog - tasks may be delayed');
    }

    if (performance.memoryHitRate < 60) {
      warnings.push('Low memory hit rate - consider optimizing memory usage');
    }

    return warnings;
  }
}
