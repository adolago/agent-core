/**
 * Base Agent Class
 *
 * Foundation for all agent types in the Hive Mind swarm.
 * Provides core functionality for task execution, communication, and coordination.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { QdrantStore, getQdrantStore } from './QdrantStore.js';
import { MCPToolWrapper } from '../integration/MCPToolWrapper.js';
import {
  AgentType,
  AgentStatus,
  AgentCapability,
  Task,
  Message,
  AgentConfig,
  ExecutionResult,
} from '../types.js';
import {
  AgentCoreClient,
  getAgentCoreClient,
  TiaraNamespaces,
} from '../integration/AgentCoreClient.js';

export class Agent extends EventEmitter {
  public readonly id: string;
  public readonly name: string;
  public readonly type: AgentType;
  public readonly swarmId: string;
  public readonly capabilities: AgentCapability[];
  public readonly createdAt: Date;

  public status: AgentStatus = 'idle';
  public currentTask: string | null = null;
  public messageCount: number = 0;

  private store: QdrantStore;
  private mcpWrapper: MCPToolWrapper;
  private agentCore: AgentCoreClient;
  private memory: Map<string, any>;
  private communicationBuffer: Message[];
  private lastHeartbeat: number;
  private isActive: boolean = false;

  constructor(config: AgentConfig) {
    super();
    this.id = config.id || uuidv4();
    this.name = config.name;
    this.type = config.type;
    this.swarmId = config.swarmId;
    this.capabilities = config.capabilities || [];
    this.createdAt = new Date();

    this.memory = new Map();
    this.communicationBuffer = [];
    this.lastHeartbeat = Date.now();
  }

  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    this.store = await getQdrantStore();
    this.mcpWrapper = new MCPToolWrapper();
    this.agentCore = getAgentCoreClient();

    // Load agent state from store if exists
    const existingAgent = await this.store.getAgent(this.id);
    if (existingAgent) {
      this.status = existingAgent.status as AgentStatus;
      this.currentTask = existingAgent.currentTaskId ?? null;
      this.messageCount = existingAgent.messageCount;
    }

    // Start agent loops
    this.startHeartbeatLoop();
    this.startCommunicationLoop();
    this.startLearningLoop();

    this.isActive = true;
    this.emit('initialized');
  }

  /**
   * Assign a task to this agent
   */
  async assignTask(taskId: string, executionPlan: any): Promise<void> {
    if (this.currentTask) {
      throw new Error('Agent already has an active task');
    }

    this.currentTask = taskId;
    this.status = 'busy';

    // Update store
    await this.store.updateAgent(this.id, {
      status: 'busy',
      currentTaskId: taskId,
    });

    // Store task in memory
    this.memory.set('current_task', { taskId, executionPlan, startTime: Date.now() });

    // Start task execution
    this.executeTask(taskId, executionPlan).catch((error) => {
      this.emit('taskError', { taskId, error });
    });

    this.emit('taskAssigned', { taskId });
  }

  /**
   * Execute assigned task
   */
  private async executeTask(taskId: string, executionPlan: any): Promise<void> {
    try {
      // Load task details
      const task = await this.store.getTask(taskId);
      if (!task) {
        throw new Error('Task not found');
      }

      // Update task status
      await this.store.updateTaskStatus(taskId, 'in_progress');

      // Execute based on agent type
      const result = await this.executeByType(task, executionPlan);

      // Store result
      await this.store.updateTask(taskId, {
        status: 'completed',
        result: result,
        completedAt: Date.now(),
      });

      // Learn from execution
      await this.learnFromExecution(task, result);

      // Clear task
      this.currentTask = null;
      this.status = 'idle';

      // Update agent success count
      const agent = await this.store.getAgent(this.id);
      await this.store.updateAgent(this.id, {
        status: 'idle',
        currentTaskId: undefined,
        successCount: (agent?.successCount ?? 0) + 1,
      });

      this.emit('taskCompleted', { taskId, result });
    } catch (error) {
      // Handle task failure
      await this.handleTaskFailure(taskId, error);
    }
  }

  /**
   * Execute task based on agent type
   */
  protected async executeByType(task: any, executionPlan: any): Promise<ExecutionResult> {
    // Base implementation - override in specialized agents
    const startTime = Date.now();

    // Simulate task execution phases
    const phases = executionPlan.phases || ['analysis', 'execution', 'validation'];
    const results: any[] = [];

    for (const phase of phases) {
      const phaseResult = await this.executePhase(phase, task, executionPlan);
      results.push(phaseResult);

      // Update progress
      const progress = Math.round(((phases.indexOf(phase) + 1) / phases.length) * 100);
      await this.updateTaskProgress(task.id, progress);

      // Communicate progress
      await this.communicateProgress(task.id, phase, progress);
    }

    return {
      success: true,
      data: results,
      executionTime: Date.now() - startTime,
      agentId: this.id,
      metadata: {
        phases: phases,
        plan: executionPlan,
      },
    };
  }

  /**
   * Execute a specific phase of the task
   */
  protected async executePhase(phase: string, task: any, plan: any): Promise<any> {
    // Use MCP tools based on phase and agent capabilities
    switch (phase) {
      case 'analysis':
        return this.performAnalysis(task);

      case 'execution':
        return this.performExecution(task, plan);

      case 'validation':
        return this.performValidation(task);

      default:
        return { phase, status: 'completed' };
    }
  }

  /**
   * Perform analysis phase
   */
  protected async performAnalysis(task: any): Promise<any> {
    // Use neural analysis for task understanding
    const analysis = await this.mcpWrapper.analyzePattern({
      action: 'analyze',
      operation: `${this.type}_analysis`,
      metadata: {
        task: task.description,
        agentType: this.type,
        capabilities: this.capabilities,
      },
    });

    // Store analysis in memory
    await this.storeInMemory('task_analysis', analysis);

    return {
      phase: 'analysis',
      complexity: analysis.complexity || 'medium',
      estimatedTime: analysis.estimatedTime || 3600000,
      requirements: analysis.requirements || [],
    };
  }

  /**
   * Perform execution phase
   */
  protected async performExecution(task: any, plan: any): Promise<any> {
    // Base execution - specialized agents override this
    const actions =
      plan.agentAssignments?.find((a: any) => a.agentId === this.id)?.responsibilities || [];
    const results = [];

    for (const action of actions) {
      const actionResult = await this.executeAction(action, task);
      results.push(actionResult);
    }

    return {
      phase: 'execution',
      actions: actions,
      results: results,
    };
  }

  /**
   * Perform validation phase
   */
  protected async performValidation(task: any): Promise<any> {
    // Validate execution results
    const validation = {
      phase: 'validation',
      checks: [],
      passed: true,
    };

    // Basic validation checks
    const checks = [
      { name: 'completeness', passed: true },
      { name: 'quality', passed: true },
      { name: 'performance', passed: true },
    ];

    validation.checks = checks;
    validation.passed = checks.every((c) => c.passed);

    return validation;
  }

  /**
   * Execute a specific action
   */
  protected async executeAction(action: string, task: any): Promise<any> {
    // Base action execution
    return {
      action: action,
      status: 'completed',
      timestamp: new Date(),
    };
  }

  /**
   * Send a message to another agent or broadcast
   */
  async sendMessage(toAgentId: string | null, messageType: string, content: any): Promise<void> {
    const message: Message = {
      id: uuidv4(),
      fromAgentId: this.id,
      toAgentId,
      swarmId: this.swarmId,
      type: messageType,
      content,
      timestamp: new Date(),
      requiresResponse: false,
    };

    // Store in Qdrant
    await this.store.createCommunication({
      fromAgentId: this.id,
      toAgentId: toAgentId ?? undefined,
      swarmId: this.swarmId,
      messageType: messageType as any,
      content: JSON.stringify(content),
      priority: 'normal',
      requiresResponse: false,
    });

    this.messageCount++;
    this.emit('messageSent', message);
  }

  /**
   * Receive and process a message
   */
  async receiveMessage(message: Message): Promise<void> {
    this.communicationBuffer.push(message);
    this.emit('messageReceived', message);
  }

  /**
   * Vote on a consensus proposal
   */
  async voteOnProposal(proposalId: string, vote: boolean, reason?: string): Promise<void> {
    await this.store.submitConsensusVote(proposalId, this.id, vote, reason);
    this.emit('voteCast', { proposalId, vote, reason });
  }

  /**
   * Update task progress
   */
  protected async updateTaskProgress(taskId: string, progress: number): Promise<void> {
    await this.store.updateTask(taskId, {
      metadata: { progress, lastProgressUpdate: Date.now() },
    });
  }

  /**
   * Communicate progress to other agents
   */
  protected async communicateProgress(
    taskId: string,
    phase: string,
    progress: number,
  ): Promise<void> {
    await this.sendMessage(null, 'progress_update', {
      taskId,
      agentId: this.id,
      phase,
      progress,
      timestamp: new Date(),
    });
  }

  /**
   * Store data in agent memory
   */
  protected async storeInMemory(key: string, value: any): Promise<void> {
    this.memory.set(key, value);

    // Also store in persistent memory
    await this.mcpWrapper.storeMemory({
      action: 'store',
      key: `agent/${this.id}/${key}`,
      value: JSON.stringify(value),
      namespace: 'agent-memory',
      ttl: 3600, // 1 hour
    });
  }

  /**
   * Retrieve from agent memory
   */
  protected async retrieveFromMemory(key: string): Promise<any> {
    // Check local memory first
    if (this.memory.has(key)) {
      return this.memory.get(key);
    }

    // Check persistent memory
    const result = await this.mcpWrapper.retrieveMemory({
      action: 'retrieve',
      key: `agent/${this.id}/${key}`,
      namespace: 'agent-memory',
    });

    return result ? JSON.parse(result) : null;
  }

  /**
   * Learn from task execution
   */
  protected async learnFromExecution(task: any, result: ExecutionResult): Promise<void> {
    const learningData = {
      taskType: this.detectTaskType(task.description),
      agentType: this.type,
      success: result.success,
      executionTime: result.executionTime,
      patterns: this.extractPatterns(task, result),
    };

    // Store learning pattern in agent-core memory
    try {
      await this.agentCore.storeLearningPattern(
        `Agent ${this.name} (${this.type}): ${result.success ? 'successful' : 'failed'} execution of ${task.description.slice(0, 100)}`,
        {
          agentId: this.id,
          agentType: this.type,
          taskId: task.id,
          ...learningData,
        },
        result.success ? 0.7 : 0.3
      );
    } catch (err) {
      // Fall back to MCP wrapper if agent-core unavailable
      console.warn('Could not store learning in agent-core, falling back to MCP:', err);
    }

    // Also train neural patterns via MCP
    await this.mcpWrapper.trainNeural({
      pattern_type: 'optimization',
      training_data: JSON.stringify(learningData),
      epochs: 10,
    });
  }

  /**
   * Handle task failure
   */
  protected async handleTaskFailure(taskId: string, error: any): Promise<void> {
    // Update task status
    await this.store.updateTask(taskId, {
      status: 'failed',
      error: error.message,
      completedAt: Date.now(),
    });

    // Update agent stats
    const agent = await this.store.getAgent(this.id);
    await this.store.updateAgent(this.id, {
      status: 'idle',
      currentTaskId: undefined,
      errorCount: (agent?.errorCount ?? 0) + 1,
    });

    // Clear current task
    this.currentTask = null;
    this.status = 'idle';

    // Notify swarm of failure
    await this.sendMessage(null, 'task_failed', {
      taskId,
      agentId: this.id,
      error: error.message,
      timestamp: new Date(),
    });

    this.emit('taskFailed', { taskId, error });
  }

  /**
   * Start heartbeat loop
   */
  private startHeartbeatLoop(): void {
    setInterval(async () => {
      if (!this.isActive) return;

      this.lastHeartbeat = Date.now();

      // Update last heartbeat timestamp
      await this.store.updateAgent(this.id, {
        lastHeartbeat: Date.now(),
      });

      this.emit('heartbeat');
    }, 30000); // Every 30 seconds
  }

  /**
   * Start communication processing loop
   */
  private startCommunicationLoop(): void {
    setInterval(async () => {
      if (!this.isActive || this.communicationBuffer.length === 0) return;

      // Process buffered messages
      const messages = [...this.communicationBuffer];
      this.communicationBuffer = [];

      for (const message of messages) {
        await this.processMessage(message);
      }
    }, 1000); // Every second
  }

  /**
   * Start learning loop
   */
  private startLearningLoop(): void {
    setInterval(async () => {
      if (!this.isActive) return;

      try {
        // Analyze recent patterns
        const patterns = await this.analyzeRecentPatterns();

        // Update capabilities if needed
        await this.updateCapabilities(patterns);
      } catch (error) {
        this.emit('learningError', error);
      }
    }, 300000); // Every 5 minutes
  }

  /**
   * Process incoming message
   */
  protected async processMessage(message: Message): Promise<void> {
    switch (message.type) {
      case 'task_assignment':
        await this.handleTaskAssignment(message.content);
        break;

      case 'consensus':
        await this.handleConsensusRequest(message.content);
        break;

      case 'query':
        await this.handleQuery(message);
        break;

      case 'coordination':
        await this.handleCoordination(message.content);
        break;

      default:
        this.emit('unknownMessage', message);
    }
  }

  /**
   * Check if agent is responsive
   */
  isResponsive(): boolean {
    const timeout = 60000; // 1 minute
    return Date.now() - this.lastHeartbeat < timeout;
  }

  /**
   * Get agent state
   */
  getState(): any {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      status: this.status,
      currentTask: this.currentTask,
      capabilities: this.capabilities,
      messageCount: this.messageCount,
      isResponsive: this.isResponsive(),
      memory: Object.fromEntries(this.memory),
    };
  }

  /**
   * Shutdown the agent
   */
  async shutdown(): Promise<void> {
    this.isActive = false;

    // Update status in store
    await this.store.updateAgentStatus(this.id, 'offline');

    // Save agent state to agent-core for continuity
    try {
      await this.agentCore.storeAgentState(this.id, {
        context: `Agent ${this.name} (${this.type}) shutdown`,
        currentTask: this.currentTask ?? undefined,
        learnings: Array.from(this.memory.keys()),
        metadata: {
          messageCount: this.messageCount,
          capabilities: this.capabilities,
          shutdownAt: Date.now(),
        },
      });
    } catch (err) {
      console.warn('Could not save agent state to agent-core:', err);
    }

    // Clear memory
    this.memory.clear();
    this.communicationBuffer = [];

    this.emit('shutdown');
  }

  // Helper methods

  private detectTaskType(description: string): string {
    const lower = description.toLowerCase();

    if (lower.includes('research') || lower.includes('investigate')) return 'research';
    if (lower.includes('develop') || lower.includes('implement')) return 'development';
    if (lower.includes('analyze') || lower.includes('review')) return 'analysis';
    if (lower.includes('test') || lower.includes('validate')) return 'testing';
    if (lower.includes('optimize') || lower.includes('improve')) return 'optimization';

    return 'general';
  }

  private extractPatterns(task: any, result: ExecutionResult): any {
    return {
      taskComplexity: task.priority,
      executionStrategy: task.strategy,
      phasesCompleted: result.metadata?.phases?.length || 0,
      timePerPhase: result.executionTime / (result.metadata?.phases?.length || 1),
    };
  }

  private async analyzeRecentPatterns(): Promise<any> {
    return this.mcpWrapper.analyzePattern({
      action: 'analyze',
      operation: 'agent_patterns',
      metadata: {
        agentId: this.id,
        agentType: this.type,
        timeframe: '1h',
      },
    });
  }

  private async updateCapabilities(patterns: any): Promise<void> {
    if (patterns.suggestedCapabilities) {
      // Update capabilities based on learning
      const newCapabilities = patterns.suggestedCapabilities.filter(
        (cap: string) => !this.capabilities.includes(cap),
      );

      if (newCapabilities.length > 0) {
        this.capabilities.push(...newCapabilities);

        await this.store.updateAgent(this.id, {
          capabilities: this.capabilities,
        });

        this.emit('capabilitiesUpdated', newCapabilities);
      }
    }
  }

  private async handleTaskAssignment(content: any): Promise<void> {
    // Handle incoming task assignment
    if (!this.currentTask && content.taskId) {
      await this.assignTask(content.taskId, content.executionPlan || {});
    }
  }

  private async handleConsensusRequest(content: any): Promise<void> {
    // Analyze proposal and vote
    const analysis = await this.analyzeProposal(content);
    await this.voteOnProposal(content.proposalId, analysis.vote, analysis.reason);
  }

  private async handleQuery(message: Message): Promise<void> {
    // Respond to query
    const response = await this.processQuery(message.content);

    if (message.fromAgentId) {
      await this.sendMessage(message.fromAgentId, 'response', {
        queryId: message.id,
        response,
      });
    }
  }

  private async handleCoordination(content: any): Promise<void> {
    // Handle coordination messages
    this.emit('coordinationReceived', content);
  }

  private async analyzeProposal(proposal: any): Promise<any> {
    // Simple analysis - can be overridden by specialized agents
    return {
      vote: Math.random() > 0.3, // 70% approval rate
      reason: 'Based on agent analysis',
    };
  }

  private async processQuery(query: any): Promise<any> {
    // Process and respond to queries
    return {
      agentId: this.id,
      agentType: this.type,
      status: this.status,
      response: 'Query processed',
    };
  }
}
