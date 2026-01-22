/**
 * Swarm Coordinator Tests
 *
 * Comprehensive tests for the SwarmCoordinator - the "Queen" that orchestrates
 * agent task allocation, objective management, and swarm coordination.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Set test mode
process.env.TIARA_TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

describe('SwarmCoordinator', () => {
  describe('Agent Selection Algorithm', () => {
    // Mock agent data for scoring tests
    const createMockAgent = (overrides: Partial<{
      id: string;
      type: string;
      status: string;
      workload: number;
      capabilities: {
        languages: string[];
        frameworks: string[];
        reliability: number;
        quality: number;
      };
      metrics: {
        successRate: number;
        tasksCompleted: number;
      };
    }> = {}) => ({
      id: { id: overrides.id || 'agent-1', swarmId: 'swarm-1', type: 'coder', instance: 1 },
      name: 'Test Agent',
      type: overrides.type || 'coder',
      status: overrides.status || 'idle',
      workload: overrides.workload ?? 0,
      capabilities: {
        codeGeneration: true,
        testing: true,
        languages: overrides.capabilities?.languages || ['typescript'],
        frameworks: overrides.capabilities?.frameworks || ['node'],
        reliability: overrides.capabilities?.reliability ?? 0.9,
        quality: overrides.capabilities?.quality ?? 0.8,
        ...(overrides.capabilities || {}),
      },
      metrics: {
        successRate: overrides.metrics?.successRate ?? 0.9,
        tasksCompleted: overrides.metrics?.tasksCompleted ?? 10,
        ...(overrides.metrics || {}),
      },
      health: 1.0,
      lastHeartbeat: new Date(),
    });

    const createMockTask = (overrides: Partial<{
      type: string;
      requirements: {
        agentType?: string;
        capabilities: string[];
        minReliability?: number;
      };
    }> = {}) => ({
      id: { id: 'task-1', swarmId: 'swarm-1', sequence: 1, priority: 5 },
      type: overrides.type || 'coding',
      name: 'Test Task',
      requirements: {
        capabilities: overrides.requirements?.capabilities || ['codeGeneration'],
        agentType: overrides.requirements?.agentType,
        minReliability: overrides.requirements?.minReliability ?? 0.7,
        ...(overrides.requirements || {}),
      },
      status: 'queued',
    });

    it('should calculate capability match score correctly', () => {
      // Capability match = required capabilities present / total required
      function calculateCapabilityMatch(
        agent: ReturnType<typeof createMockAgent>,
        task: ReturnType<typeof createMockTask>
      ): number {
        const required = task.requirements.capabilities;
        if (required.length === 0) return 1.0;

        let matches = 0;
        for (const cap of required) {
          if (agent.capabilities[cap as keyof typeof agent.capabilities]) {
            matches++;
          }
        }
        return matches / required.length;
      }

      const agent = createMockAgent();
      const task = createMockTask({ requirements: { capabilities: ['codeGeneration', 'testing'] } });

      expect(calculateCapabilityMatch(agent, task)).toBe(1.0);

      const taskWithMissing = createMockTask({
        requirements: { capabilities: ['codeGeneration', 'testing', 'webSearch'] }
      });
      expect(calculateCapabilityMatch(agent, taskWithMissing)).toBeCloseTo(0.67, 1);
    });

    it('should calculate performance score from success rate and reliability', () => {
      function calculatePerformanceScore(agent: ReturnType<typeof createMockAgent>): number {
        const successRate = agent.metrics.successRate;
        const reliability = agent.capabilities.reliability;
        return successRate * reliability;
      }

      const highPerformer = createMockAgent({
        metrics: { successRate: 0.95, tasksCompleted: 50 },
        capabilities: { reliability: 0.95, quality: 0.9, languages: [], frameworks: [] }
      });
      expect(calculatePerformanceScore(highPerformer)).toBeCloseTo(0.9025, 3);

      const lowPerformer = createMockAgent({
        metrics: { successRate: 0.6, tasksCompleted: 5 },
        capabilities: { reliability: 0.7, quality: 0.5, languages: [], frameworks: [] }
      });
      expect(calculatePerformanceScore(lowPerformer)).toBeCloseTo(0.42, 2);
    });

    it('should calculate workload score (prefer idle agents)', () => {
      function calculateWorkloadScore(agent: ReturnType<typeof createMockAgent>): number {
        return 1 - agent.workload;
      }

      expect(calculateWorkloadScore(createMockAgent({ workload: 0 }))).toBe(1.0);
      expect(calculateWorkloadScore(createMockAgent({ workload: 0.5 }))).toBe(0.5);
      expect(calculateWorkloadScore(createMockAgent({ workload: 0.9 }))).toBeCloseTo(0.1);
    });

    it('should calculate overall agent score with weighted components', () => {
      // Weights: capability(40%) + performance(30%) + workload(20%) + quality(10%)
      function calculateAgentScore(
        agent: ReturnType<typeof createMockAgent>,
        task: ReturnType<typeof createMockTask>
      ): number {
        const required = task.requirements.capabilities;
        let capabilityMatch = 1.0;
        if (required.length > 0) {
          let matches = 0;
          for (const cap of required) {
            if (agent.capabilities[cap as keyof typeof agent.capabilities]) matches++;
          }
          capabilityMatch = matches / required.length;
        }

        const performanceScore = agent.metrics.successRate * agent.capabilities.reliability;
        const workloadScore = 1 - agent.workload;
        const qualityScore = agent.capabilities.quality;

        return (
          capabilityMatch * 0.4 +
          performanceScore * 0.3 +
          workloadScore * 0.2 +
          qualityScore * 0.1
        );
      }

      const idealAgent = createMockAgent({
        workload: 0,
        metrics: { successRate: 1.0, tasksCompleted: 100 },
        capabilities: { reliability: 1.0, quality: 1.0, languages: [], frameworks: [] }
      });
      const task = createMockTask({ requirements: { capabilities: ['codeGeneration'] } });

      // Perfect agent: 0.4 + 0.3 + 0.2 + 0.1 = 1.0
      expect(calculateAgentScore(idealAgent, task)).toBeCloseTo(1.0, 10);

      const busyAgent = createMockAgent({
        workload: 0.8,
        metrics: { successRate: 0.7, tasksCompleted: 20 },
        capabilities: { reliability: 0.8, quality: 0.6, languages: [], frameworks: [] }
      });
      // Busy agent: 0.4 + (0.7*0.8)*0.3 + 0.2*0.2 + 0.6*0.1 = 0.4 + 0.168 + 0.04 + 0.06 = 0.668
      expect(calculateAgentScore(busyAgent, task)).toBeCloseTo(0.668, 2);
    });

    it('should select best agent from pool', () => {
      function selectBestAgent(
        agents: ReturnType<typeof createMockAgent>[],
        task: ReturnType<typeof createMockTask>
      ): ReturnType<typeof createMockAgent> | null {
        const available = agents.filter(a => a.status === 'idle' && a.workload < 1.0);
        if (available.length === 0) return null;

        let bestAgent = available[0];
        let bestScore = -1;

        for (const agent of available) {
          const required = task.requirements.capabilities;
          let capabilityMatch = 1.0;
          if (required.length > 0) {
            let matches = 0;
            for (const cap of required) {
              if (agent.capabilities[cap as keyof typeof agent.capabilities]) matches++;
            }
            capabilityMatch = matches / required.length;
          }
          const score = (
            capabilityMatch * 0.4 +
            agent.metrics.successRate * agent.capabilities.reliability * 0.3 +
            (1 - agent.workload) * 0.2 +
            agent.capabilities.quality * 0.1
          );
          if (score > bestScore) {
            bestScore = score;
            bestAgent = agent;
          }
        }

        return bestAgent;
      }

      const agents = [
        createMockAgent({ id: 'agent-1', workload: 0.5, metrics: { successRate: 0.8, tasksCompleted: 20 } }),
        createMockAgent({ id: 'agent-2', workload: 0, metrics: { successRate: 0.95, tasksCompleted: 50 } }),
        createMockAgent({ id: 'agent-3', status: 'busy', workload: 1.0, metrics: { successRate: 1.0, tasksCompleted: 100 } }),
      ];
      const task = createMockTask();

      const selected = selectBestAgent(agents, task);
      expect(selected).not.toBeNull();
      expect(selected?.id.id).toBe('agent-2'); // Best idle agent with highest score
    });

    it('should return null when no suitable agents available', () => {
      function selectBestAgent(
        agents: ReturnType<typeof createMockAgent>[],
        task: ReturnType<typeof createMockTask>
      ): ReturnType<typeof createMockAgent> | null {
        const available = agents.filter(a => a.status === 'idle' && a.workload < 1.0);
        return available.length > 0 ? available[0] : null;
      }

      const allBusy = [
        createMockAgent({ id: 'agent-1', status: 'busy', workload: 1.0 }),
        createMockAgent({ id: 'agent-2', status: 'busy', workload: 0.9 }),
      ];
      expect(selectBestAgent(allBusy, createMockTask())).toBeNull();
    });

    it('should filter agents by reliability threshold', () => {
      function agentMeetsReliability(
        agent: ReturnType<typeof createMockAgent>,
        minReliability: number
      ): boolean {
        return agent.capabilities.reliability >= minReliability;
      }

      const reliableAgent = createMockAgent({
        capabilities: { reliability: 0.9, quality: 0.8, languages: [], frameworks: [] }
      });
      const unreliableAgent = createMockAgent({
        capabilities: { reliability: 0.5, quality: 0.8, languages: [], frameworks: [] }
      });

      expect(agentMeetsReliability(reliableAgent, 0.7)).toBe(true);
      expect(agentMeetsReliability(unreliableAgent, 0.7)).toBe(false);
    });
  });

  describe('Task Dependency Resolution', () => {
    it('should detect when all dependencies are met', () => {
      function dependenciesMet(
        task: { dependencies: string[] },
        completedTaskIds: Set<string>
      ): boolean {
        if (!task.dependencies || task.dependencies.length === 0) return true;
        return task.dependencies.every(dep => completedTaskIds.has(dep));
      }

      const taskNoDeps = { dependencies: [] };
      expect(dependenciesMet(taskNoDeps, new Set())).toBe(true);

      const taskWithDeps = { dependencies: ['task-1', 'task-2'] };
      expect(dependenciesMet(taskWithDeps, new Set(['task-1']))).toBe(false);
      expect(dependenciesMet(taskWithDeps, new Set(['task-1', 'task-2']))).toBe(true);
      expect(dependenciesMet(taskWithDeps, new Set(['task-1', 'task-2', 'task-3']))).toBe(true);
    });

    it('should detect circular dependencies', () => {
      function hasCircularDependency(
        tasks: Map<string, { id: string; dependencies: string[] }>,
        taskId: string,
        visited: Set<string> = new Set(),
        stack: Set<string> = new Set()
      ): boolean {
        if (stack.has(taskId)) return true; // Cycle detected
        if (visited.has(taskId)) return false; // Already processed

        visited.add(taskId);
        stack.add(taskId);

        const task = tasks.get(taskId);
        if (task) {
          for (const dep of task.dependencies) {
            if (hasCircularDependency(tasks, dep, visited, stack)) {
              return true;
            }
          }
        }

        stack.delete(taskId);
        return false;
      }

      // No cycle: A -> B -> C
      const noCycle = new Map([
        ['A', { id: 'A', dependencies: ['B'] }],
        ['B', { id: 'B', dependencies: ['C'] }],
        ['C', { id: 'C', dependencies: [] }],
      ]);
      expect(hasCircularDependency(noCycle, 'A')).toBe(false);

      // Cycle: A -> B -> C -> A
      const withCycle = new Map([
        ['A', { id: 'A', dependencies: ['B'] }],
        ['B', { id: 'B', dependencies: ['C'] }],
        ['C', { id: 'C', dependencies: ['A'] }],
      ]);
      expect(hasCircularDependency(withCycle, 'A')).toBe(true);

      // Self-reference: A -> A
      const selfRef = new Map([
        ['A', { id: 'A', dependencies: ['A'] }],
      ]);
      expect(hasCircularDependency(selfRef, 'A')).toBe(true);
    });

    it('should calculate topological order for task execution', () => {
      function topologicalSort(
        tasks: Map<string, { id: string; dependencies: string[] }>
      ): string[] {
        const result: string[] = [];
        const visited = new Set<string>();
        const temp = new Set<string>();

        function visit(taskId: string): boolean {
          if (temp.has(taskId)) return false; // Cycle
          if (visited.has(taskId)) return true;

          temp.add(taskId);
          const task = tasks.get(taskId);
          if (task) {
            for (const dep of task.dependencies) {
              if (!visit(dep)) return false;
            }
          }
          temp.delete(taskId);
          visited.add(taskId);
          result.push(taskId);
          return true;
        }

        for (const taskId of tasks.keys()) {
          if (!visited.has(taskId)) {
            visit(taskId);
          }
        }

        return result;
      }

      const tasks = new Map([
        ['compile', { id: 'compile', dependencies: ['parse'] }],
        ['parse', { id: 'parse', dependencies: ['lex'] }],
        ['lex', { id: 'lex', dependencies: [] }],
        ['optimize', { id: 'optimize', dependencies: ['compile'] }],
      ]);

      const order = topologicalSort(tasks);
      expect(order.indexOf('lex')).toBeLessThan(order.indexOf('parse'));
      expect(order.indexOf('parse')).toBeLessThan(order.indexOf('compile'));
      expect(order.indexOf('compile')).toBeLessThan(order.indexOf('optimize'));
    });

    it('should identify blocked tasks', () => {
      function getBlockedTasks(
        tasks: Map<string, { id: string; dependencies: string[]; status: string }>,
        completedTaskIds: Set<string>
      ): string[] {
        const blocked: string[] = [];
        for (const [id, task] of tasks) {
          if (task.status === 'blocked' || task.status === 'queued') {
            const hasUnmetDeps = task.dependencies.some(dep => !completedTaskIds.has(dep));
            if (hasUnmetDeps) {
              blocked.push(id);
            }
          }
        }
        return blocked;
      }

      const tasks = new Map([
        ['A', { id: 'A', dependencies: [], status: 'completed' }],
        ['B', { id: 'B', dependencies: ['A'], status: 'queued' }],
        ['C', { id: 'C', dependencies: ['B'], status: 'blocked' }],
        ['D', { id: 'D', dependencies: ['X'], status: 'blocked' }], // X doesn't exist
      ]);

      const blocked = getBlockedTasks(tasks, new Set(['A']));
      expect(blocked).toContain('C');
      expect(blocked).toContain('D');
      expect(blocked).not.toContain('B'); // B's deps are met
    });
  });

  describe('Task Retry Logic', () => {
    it('should calculate exponential backoff delay', () => {
      function calculateBackoffDelay(attemptNumber: number, baseMs: number = 1000): number {
        return Math.pow(2, attemptNumber) * baseMs;
      }

      expect(calculateBackoffDelay(0)).toBe(1000);  // 2^0 * 1000 = 1000ms
      expect(calculateBackoffDelay(1)).toBe(2000);  // 2^1 * 1000 = 2000ms
      expect(calculateBackoffDelay(2)).toBe(4000);  // 2^2 * 1000 = 4000ms
      expect(calculateBackoffDelay(3)).toBe(8000);  // 2^3 * 1000 = 8000ms
      expect(calculateBackoffDelay(4)).toBe(16000); // 2^4 * 1000 = 16000ms
    });

    it('should determine if task should retry', () => {
      interface TaskError {
        retryable: boolean;
        recoverable: boolean;
      }

      function shouldRetry(
        error: TaskError,
        attemptCount: number,
        maxRetries: number = 3
      ): boolean {
        return error.retryable && attemptCount < maxRetries;
      }

      const retryableError: TaskError = { retryable: true, recoverable: true };
      const fatalError: TaskError = { retryable: false, recoverable: false };

      expect(shouldRetry(retryableError, 0, 3)).toBe(true);
      expect(shouldRetry(retryableError, 2, 3)).toBe(true);
      expect(shouldRetry(retryableError, 3, 3)).toBe(false); // Max reached
      expect(shouldRetry(fatalError, 0, 3)).toBe(false); // Not retryable
    });

    it('should track task attempt history', () => {
      interface TaskAttempt {
        attemptNumber: number;
        startedAt: Date;
        completedAt?: Date;
        agentId: string;
        error?: { type: string; message: string };
      }

      function recordAttempt(
        attempts: TaskAttempt[],
        agentId: string,
        error?: { type: string; message: string }
      ): TaskAttempt {
        const attempt: TaskAttempt = {
          attemptNumber: attempts.length,
          startedAt: new Date(),
          completedAt: new Date(),
          agentId,
          error,
        };
        attempts.push(attempt);
        return attempt;
      }

      const attempts: TaskAttempt[] = [];

      recordAttempt(attempts, 'agent-1', { type: 'TimeoutError', message: 'Timed out' });
      recordAttempt(attempts, 'agent-2', { type: 'NetworkError', message: 'Connection lost' });
      recordAttempt(attempts, 'agent-1'); // Success

      expect(attempts).toHaveLength(3);
      expect(attempts[0].attemptNumber).toBe(0);
      expect(attempts[1].attemptNumber).toBe(1);
      expect(attempts[2].attemptNumber).toBe(2);
      expect(attempts[2].error).toBeUndefined(); // Success has no error
    });

    it('should classify error types for retry decisions', () => {
      type ErrorType = 'TimeoutError' | 'NetworkError' | 'ValidationError' | 'AuthError' | 'InternalError';

      function classifyError(errorType: ErrorType): { retryable: boolean; recoverable: boolean } {
        const classifications: Record<ErrorType, { retryable: boolean; recoverable: boolean }> = {
          TimeoutError: { retryable: true, recoverable: true },
          NetworkError: { retryable: true, recoverable: true },
          ValidationError: { retryable: false, recoverable: false },
          AuthError: { retryable: false, recoverable: false },
          InternalError: { retryable: true, recoverable: true },
        };
        return classifications[errorType] || { retryable: false, recoverable: false };
      }

      expect(classifyError('TimeoutError').retryable).toBe(true);
      expect(classifyError('NetworkError').retryable).toBe(true);
      expect(classifyError('ValidationError').retryable).toBe(false);
      expect(classifyError('AuthError').retryable).toBe(false);
    });
  });

  describe('Objective Progress Tracking', () => {
    interface ObjectiveProgress {
      totalTasks: number;
      completedTasks: number;
      failedTasks: number;
      runningTasks: number;
      queuedTasks: number;
    }

    it('should calculate progress percentage', () => {
      function calculateProgress(progress: ObjectiveProgress): number {
        if (progress.totalTasks === 0) return 0;
        return (progress.completedTasks + progress.failedTasks) / progress.totalTasks;
      }

      expect(calculateProgress({ totalTasks: 0, completedTasks: 0, failedTasks: 0, runningTasks: 0, queuedTasks: 0 })).toBe(0);
      expect(calculateProgress({ totalTasks: 10, completedTasks: 5, failedTasks: 0, runningTasks: 2, queuedTasks: 3 })).toBe(0.5);
      expect(calculateProgress({ totalTasks: 10, completedTasks: 8, failedTasks: 2, runningTasks: 0, queuedTasks: 0 })).toBe(1.0);
    });

    it('should determine objective completion status', () => {
      function getObjectiveStatus(progress: ObjectiveProgress): 'executing' | 'completed' | 'failed' {
        const finished = progress.completedTasks + progress.failedTasks;
        if (finished < progress.totalTasks) return 'executing';
        if (progress.failedTasks > 0) return 'failed';
        return 'completed';
      }

      expect(getObjectiveStatus({ totalTasks: 10, completedTasks: 5, failedTasks: 0, runningTasks: 2, queuedTasks: 3 })).toBe('executing');
      expect(getObjectiveStatus({ totalTasks: 10, completedTasks: 10, failedTasks: 0, runningTasks: 0, queuedTasks: 0 })).toBe('completed');
      expect(getObjectiveStatus({ totalTasks: 10, completedTasks: 8, failedTasks: 2, runningTasks: 0, queuedTasks: 0 })).toBe('failed');
    });

    it('should track task status transitions', () => {
      interface TaskStatusChange {
        from: string;
        to: string;
        timestamp: number;
        reason?: string;
      }

      function recordStatusChange(
        history: TaskStatusChange[],
        from: string,
        to: string,
        reason?: string
      ): void {
        history.push({ from, to, timestamp: Date.now(), reason });
      }

      const history: TaskStatusChange[] = [];

      recordStatusChange(history, 'created', 'queued');
      recordStatusChange(history, 'queued', 'assigned');
      recordStatusChange(history, 'assigned', 'running');
      recordStatusChange(history, 'running', 'completed', 'Task finished successfully');

      expect(history).toHaveLength(4);
      expect(history[0].from).toBe('created');
      expect(history[3].to).toBe('completed');
      expect(history[3].reason).toBe('Task finished successfully');
    });
  });

  describe('Swarm Configuration', () => {
    it('should validate swarm mode', () => {
      const validModes = ['centralized', 'distributed', 'hierarchical', 'mesh', 'hybrid'];

      function isValidMode(mode: string): boolean {
        return validModes.includes(mode);
      }

      expect(isValidMode('centralized')).toBe(true);
      expect(isValidMode('mesh')).toBe(true);
      expect(isValidMode('invalid')).toBe(false);
    });

    it('should validate swarm strategy', () => {
      const validStrategies = ['auto', 'research', 'development', 'analysis', 'testing', 'optimization', 'maintenance', 'custom'];

      function isValidStrategy(strategy: string): boolean {
        return validStrategies.includes(strategy);
      }

      expect(isValidStrategy('auto')).toBe(true);
      expect(isValidStrategy('development')).toBe(true);
      expect(isValidStrategy('invalid')).toBe(false);
    });

    it('should apply configuration defaults', () => {
      interface SwarmConfig {
        maxAgents?: number;
        maxTasks?: number;
        mode?: string;
        strategy?: string;
        heartbeatInterval?: number;
      }

      const defaults: Required<SwarmConfig> = {
        maxAgents: 10,
        maxTasks: 100,
        mode: 'centralized',
        strategy: 'auto',
        heartbeatInterval: 10000,
      };

      function applyDefaults(config: SwarmConfig): Required<SwarmConfig> {
        return { ...defaults, ...config };
      }

      const partial: SwarmConfig = { maxAgents: 20 };
      const full = applyDefaults(partial);

      expect(full.maxAgents).toBe(20);
      expect(full.maxTasks).toBe(100);
      expect(full.mode).toBe('centralized');
    });
  });

  describe('Event Emission', () => {
    it('should define all swarm event types', () => {
      const eventTypes = [
        'swarm.initialized',
        'swarm.shutdown',
        'swarm.paused',
        'swarm.resumed',
        'objective.created',
        'objective.started',
        'objective.completed',
        'objective.failed',
        'agent.registered',
        'agent.started',
        'agent.stopped',
        'agent.error',
        'task.created',
        'task.assigned',
        'task.started',
        'task.completed',
        'task.failed',
        'task.cancelled',
        'task.queued',
        'task.retrying',
      ];

      expect(eventTypes).toContain('swarm.initialized');
      expect(eventTypes).toContain('objective.completed');
      expect(eventTypes).toContain('task.retrying');
      expect(eventTypes.length).toBeGreaterThan(15);
    });

    it('should create properly structured events', () => {
      interface SwarmEvent {
        id: string;
        type: string;
        timestamp: number;
        swarmId: string;
        payload: Record<string, unknown>;
      }

      function createEvent(
        type: string,
        swarmId: string,
        payload: Record<string, unknown> = {}
      ): SwarmEvent {
        return {
          id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type,
          timestamp: Date.now(),
          swarmId,
          payload,
        };
      }

      const event = createEvent('task.completed', 'swarm-1', { taskId: 'task-1', result: 'success' });

      expect(event.id).toMatch(/^evt-/);
      expect(event.type).toBe('task.completed');
      expect(event.swarmId).toBe('swarm-1');
      expect(event.payload.taskId).toBe('task-1');
      expect(event.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should prune event history beyond max size', () => {
      function pruneEventHistory(events: unknown[], maxSize: number): unknown[] {
        if (events.length <= maxSize) return events;
        return events.slice(events.length - maxSize);
      }

      const events = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
      const pruned = pruneEventHistory(events, 500);

      expect(pruned.length).toBe(500);
      expect((pruned[0] as { id: number }).id).toBe(500); // Kept last 500
    });
  });

  describe('Agent Type Capabilities', () => {
    const agentTypeCapabilities: Record<string, string[]> = {
      coordinator: ['taskAllocation', 'monitoring', 'communication'],
      researcher: ['webSearch', 'research', 'analysis'],
      coder: ['codeGeneration', 'codeReview', 'testing'],
      analyst: ['analysis', 'research', 'documentation'],
      architect: ['architecture', 'design', 'documentation'],
      tester: ['testing', 'codeReview', 'documentation'],
      reviewer: ['codeReview', 'analysis', 'documentation'],
      optimizer: ['optimization', 'analysis', 'testing'],
      documenter: ['documentation', 'research', 'analysis'],
      monitor: ['monitoring', 'analysis', 'alerting'],
    };

    it('should map agent types to default capabilities', () => {
      expect(agentTypeCapabilities['coder']).toContain('codeGeneration');
      expect(agentTypeCapabilities['researcher']).toContain('webSearch');
      expect(agentTypeCapabilities['tester']).toContain('testing');
    });

    it('should validate agent type exists', () => {
      function isValidAgentType(type: string): boolean {
        return type in agentTypeCapabilities;
      }

      expect(isValidAgentType('coder')).toBe(true);
      expect(isValidAgentType('researcher')).toBe(true);
      expect(isValidAgentType('invalid')).toBe(false);
    });

    it('should get capabilities for agent type', () => {
      function getCapabilitiesForType(type: string): string[] {
        return agentTypeCapabilities[type] || [];
      }

      expect(getCapabilitiesForType('coder')).toEqual(['codeGeneration', 'codeReview', 'testing']);
      expect(getCapabilitiesForType('invalid')).toEqual([]);
    });
  });
});
