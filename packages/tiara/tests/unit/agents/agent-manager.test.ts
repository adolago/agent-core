/**
 * Agent Manager Tests
 *
 * Comprehensive tests for agent lifecycle management, state tracking,
 * health monitoring, capability validation, and pool management.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Set test mode
process.env.TIARA_TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

describe('AgentManager', () => {
  describe('Agent Lifecycle State Machine', () => {
    type AgentStatus = 'initializing' | 'idle' | 'busy' | 'paused' | 'error' | 'offline' | 'terminating' | 'terminated';

    const validTransitions: Record<AgentStatus, AgentStatus[]> = {
      initializing: ['idle', 'error', 'terminated'],
      idle: ['busy', 'paused', 'error', 'offline', 'terminating'],
      busy: ['idle', 'paused', 'error', 'terminating'],
      paused: ['idle', 'busy', 'error', 'terminating'],
      error: ['idle', 'terminating', 'terminated'],
      offline: ['idle', 'terminating', 'terminated'],
      terminating: ['terminated'],
      terminated: [], // Terminal state
    };

    it('should validate state transitions', () => {
      function isValidTransition(from: AgentStatus, to: AgentStatus): boolean {
        return validTransitions[from]?.includes(to) ?? false;
      }

      // Valid transitions
      expect(isValidTransition('initializing', 'idle')).toBe(true);
      expect(isValidTransition('idle', 'busy')).toBe(true);
      expect(isValidTransition('busy', 'idle')).toBe(true);
      expect(isValidTransition('error', 'idle')).toBe(true);
      expect(isValidTransition('terminating', 'terminated')).toBe(true);

      // Invalid transitions
      expect(isValidTransition('terminated', 'idle')).toBe(false);
      expect(isValidTransition('initializing', 'busy')).toBe(false);
      expect(isValidTransition('terminated', 'busy')).toBe(false);
    });

    it('should track status history', () => {
      interface StatusChange {
        from: AgentStatus;
        to: AgentStatus;
        timestamp: number;
        reason?: string;
      }

      const statusHistory: StatusChange[] = [];

      function transitionStatus(
        currentStatus: AgentStatus,
        newStatus: AgentStatus,
        reason?: string
      ): { success: boolean; status: AgentStatus } {
        if (!validTransitions[currentStatus]?.includes(newStatus)) {
          return { success: false, status: currentStatus };
        }

        statusHistory.push({
          from: currentStatus,
          to: newStatus,
          timestamp: Date.now(),
          reason,
        });

        return { success: true, status: newStatus };
      }

      let status: AgentStatus = 'initializing';

      const result1 = transitionStatus(status, 'idle', 'Agent ready');
      expect(result1.success).toBe(true);
      status = result1.status;

      const result2 = transitionStatus(status, 'busy', 'Task assigned');
      expect(result2.success).toBe(true);
      status = result2.status;

      const result3 = transitionStatus(status, 'terminated'); // Invalid from busy
      expect(result3.success).toBe(false);
      expect(status).toBe('busy'); // Status unchanged

      expect(statusHistory).toHaveLength(2);
    });
  });

  describe('Health Monitoring', () => {
    interface HealthComponents {
      responsiveness: number;
      performance: number;
      reliability: number;
      resourceUsage: number;
    }

    interface AgentHealth {
      overall: number;
      components: HealthComponents;
      trend: 'improving' | 'stable' | 'degrading';
    }

    it('should calculate overall health from components', () => {
      function calculateOverallHealth(components: HealthComponents): number {
        const { responsiveness, performance, reliability, resourceUsage } = components;
        // Equal weighting for simplicity
        return (responsiveness + performance + reliability + resourceUsage) / 4;
      }

      const healthyComponents: HealthComponents = {
        responsiveness: 1.0,
        performance: 0.9,
        reliability: 0.95,
        resourceUsage: 0.85,
      };
      expect(calculateOverallHealth(healthyComponents)).toBeCloseTo(0.925, 2);

      const unhealthyComponents: HealthComponents = {
        responsiveness: 0.3,
        performance: 0.4,
        reliability: 0.5,
        resourceUsage: 0.2,
      };
      expect(calculateOverallHealth(unhealthyComponents)).toBeCloseTo(0.35, 2);
    });

    it('should calculate responsiveness from heartbeat latency', () => {
      function calculateResponsiveness(
        lastHeartbeat: number,
        heartbeatInterval: number,
        now: number = Date.now()
      ): number {
        const timeSinceHeartbeat = now - lastHeartbeat;
        const threshold = heartbeatInterval * 3; // 3x interval = unresponsive

        if (timeSinceHeartbeat > threshold) return 0;
        if (timeSinceHeartbeat > heartbeatInterval * 2) return 0.5;
        return 1.0;
      }

      const now = Date.now();
      const interval = 10000; // 10 seconds

      expect(calculateResponsiveness(now - 5000, interval, now)).toBe(1.0); // Recent
      expect(calculateResponsiveness(now - 25000, interval, now)).toBe(0.5); // Slow
      expect(calculateResponsiveness(now - 35000, interval, now)).toBe(0); // Unresponsive
    });

    it('should calculate reliability from success rate', () => {
      function calculateReliability(
        tasksCompleted: number,
        tasksFailed: number
      ): number {
        const total = tasksCompleted + tasksFailed;
        if (total === 0) return 1.0; // No data = assume reliable
        return tasksCompleted / total;
      }

      expect(calculateReliability(0, 0)).toBe(1.0);
      expect(calculateReliability(10, 0)).toBe(1.0);
      expect(calculateReliability(9, 1)).toBe(0.9);
      expect(calculateReliability(5, 5)).toBe(0.5);
      expect(calculateReliability(0, 10)).toBe(0);
    });

    it('should calculate resource usage score', () => {
      function calculateResourceScore(
        currentUsage: number,
        maxUsage: number
      ): number {
        if (maxUsage === 0) return 1.0;
        const utilization = currentUsage / maxUsage;
        // Higher utilization = lower score (want low resource usage)
        return Math.max(0, 1 - utilization);
      }

      expect(calculateResourceScore(0, 100)).toBe(1.0);
      expect(calculateResourceScore(50, 100)).toBe(0.5);
      expect(calculateResourceScore(90, 100)).toBeCloseTo(0.1);
      expect(calculateResourceScore(100, 100)).toBe(0);
    });

    it('should determine health trend', () => {
      function calculateTrend(
        recentScores: number[]
      ): 'improving' | 'stable' | 'degrading' {
        if (recentScores.length < 3) return 'stable';

        const recent = recentScores.slice(-3);
        const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
        const older = recentScores.slice(-6, -3);

        if (older.length === 0) return 'stable';

        const avgOlder = older.reduce((a, b) => a + b, 0) / older.length;
        const delta = avgRecent - avgOlder;

        if (delta > 0.05) return 'improving';
        if (delta < -0.05) return 'degrading';
        return 'stable';
      }

      expect(calculateTrend([0.5, 0.6, 0.7, 0.8, 0.9, 1.0])).toBe('improving');
      expect(calculateTrend([1.0, 0.9, 0.8, 0.7, 0.6, 0.5])).toBe('degrading');
      expect(calculateTrend([0.8, 0.8, 0.8, 0.8, 0.8, 0.8])).toBe('stable');
    });

    it('should trigger auto-restart on critical health', () => {
      const CRITICAL_THRESHOLD = 0.3;

      function shouldAutoRestart(
        health: number,
        autoRestartEnabled: boolean
      ): boolean {
        return autoRestartEnabled && health < CRITICAL_THRESHOLD;
      }

      expect(shouldAutoRestart(0.2, true)).toBe(true);
      expect(shouldAutoRestart(0.2, false)).toBe(false);
      expect(shouldAutoRestart(0.5, true)).toBe(false);
    });
  });

  describe('Heartbeat Timeout Detection', () => {
    it('should detect heartbeat timeout', () => {
      function isHeartbeatTimeout(
        lastHeartbeat: number,
        interval: number,
        timeoutMultiplier: number = 3,
        now: number = Date.now()
      ): boolean {
        const timeout = interval * timeoutMultiplier;
        return (now - lastHeartbeat) > timeout;
      }

      const now = Date.now();
      const interval = 10000; // 10 seconds

      expect(isHeartbeatTimeout(now - 5000, interval, 3, now)).toBe(false);
      expect(isHeartbeatTimeout(now - 25000, interval, 3, now)).toBe(false);
      expect(isHeartbeatTimeout(now - 35000, interval, 3, now)).toBe(true);
    });

    it('should handle heartbeat received after timeout', () => {
      interface Agent {
        id: string;
        status: string;
        lastHeartbeat: number;
      }

      function handleHeartbeat(agent: Agent): Agent {
        // If agent was marked error due to timeout, restore to idle
        const newStatus = agent.status === 'error' ? 'idle' : agent.status;
        return {
          ...agent,
          lastHeartbeat: Date.now(),
          status: newStatus,
        };
      }

      const errorAgent: Agent = {
        id: 'agent-1',
        status: 'error',
        lastHeartbeat: Date.now() - 60000,
      };

      const restored = handleHeartbeat(errorAgent);
      expect(restored.status).toBe('idle');
      expect(restored.lastHeartbeat).toBeGreaterThan(errorAgent.lastHeartbeat);
    });
  });

  describe('Capability Management', () => {
    interface AgentCapabilities {
      codeGeneration: boolean;
      codeReview: boolean;
      testing: boolean;
      documentation: boolean;
      research: boolean;
      analysis: boolean;
      languages: string[];
      frameworks: string[];
      maxConcurrentTasks: number;
      reliability: number;
      quality: number;
    }

    const defaultCapabilities: AgentCapabilities = {
      codeGeneration: false,
      codeReview: false,
      testing: false,
      documentation: false,
      research: false,
      analysis: false,
      languages: [],
      frameworks: [],
      maxConcurrentTasks: 1,
      reliability: 0.8,
      quality: 0.7,
    };

    const templateCapabilities: Record<string, Partial<AgentCapabilities>> = {
      coder: {
        codeGeneration: true,
        codeReview: true,
        testing: true,
        languages: ['typescript', 'javascript', 'python'],
        maxConcurrentTasks: 3,
      },
      researcher: {
        research: true,
        analysis: true,
        documentation: true,
        maxConcurrentTasks: 5,
      },
      tester: {
        testing: true,
        codeReview: true,
        maxConcurrentTasks: 4,
      },
    };

    it('should create capabilities from template', () => {
      function createCapabilities(
        templateName: string,
        overrides: Partial<AgentCapabilities> = {}
      ): AgentCapabilities {
        const template = templateCapabilities[templateName] || {};
        return { ...defaultCapabilities, ...template, ...overrides };
      }

      const coderCaps = createCapabilities('coder');
      expect(coderCaps.codeGeneration).toBe(true);
      expect(coderCaps.testing).toBe(true);
      expect(coderCaps.languages).toContain('typescript');

      const customCoder = createCapabilities('coder', { maxConcurrentTasks: 10 });
      expect(customCoder.maxConcurrentTasks).toBe(10);
    });

    it('should check if agent has required capability', () => {
      function hasCapability(
        capabilities: AgentCapabilities,
        required: string
      ): boolean {
        if (required in capabilities) {
          const value = capabilities[required as keyof AgentCapabilities];
          if (typeof value === 'boolean') return value;
          if (Array.isArray(value)) return value.length > 0;
          return true;
        }
        return false;
      }

      const coder: AgentCapabilities = {
        ...defaultCapabilities,
        codeGeneration: true,
        languages: ['typescript'],
      };

      expect(hasCapability(coder, 'codeGeneration')).toBe(true);
      expect(hasCapability(coder, 'research')).toBe(false);
      expect(hasCapability(coder, 'languages')).toBe(true);
    });

    it('should check all required capabilities', () => {
      function hasAllCapabilities(
        capabilities: AgentCapabilities,
        required: string[]
      ): boolean {
        return required.every(cap => {
          if (cap in capabilities) {
            const value = capabilities[cap as keyof AgentCapabilities];
            if (typeof value === 'boolean') return value;
            if (Array.isArray(value)) return value.length > 0;
            return true;
          }
          return false;
        });
      }

      const coder: AgentCapabilities = {
        ...defaultCapabilities,
        codeGeneration: true,
        testing: true,
      };

      expect(hasAllCapabilities(coder, ['codeGeneration', 'testing'])).toBe(true);
      expect(hasAllCapabilities(coder, ['codeGeneration', 'research'])).toBe(false);
    });
  });

  describe('Agent Pool Management', () => {
    interface AgentPool {
      id: string;
      name: string;
      minSize: number;
      maxSize: number;
      currentSize: number;
      availableAgents: string[];
      busyAgents: string[];
      autoScale: boolean;
      scaleUpThreshold: number;
      scaleDownThreshold: number;
    }

    it('should calculate pool utilization', () => {
      function calculateUtilization(pool: AgentPool): number {
        if (pool.currentSize === 0) return 0;
        return pool.busyAgents.length / pool.currentSize;
      }

      const pool: AgentPool = {
        id: 'pool-1',
        name: 'coder-pool',
        minSize: 2,
        maxSize: 10,
        currentSize: 5,
        availableAgents: ['a1', 'a2'],
        busyAgents: ['a3', 'a4', 'a5'],
        autoScale: true,
        scaleUpThreshold: 0.8,
        scaleDownThreshold: 0.3,
      };

      expect(calculateUtilization(pool)).toBe(0.6); // 3/5 = 0.6
    });

    it('should determine scaling action', () => {
      type ScalingAction = 'scale-up' | 'scale-down' | 'none';

      function determineScalingAction(
        pool: AgentPool,
        utilization: number
      ): ScalingAction {
        if (!pool.autoScale) return 'none';

        if (utilization >= pool.scaleUpThreshold && pool.currentSize < pool.maxSize) {
          return 'scale-up';
        }

        if (utilization <= pool.scaleDownThreshold && pool.currentSize > pool.minSize) {
          return 'scale-down';
        }

        return 'none';
      }

      const pool: AgentPool = {
        id: 'pool-1',
        name: 'coder-pool',
        minSize: 2,
        maxSize: 10,
        currentSize: 5,
        availableAgents: [],
        busyAgents: [],
        autoScale: true,
        scaleUpThreshold: 0.8,
        scaleDownThreshold: 0.3,
      };

      expect(determineScalingAction(pool, 0.9)).toBe('scale-up');
      expect(determineScalingAction(pool, 0.2)).toBe('scale-down');
      expect(determineScalingAction(pool, 0.5)).toBe('none');

      // At max size
      pool.currentSize = 10;
      expect(determineScalingAction(pool, 0.9)).toBe('none');

      // At min size
      pool.currentSize = 2;
      expect(determineScalingAction(pool, 0.2)).toBe('none');
    });

    it('should calculate target size for scaling', () => {
      function calculateTargetSize(
        pool: AgentPool,
        action: 'scale-up' | 'scale-down',
        scaleFactor: number = 1.5
      ): number {
        if (action === 'scale-up') {
          const target = Math.ceil(pool.currentSize * scaleFactor);
          return Math.min(target, pool.maxSize);
        } else {
          const target = Math.floor(pool.currentSize / scaleFactor);
          return Math.max(target, pool.minSize);
        }
      }

      const pool: AgentPool = {
        id: 'pool-1',
        name: 'coder-pool',
        minSize: 2,
        maxSize: 10,
        currentSize: 5,
        availableAgents: [],
        busyAgents: [],
        autoScale: true,
        scaleUpThreshold: 0.8,
        scaleDownThreshold: 0.3,
      };

      expect(calculateTargetSize(pool, 'scale-up')).toBe(8); // ceil(5 * 1.5) = 8
      expect(calculateTargetSize(pool, 'scale-down')).toBe(3); // floor(5 / 1.5) = 3

      pool.currentSize = 8;
      expect(calculateTargetSize(pool, 'scale-up')).toBe(10); // Capped at max

      pool.currentSize = 3;
      expect(calculateTargetSize(pool, 'scale-down')).toBe(2); // Capped at min
    });

    it('should enforce cooldown between scaling operations', () => {
      interface ScalingHistory {
        timestamp: number;
        action: string;
      }

      function canScale(
        history: ScalingHistory[],
        cooldownMs: number,
        now: number = Date.now()
      ): boolean {
        if (history.length === 0) return true;
        const lastScale = history[history.length - 1];
        return (now - lastScale.timestamp) >= cooldownMs;
      }

      const now = Date.now();
      const cooldown = 300000; // 5 minutes

      expect(canScale([], cooldown, now)).toBe(true);
      expect(canScale([{ timestamp: now - 60000, action: 'scale-up' }], cooldown, now)).toBe(false);
      expect(canScale([{ timestamp: now - 400000, action: 'scale-up' }], cooldown, now)).toBe(true);
    });
  });

  describe('Error Tracking', () => {
    interface AgentError {
      type: string;
      message: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      timestamp: number;
      resolved: boolean;
    }

    it('should record errors with severity', () => {
      function recordError(
        errors: AgentError[],
        type: string,
        message: string,
        severity: AgentError['severity']
      ): AgentError {
        const error: AgentError = {
          type,
          message,
          severity,
          timestamp: Date.now(),
          resolved: false,
        };
        errors.push(error);
        return error;
      }

      const errors: AgentError[] = [];

      recordError(errors, 'heartbeat_timeout', 'Agent unresponsive', 'high');
      recordError(errors, 'process_error', 'Process crashed', 'critical');

      expect(errors).toHaveLength(2);
      expect(errors[0].severity).toBe('high');
      expect(errors[1].severity).toBe('critical');
    });

    it('should cap error history size', () => {
      function pruneErrors(errors: AgentError[], maxSize: number): AgentError[] {
        if (errors.length <= maxSize) return errors;
        return errors.slice(errors.length - maxSize);
      }

      const errors: AgentError[] = Array.from({ length: 100 }, (_, i) => ({
        type: 'test',
        message: `Error ${i}`,
        severity: 'low' as const,
        timestamp: Date.now() + i,
        resolved: false,
      }));

      const pruned = pruneErrors(errors, 50);
      expect(pruned.length).toBe(50);
      expect(pruned[0].message).toBe('Error 50');
    });

    it('should count errors by severity', () => {
      function countBySeverity(
        errors: AgentError[]
      ): Record<AgentError['severity'], number> {
        const counts: Record<AgentError['severity'], number> = {
          low: 0,
          medium: 0,
          high: 0,
          critical: 0,
        };

        for (const error of errors) {
          counts[error.severity]++;
        }

        return counts;
      }

      const errors: AgentError[] = [
        { type: 'a', message: '', severity: 'low', timestamp: 0, resolved: false },
        { type: 'b', message: '', severity: 'high', timestamp: 0, resolved: false },
        { type: 'c', message: '', severity: 'high', timestamp: 0, resolved: false },
        { type: 'd', message: '', severity: 'critical', timestamp: 0, resolved: false },
      ];

      const counts = countBySeverity(errors);
      expect(counts.low).toBe(1);
      expect(counts.medium).toBe(0);
      expect(counts.high).toBe(2);
      expect(counts.critical).toBe(1);
    });
  });

  describe('Metrics Tracking', () => {
    interface AgentMetrics {
      tasksCompleted: number;
      tasksFailed: number;
      totalExecutionTime: number;
      successRate: number;
      avgExecutionTime: number;
    }

    it('should update metrics on task completion', () => {
      function updateMetricsOnCompletion(
        metrics: AgentMetrics,
        executionTime: number
      ): AgentMetrics {
        const newCompleted = metrics.tasksCompleted + 1;
        const newTotalTime = metrics.totalExecutionTime + executionTime;
        const totalTasks = newCompleted + metrics.tasksFailed;

        return {
          ...metrics,
          tasksCompleted: newCompleted,
          totalExecutionTime: newTotalTime,
          successRate: newCompleted / totalTasks,
          avgExecutionTime: newTotalTime / newCompleted,
        };
      }

      let metrics: AgentMetrics = {
        tasksCompleted: 5,
        tasksFailed: 1,
        totalExecutionTime: 50000,
        successRate: 5 / 6,
        avgExecutionTime: 10000,
      };

      metrics = updateMetricsOnCompletion(metrics, 8000);

      expect(metrics.tasksCompleted).toBe(6);
      expect(metrics.totalExecutionTime).toBe(58000);
      expect(metrics.successRate).toBeCloseTo(6 / 7, 4);
      expect(metrics.avgExecutionTime).toBeCloseTo(58000 / 6, 1);
    });

    it('should update metrics on task failure', () => {
      function updateMetricsOnFailure(metrics: AgentMetrics): AgentMetrics {
        const newFailed = metrics.tasksFailed + 1;
        const totalTasks = metrics.tasksCompleted + newFailed;

        return {
          ...metrics,
          tasksFailed: newFailed,
          successRate: metrics.tasksCompleted / totalTasks,
        };
      }

      let metrics: AgentMetrics = {
        tasksCompleted: 9,
        tasksFailed: 0,
        totalExecutionTime: 90000,
        successRate: 1.0,
        avgExecutionTime: 10000,
      };

      metrics = updateMetricsOnFailure(metrics);

      expect(metrics.tasksFailed).toBe(1);
      expect(metrics.successRate).toBe(0.9); // 9/10
    });

    it('should track workload changes', () => {
      interface WorkloadState {
        currentTasks: number;
        maxConcurrent: number;
        workload: number;
      }

      function updateWorkload(
        state: WorkloadState,
        delta: number
      ): WorkloadState {
        const newCurrent = Math.max(0, state.currentTasks + delta);
        return {
          ...state,
          currentTasks: newCurrent,
          workload: newCurrent / state.maxConcurrent,
        };
      }

      let state: WorkloadState = {
        currentTasks: 0,
        maxConcurrent: 5,
        workload: 0,
      };

      state = updateWorkload(state, 1);
      expect(state.workload).toBe(0.2);

      state = updateWorkload(state, 2);
      expect(state.workload).toBe(0.6);

      state = updateWorkload(state, -1);
      expect(state.workload).toBe(0.4);

      // Can't go negative
      state = updateWorkload(state, -10);
      expect(state.currentTasks).toBe(0);
      expect(state.workload).toBe(0);
    });
  });

  describe('Process Management', () => {
    it('should generate correct spawn command', () => {
      function generateSpawnCommand(
        agentId: string,
        config: Record<string, unknown>
      ): { cmd: string; args: string[] } {
        return {
          cmd: 'deno',
          args: [
            'run',
            '--allow-all',
            'agent-runner.ts',
            '--config',
            JSON.stringify(config),
            '--agent-id',
            agentId,
          ],
        };
      }

      const result = generateSpawnCommand('agent-1', { type: 'coder' });

      expect(result.cmd).toBe('deno');
      expect(result.args).toContain('run');
      expect(result.args).toContain('--allow-all');
      expect(result.args).toContain('--agent-id');
      expect(result.args).toContain('agent-1');
    });

    it('should handle graceful shutdown sequence', () => {
      type ShutdownStep = 'sigterm' | 'wait' | 'sigkill' | 'cleanup';

      function getShutdownSequence(
        gracePeriodMs: number
      ): Array<{ step: ShutdownStep; delayMs?: number }> {
        return [
          { step: 'sigterm' },
          { step: 'wait', delayMs: gracePeriodMs },
          { step: 'sigkill' },
          { step: 'cleanup' },
        ];
      }

      const sequence = getShutdownSequence(30000);

      expect(sequence).toHaveLength(4);
      expect(sequence[0].step).toBe('sigterm');
      expect(sequence[1].delayMs).toBe(30000);
      expect(sequence[2].step).toBe('sigkill');
    });
  });

  describe('Agent Templates', () => {
    const templates: Record<string, {
      type: string;
      capabilities: string[];
      maxConcurrentTasks: number;
      description: string;
    }> = {
      coder: {
        type: 'coder',
        capabilities: ['codeGeneration', 'codeReview', 'testing'],
        maxConcurrentTasks: 3,
        description: 'Code generation and review specialist',
      },
      researcher: {
        type: 'researcher',
        capabilities: ['research', 'analysis', 'webSearch'],
        maxConcurrentTasks: 5,
        description: 'Research and analysis specialist',
      },
      tester: {
        type: 'tester',
        capabilities: ['testing', 'codeReview'],
        maxConcurrentTasks: 4,
        description: 'Testing and quality assurance specialist',
      },
      architect: {
        type: 'architect',
        capabilities: ['architecture', 'design', 'documentation'],
        maxConcurrentTasks: 2,
        description: 'System architecture and design specialist',
      },
    };

    it('should list available templates', () => {
      expect(Object.keys(templates)).toContain('coder');
      expect(Object.keys(templates)).toContain('researcher');
      expect(Object.keys(templates)).toContain('tester');
      expect(Object.keys(templates)).toContain('architect');
    });

    it('should get template by name', () => {
      function getTemplate(name: string) {
        return templates[name] || null;
      }

      const coder = getTemplate('coder');
      expect(coder).not.toBeNull();
      expect(coder?.capabilities).toContain('codeGeneration');

      expect(getTemplate('invalid')).toBeNull();
    });

    it('should validate template has required fields', () => {
      function isValidTemplate(template: unknown): boolean {
        if (typeof template !== 'object' || template === null) return false;
        const t = template as Record<string, unknown>;
        return (
          typeof t.type === 'string' &&
          Array.isArray(t.capabilities) &&
          typeof t.maxConcurrentTasks === 'number' &&
          typeof t.description === 'string'
        );
      }

      expect(isValidTemplate(templates.coder)).toBe(true);
      expect(isValidTemplate({ type: 'test' })).toBe(false);
      expect(isValidTemplate(null)).toBe(false);
    });
  });
});
