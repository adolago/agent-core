/**
 * Verification and Rollback System Tests
 *
 * Comprehensive tests for checkpoint creation, rollback triggers,
 * state snapshots, recovery procedures, and truth scoring.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as crypto from 'crypto';

// Set test mode
process.env.TIARA_TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

describe('Verification and Rollback System', () => {
  describe('Checkpoint Management', () => {
    interface SystemSnapshot {
      id: string;
      timestamp: number;
      version: string;
      metadata: {
        description?: string;
        tags: string[];
        triggeredBy: string;
        severity?: string;
      };
      state: {
        config: Record<string, unknown>;
        memory: Record<string, unknown>;
        processes: Array<{ pid: number; name: string }>;
        files: Array<{ path: string; checksum: string }>;
        git: { branch: string; commit: string };
      };
      integrity: {
        checksum: string;
        compressed: boolean;
        size: number;
      };
    }

    it('should create snapshot with integrity checksum', () => {
      function createSnapshot(
        state: SystemSnapshot['state'],
        metadata: Partial<SystemSnapshot['metadata']> = {}
      ): SystemSnapshot {
        const id = `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const stateJson = JSON.stringify(state);
        const checksum = crypto.createHash('sha256').update(stateJson).digest('hex');

        return {
          id,
          timestamp: Date.now(),
          version: '1.0.0',
          metadata: {
            tags: [],
            triggeredBy: 'manual',
            ...metadata,
          },
          state,
          integrity: {
            checksum,
            compressed: false,
            size: stateJson.length,
          },
        };
      }

      const state: SystemSnapshot['state'] = {
        config: { setting: 'value' },
        memory: { key: 'data' },
        processes: [{ pid: 1234, name: 'agent' }],
        files: [{ path: '/config.json', checksum: 'abc123' }],
        git: { branch: 'main', commit: 'abc123def' },
      };

      const snapshot = createSnapshot(state, { description: 'Test snapshot' });

      expect(snapshot.id).toMatch(/^snapshot-/);
      expect(snapshot.integrity.checksum).toHaveLength(64); // SHA256 hex
      expect(snapshot.metadata.description).toBe('Test snapshot');
    });

    it('should verify snapshot integrity', () => {
      function verifyIntegrity(snapshot: SystemSnapshot): boolean {
        const stateJson = JSON.stringify(snapshot.state);
        const calculatedChecksum = crypto.createHash('sha256').update(stateJson).digest('hex');
        return calculatedChecksum === snapshot.integrity.checksum;
      }

      const state: SystemSnapshot['state'] = {
        config: { test: true },
        memory: {},
        processes: [],
        files: [],
        git: { branch: 'main', commit: '123' },
      };

      const stateJson = JSON.stringify(state);
      const checksum = crypto.createHash('sha256').update(stateJson).digest('hex');

      const validSnapshot: SystemSnapshot = {
        id: 'test-1',
        timestamp: Date.now(),
        version: '1.0.0',
        metadata: { tags: [], triggeredBy: 'test' },
        state,
        integrity: { checksum, compressed: false, size: stateJson.length },
      };

      expect(verifyIntegrity(validSnapshot)).toBe(true);

      // Tampered snapshot
      const tamperedSnapshot = {
        ...validSnapshot,
        state: { ...state, config: { test: false } },
      };
      expect(verifyIntegrity(tamperedSnapshot)).toBe(false);
    });

    it('should limit snapshot retention', () => {
      function pruneSnapshots(
        snapshots: SystemSnapshot[],
        maxRetention: number
      ): SystemSnapshot[] {
        if (snapshots.length <= maxRetention) return snapshots;

        // Sort by timestamp descending, keep newest
        const sorted = [...snapshots].sort((a, b) => b.timestamp - a.timestamp);
        return sorted.slice(0, maxRetention);
      }

      const snapshots: SystemSnapshot[] = Array.from({ length: 150 }, (_, i) => ({
        id: `snapshot-${i}`,
        timestamp: Date.now() - (150 - i) * 1000,
        version: '1.0.0',
        metadata: { tags: [], triggeredBy: 'test' },
        state: { config: {}, memory: {}, processes: [], files: [], git: { branch: 'main', commit: '' } },
        integrity: { checksum: '', compressed: false, size: 0 },
      }));

      const pruned = pruneSnapshots(snapshots, 100);
      expect(pruned.length).toBe(100);
      // Should keep newest
      expect(pruned[0].id).toBe('snapshot-149');
    });
  });

  describe('Rollback Triggers', () => {
    interface MetricThresholds {
      errorRate: number;
      memoryUsage: number;
      cpuUsage: number;
      responseTime: number;
      diskSpace: number;
      consecutiveFailures: number;
    }

    interface CurrentMetrics {
      errorRate: number;
      memoryUsage: number;
      cpuUsage: number;
      responseTime: number;
      diskSpace: number;
      consecutiveFailures: number;
    }

    const defaultThresholds: MetricThresholds = {
      errorRate: 10, // errors/minute
      memoryUsage: 0.9, // 90%
      cpuUsage: 0.95, // 95%
      responseTime: 5000, // 5 seconds
      diskSpace: 0.1, // 10% free minimum
      consecutiveFailures: 3,
    };

    it('should detect threshold violations', () => {
      function checkThresholds(
        metrics: CurrentMetrics,
        thresholds: MetricThresholds
      ): string[] {
        const violations: string[] = [];

        if (metrics.errorRate > thresholds.errorRate) {
          violations.push('errorRate');
        }
        if (metrics.memoryUsage > thresholds.memoryUsage) {
          violations.push('memoryUsage');
        }
        if (metrics.cpuUsage > thresholds.cpuUsage) {
          violations.push('cpuUsage');
        }
        if (metrics.responseTime > thresholds.responseTime) {
          violations.push('responseTime');
        }
        if (metrics.diskSpace < thresholds.diskSpace) {
          violations.push('diskSpace');
        }
        if (metrics.consecutiveFailures >= thresholds.consecutiveFailures) {
          violations.push('consecutiveFailures');
        }

        return violations;
      }

      const healthyMetrics: CurrentMetrics = {
        errorRate: 2,
        memoryUsage: 0.6,
        cpuUsage: 0.5,
        responseTime: 1000,
        diskSpace: 0.3,
        consecutiveFailures: 0,
      };
      expect(checkThresholds(healthyMetrics, defaultThresholds)).toHaveLength(0);

      const criticalMetrics: CurrentMetrics = {
        errorRate: 15,
        memoryUsage: 0.95,
        cpuUsage: 0.98,
        responseTime: 10000,
        diskSpace: 0.05,
        consecutiveFailures: 5,
      };
      const violations = checkThresholds(criticalMetrics, defaultThresholds);
      expect(violations).toContain('errorRate');
      expect(violations).toContain('memoryUsage');
      expect(violations).toContain('cpuUsage');
      expect(violations).toContain('responseTime');
      expect(violations).toContain('diskSpace');
      expect(violations).toContain('consecutiveFailures');
    });

    it('should enforce grace period before triggering', () => {
      interface ViolationRecord {
        metric: string;
        firstViolation: number;
        count: number;
      }

      function shouldTrigger(
        violations: ViolationRecord[],
        gracePeriodMs: number,
        minViolations: number = 2,
        now: number = Date.now()
      ): boolean {
        return violations.some(v => {
          const inGracePeriod = (now - v.firstViolation) <= gracePeriodMs;
          return inGracePeriod && v.count >= minViolations;
        });
      }

      const now = Date.now();

      // Single violation - should not trigger
      expect(shouldTrigger([
        { metric: 'errorRate', firstViolation: now - 1000, count: 1 }
      ], 60000, 2, now)).toBe(false);

      // Multiple violations within grace period - should trigger
      expect(shouldTrigger([
        { metric: 'errorRate', firstViolation: now - 30000, count: 3 }
      ], 60000, 2, now)).toBe(true);

      // Multiple violations outside grace period - should not trigger
      expect(shouldTrigger([
        { metric: 'errorRate', firstViolation: now - 120000, count: 3 }
      ], 60000, 2, now)).toBe(false);
    });

    it('should enforce cooldown between rollbacks', () => {
      function canRollback(
        lastRollbackTime: number | null,
        cooldownMs: number,
        now: number = Date.now()
      ): boolean {
        if (lastRollbackTime === null) return true;
        return (now - lastRollbackTime) >= cooldownMs;
      }

      const now = Date.now();
      const cooldown = 300000; // 5 minutes

      expect(canRollback(null, cooldown, now)).toBe(true);
      expect(canRollback(now - 60000, cooldown, now)).toBe(false); // 1 minute ago
      expect(canRollback(now - 400000, cooldown, now)).toBe(true); // 6.67 minutes ago
    });
  });

  describe('Recovery Strategies', () => {
    type RecoveryStrategy = 'service-restart' | 'memory-cleanup' | 'config-reset' | 'full-rollback';

    interface RecoveryConfig {
      strategy: RecoveryStrategy;
      priority: number;
      maxRetries: number;
      timeoutMs: number;
      conditions: string[];
    }

    const strategies: RecoveryConfig[] = [
      { strategy: 'service-restart', priority: 1, maxRetries: 2, timeoutMs: 30000, conditions: ['degraded'] },
      { strategy: 'memory-cleanup', priority: 2, maxRetries: 1, timeoutMs: 10000, conditions: ['high-memory'] },
      { strategy: 'config-reset', priority: 3, maxRetries: 1, timeoutMs: 15000, conditions: ['config-error'] },
      { strategy: 'full-rollback', priority: 10, maxRetries: 1, timeoutMs: 60000, conditions: ['critical'] },
    ];

    it('should select appropriate recovery strategy', () => {
      function selectStrategy(
        conditions: string[],
        available: RecoveryConfig[]
      ): RecoveryConfig | null {
        // Find strategies matching any condition, sorted by priority
        const matching = available
          .filter(s => s.conditions.some(c => conditions.includes(c)))
          .sort((a, b) => a.priority - b.priority);

        return matching[0] || null;
      }

      expect(selectStrategy(['degraded'], strategies)?.strategy).toBe('service-restart');
      expect(selectStrategy(['high-memory'], strategies)?.strategy).toBe('memory-cleanup');
      expect(selectStrategy(['critical'], strategies)?.strategy).toBe('full-rollback');
      expect(selectStrategy(['unknown'], strategies)).toBeNull();

      // Multiple conditions - lowest priority wins
      expect(selectStrategy(['degraded', 'critical'], strategies)?.strategy).toBe('service-restart');
    });

    it('should track recovery attempts', () => {
      interface RecoveryAttempt {
        strategy: RecoveryStrategy;
        startTime: number;
        endTime?: number;
        success: boolean;
        error?: string;
      }

      function recordAttempt(
        attempts: RecoveryAttempt[],
        strategy: RecoveryStrategy,
        success: boolean,
        error?: string
      ): RecoveryAttempt {
        const attempt: RecoveryAttempt = {
          strategy,
          startTime: Date.now() - 1000,
          endTime: Date.now(),
          success,
          error,
        };
        attempts.push(attempt);
        return attempt;
      }

      const attempts: RecoveryAttempt[] = [];

      recordAttempt(attempts, 'service-restart', false, 'Timeout');
      recordAttempt(attempts, 'memory-cleanup', true);
      recordAttempt(attempts, 'service-restart', true);

      expect(attempts).toHaveLength(3);
      expect(attempts.filter(a => a.success)).toHaveLength(2);
      expect(attempts[0].error).toBe('Timeout');
    });

    it('should calculate exponential backoff for retries', () => {
      function calculateBackoff(attemptNumber: number, baseMs: number = 1000): number {
        return Math.min(baseMs * Math.pow(2, attemptNumber), 60000);
      }

      expect(calculateBackoff(0)).toBe(1000);
      expect(calculateBackoff(1)).toBe(2000);
      expect(calculateBackoff(2)).toBe(4000);
      expect(calculateBackoff(6)).toBe(60000); // Capped at 60s
      expect(calculateBackoff(10)).toBe(60000); // Still capped
    });
  });

  describe('Truth Scoring', () => {
    interface TruthScore {
      overall: number;
      components: {
        accuracy: number;
        reliability: number;
        consistency: number;
        efficiency: number;
        adaptability: number;
      };
    }

    it('should calculate truth score from components', () => {
      function calculateTruthScore(components: TruthScore['components']): number {
        const weights = {
          accuracy: 0.3,
          reliability: 0.25,
          consistency: 0.2,
          efficiency: 0.15,
          adaptability: 0.1,
        };

        return (
          components.accuracy * weights.accuracy +
          components.reliability * weights.reliability +
          components.consistency * weights.consistency +
          components.efficiency * weights.efficiency +
          components.adaptability * weights.adaptability
        );
      }

      const highScore: TruthScore['components'] = {
        accuracy: 0.95,
        reliability: 0.98,
        consistency: 0.9,
        efficiency: 0.85,
        adaptability: 0.8,
      };
      // 0.95*0.3 + 0.98*0.25 + 0.9*0.2 + 0.85*0.15 + 0.8*0.1 = 0.9175
      expect(calculateTruthScore(highScore)).toBeCloseTo(0.9175, 3);

      const lowScore: TruthScore['components'] = {
        accuracy: 0.5,
        reliability: 0.4,
        consistency: 0.6,
        efficiency: 0.5,
        adaptability: 0.5,
      };
      expect(calculateTruthScore(lowScore)).toBeCloseTo(0.495, 3);
    });

    it('should validate against minimum thresholds', () => {
      const thresholds = {
        accuracy: 0.95,
        reliability: 0.98,
        humanIntervention: 0.1,
        criticalErrors: 0.01,
      };

      function meetsThresholds(
        score: TruthScore['components'],
        humanInterventionRate: number,
        criticalErrorRate: number
      ): { passes: boolean; failures: string[] } {
        const failures: string[] = [];

        if (score.accuracy < thresholds.accuracy) {
          failures.push(`accuracy: ${score.accuracy} < ${thresholds.accuracy}`);
        }
        if (score.reliability < thresholds.reliability) {
          failures.push(`reliability: ${score.reliability} < ${thresholds.reliability}`);
        }
        if (humanInterventionRate > thresholds.humanIntervention) {
          failures.push(`humanIntervention: ${humanInterventionRate} > ${thresholds.humanIntervention}`);
        }
        if (criticalErrorRate > thresholds.criticalErrors) {
          failures.push(`criticalErrors: ${criticalErrorRate} > ${thresholds.criticalErrors}`);
        }

        return { passes: failures.length === 0, failures };
      }

      const good = meetsThresholds(
        { accuracy: 0.96, reliability: 0.99, consistency: 0.9, efficiency: 0.9, adaptability: 0.8 },
        0.05,
        0.005
      );
      expect(good.passes).toBe(true);

      const bad = meetsThresholds(
        { accuracy: 0.90, reliability: 0.95, consistency: 0.9, efficiency: 0.9, adaptability: 0.8 },
        0.15,
        0.02
      );
      expect(bad.passes).toBe(false);
      expect(bad.failures).toHaveLength(4);
    });
  });

  describe('Git Rollback', () => {
    interface GitState {
      branch: string;
      commit: string;
      isDirty: boolean;
      stagedFiles: string[];
      modifiedFiles: string[];
    }

    it('should determine rollback type', () => {
      type RollbackType = 'hard' | 'soft' | 'mixed';

      function determineRollbackType(
        preserveChanges: boolean,
        hasStaged: boolean
      ): RollbackType {
        if (!preserveChanges) return 'hard';
        if (hasStaged) return 'soft';
        return 'mixed';
      }

      expect(determineRollbackType(false, false)).toBe('hard');
      expect(determineRollbackType(true, true)).toBe('soft');
      expect(determineRollbackType(true, false)).toBe('mixed');
    });

    it('should generate rollback commands', () => {
      function generateRollbackCommands(
        targetCommit: string,
        rollbackType: 'hard' | 'soft' | 'mixed',
        stashFirst: boolean = true
      ): string[] {
        const commands: string[] = [];

        if (stashFirst) {
          commands.push('git stash push -m "Pre-rollback stash"');
        }

        switch (rollbackType) {
          case 'hard':
            commands.push(`git reset --hard ${targetCommit}`);
            break;
          case 'soft':
            commands.push(`git reset --soft ${targetCommit}`);
            break;
          case 'mixed':
            commands.push(`git reset --mixed ${targetCommit}`);
            break;
        }

        return commands;
      }

      const hardCommands = generateRollbackCommands('abc123', 'hard');
      expect(hardCommands).toContain('git stash push -m "Pre-rollback stash"');
      expect(hardCommands).toContain('git reset --hard abc123');

      const softNoStash = generateRollbackCommands('abc123', 'soft', false);
      expect(softNoStash).not.toContain('git stash push -m "Pre-rollback stash"');
      expect(softNoStash).toContain('git reset --soft abc123');
    });

    it('should validate commit hash format', () => {
      function isValidCommitHash(hash: string): boolean {
        // Full SHA-1 (40 chars) or abbreviated (7+ chars)
        return /^[a-f0-9]{7,40}$/i.test(hash);
      }

      expect(isValidCommitHash('abc123def456789012345678901234567890abcd')).toBe(true);
      expect(isValidCommitHash('abc123d')).toBe(true);
      expect(isValidCommitHash('abc12')).toBe(false); // Too short
      expect(isValidCommitHash('xyz123g')).toBe(false); // Invalid chars
    });
  });

  describe('Audit Trail', () => {
    interface AuditEntry {
      id: string;
      timestamp: number;
      action: string;
      actor: string;
      details: Record<string, unknown>;
      signature?: string;
    }

    it('should create signed audit entries', () => {
      function createAuditEntry(
        action: string,
        actor: string,
        details: Record<string, unknown>,
        secretKey: string
      ): AuditEntry {
        const id = `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = Date.now();

        const payload = JSON.stringify({ id, timestamp, action, actor, details });
        const signature = crypto.createHmac('sha256', secretKey).update(payload).digest('hex');

        return { id, timestamp, action, actor, details, signature };
      }

      const entry = createAuditEntry(
        'rollback.executed',
        'system',
        { snapshotId: 'snap-1', reason: 'critical_error' },
        'secret-key'
      );

      expect(entry.id).toMatch(/^audit-/);
      expect(entry.signature).toHaveLength(64);
      expect(entry.action).toBe('rollback.executed');
    });

    it('should verify audit entry signature', () => {
      function verifyAuditEntry(entry: AuditEntry, secretKey: string): boolean {
        if (!entry.signature) return false;

        const { signature, ...rest } = entry;
        const payload = JSON.stringify({
          id: rest.id,
          timestamp: rest.timestamp,
          action: rest.action,
          actor: rest.actor,
          details: rest.details,
        });

        const expectedSignature = crypto.createHmac('sha256', secretKey).update(payload).digest('hex');
        return signature === expectedSignature;
      }

      const secretKey = 'test-secret';
      const id = 'audit-123';
      const timestamp = Date.now();
      const action = 'test.action';
      const actor = 'tester';
      const details = { key: 'value' };

      const payload = JSON.stringify({ id, timestamp, action, actor, details });
      const signature = crypto.createHmac('sha256', secretKey).update(payload).digest('hex');

      const validEntry: AuditEntry = { id, timestamp, action, actor, details, signature };
      expect(verifyAuditEntry(validEntry, secretKey)).toBe(true);

      const tamperedEntry: AuditEntry = { ...validEntry, action: 'tampered' };
      expect(verifyAuditEntry(tamperedEntry, secretKey)).toBe(false);
    });
  });

  describe('State Restoration', () => {
    interface FileSnapshot {
      path: string;
      content: string;
      checksum: string;
      mode: number;
      mtime: number;
    }

    it('should verify file restoration', () => {
      function verifyFileRestoration(
        original: FileSnapshot,
        restored: { content: string; checksum: string }
      ): boolean {
        return original.checksum === restored.checksum;
      }

      const original: FileSnapshot = {
        path: '/config.json',
        content: '{"test": true}',
        checksum: crypto.createHash('md5').update('{"test": true}').digest('hex'),
        mode: 0o644,
        mtime: Date.now(),
      };

      const goodRestoration = {
        content: '{"test": true}',
        checksum: crypto.createHash('md5').update('{"test": true}').digest('hex'),
      };
      expect(verifyFileRestoration(original, goodRestoration)).toBe(true);

      const badRestoration = {
        content: '{"test": false}',
        checksum: crypto.createHash('md5').update('{"test": false}').digest('hex'),
      };
      expect(verifyFileRestoration(original, badRestoration)).toBe(false);
    });

    it('should order restoration steps correctly', () => {
      type RestorationStep = 'config' | 'memory' | 'filesystem' | 'git';

      function getRestorationOrder(graceful: boolean): RestorationStep[] {
        if (graceful) {
          // Sequential with delays
          return ['config', 'memory', 'filesystem', 'git'];
        } else {
          // Parallel for speed (same order but executed differently)
          return ['config', 'memory', 'filesystem', 'git'];
        }
      }

      const gracefulOrder = getRestorationOrder(true);
      expect(gracefulOrder[0]).toBe('config');
      expect(gracefulOrder[gracefulOrder.length - 1]).toBe('git');

      const immediateOrder = getRestorationOrder(false);
      expect(immediateOrder).toEqual(gracefulOrder);
    });

    it('should handle partial restoration failure', () => {
      interface RestorationResult {
        step: string;
        success: boolean;
        error?: string;
      }

      function analyzeRestorationResults(
        results: RestorationResult[]
      ): { overallSuccess: boolean; failedSteps: string[]; canContinue: boolean } {
        const failedSteps = results.filter(r => !r.success).map(r => r.step);
        const criticalSteps = ['config', 'git'];
        const criticalFailures = failedSteps.filter(s => criticalSteps.includes(s));

        return {
          overallSuccess: failedSteps.length === 0,
          failedSteps,
          canContinue: criticalFailures.length === 0,
        };
      }

      const allSuccess: RestorationResult[] = [
        { step: 'config', success: true },
        { step: 'memory', success: true },
        { step: 'filesystem', success: true },
        { step: 'git', success: true },
      ];
      expect(analyzeRestorationResults(allSuccess).overallSuccess).toBe(true);

      const nonCriticalFailure: RestorationResult[] = [
        { step: 'config', success: true },
        { step: 'memory', success: false, error: 'Cache error' },
        { step: 'filesystem', success: true },
        { step: 'git', success: true },
      ];
      const ncResult = analyzeRestorationResults(nonCriticalFailure);
      expect(ncResult.overallSuccess).toBe(false);
      expect(ncResult.canContinue).toBe(true);

      const criticalFailure: RestorationResult[] = [
        { step: 'config', success: false, error: 'Permission denied' },
        { step: 'memory', success: true },
        { step: 'filesystem', success: true },
        { step: 'git', success: true },
      ];
      expect(analyzeRestorationResults(criticalFailure).canContinue).toBe(false);
    });
  });

  describe('Byzantine Fault Detection', () => {
    interface AgentMessage {
      agentId: string;
      timestamp: number;
      content: string;
      signature: string;
    }

    it('should detect contradictory messages', () => {
      function detectContradiction(
        messages: AgentMessage[],
        agentId: string
      ): boolean {
        const agentMessages = messages.filter(m => m.agentId === agentId);
        if (agentMessages.length < 2) return false;

        // Check for same content with different claims (simplified)
        const contentSet = new Set(agentMessages.map(m => m.content));
        // If agent sends many different messages rapidly, might be contradicting
        return contentSet.size > agentMessages.length * 0.8;
      }

      const normalMessages: AgentMessage[] = [
        { agentId: 'a1', timestamp: 1, content: 'status: ok', signature: 's1' },
        { agentId: 'a1', timestamp: 2, content: 'status: ok', signature: 's2' },
        { agentId: 'a1', timestamp: 3, content: 'status: ok', signature: 's3' },
      ];
      expect(detectContradiction(normalMessages, 'a1')).toBe(false);

      const suspiciousMessages: AgentMessage[] = [
        { agentId: 'a1', timestamp: 1, content: 'status: ok', signature: 's1' },
        { agentId: 'a1', timestamp: 2, content: 'status: error', signature: 's2' },
        { agentId: 'a1', timestamp: 3, content: 'status: critical', signature: 's3' },
        { agentId: 'a1', timestamp: 4, content: 'status: degraded', signature: 's4' },
        { agentId: 'a1', timestamp: 5, content: 'status: offline', signature: 's5' },
      ];
      expect(detectContradiction(suspiciousMessages, 'a1')).toBe(true);
    });

    it('should detect timing attack patterns', () => {
      function detectTimingAttack(
        timestamps: number[],
        regularityThreshold: number = 0.95
      ): boolean {
        if (timestamps.length < 5) return false;

        const intervals: number[] = [];
        for (let i = 1; i < timestamps.length; i++) {
          intervals.push(timestamps[i] - timestamps[i - 1]);
        }

        // Check if intervals are suspiciously regular
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const variance = intervals.reduce((a, b) => a + Math.pow(b - avgInterval, 2), 0) / intervals.length;
        const stdDev = Math.sqrt(variance);
        const coefficientOfVariation = stdDev / avgInterval;

        // Very low variation = suspiciously regular
        return coefficientOfVariation < (1 - regularityThreshold);
      }

      // Natural timestamps (some variation)
      const natural = [1000, 2100, 3050, 4200, 5100, 6300];
      expect(detectTimingAttack(natural)).toBe(false);

      // Suspiciously regular (exactly 1000ms apart)
      const regular = [1000, 2000, 3000, 4000, 5000, 6000];
      expect(detectTimingAttack(regular)).toBe(true);
    });

    it('should detect message spamming', () => {
      function detectSpamming(
        messages: AgentMessage[],
        agentId: string,
        windowMs: number = 60000,
        threshold: number = 50
      ): boolean {
        const now = Date.now();
        const recentMessages = messages.filter(
          m => m.agentId === agentId && (now - m.timestamp) <= windowMs
        );
        return recentMessages.length > threshold;
      }

      const now = Date.now();
      const normalActivity: AgentMessage[] = Array.from({ length: 30 }, (_, i) => ({
        agentId: 'a1',
        timestamp: now - i * 2000,
        content: 'msg',
        signature: 's',
      }));
      expect(detectSpamming(normalActivity, 'a1')).toBe(false);

      const spamActivity: AgentMessage[] = Array.from({ length: 100 }, (_, i) => ({
        agentId: 'a1',
        timestamp: now - i * 500,
        content: 'spam',
        signature: 's',
      }));
      expect(detectSpamming(spamActivity, 'a1')).toBe(true);
    });
  });
});
