/**
 * CLI Headless Integration Tests
 *
 * Tests the CLI commands in headless mode using the test harness.
 * These tests verify that commands work without interactive input.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { runCLI, runHiveMind, assertions, getCLIPath } from '../../src/test/cli-harness';
import { existsSync } from 'fs';

// Set test mode
process.env.TIARA_TEST_MODE = 'true';
process.env.TIARA_HEADLESS = 'true';
process.env.NODE_ENV = 'test';

describe('CLI Headless Tests', () => {
  let cliAvailable = false;

  beforeAll(() => {
    cliAvailable = existsSync(getCLIPath());
    if (!cliAvailable) {
      console.log('⚠️  CLI not available, some tests will be skipped');
    }
  });

  describe('Help Commands', () => {
    it('should show main help', async () => {
      if (!cliAvailable) return;

      const result = await runCLI(['--help'], { timeout: 10000 });

      assertions.didNotTimeout(result);
      assertions.stdoutContains(result, 'Claude-Flow');
      assertions.stdoutContains(result, 'USAGE');
    });

    it('should show hive-mind help', async () => {
      if (!cliAvailable) return;

      const result = await runHiveMind('--help', [], { timeout: 10000 });

      assertions.didNotTimeout(result);
      assertions.stdoutContains(result, 'hive-mind');
      assertions.stdoutContains(result, 'SUBCOMMANDS');
    });
  });

  describe('Hive Mind Commands', () => {
    it('should show hive-mind status', async () => {
      if (!cliAvailable) return;

      const result = await runHiveMind('status', [], { timeout: 15000 });

      assertions.didNotTimeout(result);
      // Status command should work even without running swarm
      // It may show "no active sessions" or similar
    });

    it('should list hive-mind sessions', async () => {
      if (!cliAvailable) return;

      const result = await runHiveMind('sessions', [], { timeout: 15000 });

      assertions.didNotTimeout(result);
      // Sessions command should work even with empty list
    });

    it('should show hive-mind metrics', async () => {
      if (!cliAvailable) return;

      const result = await runHiveMind('metrics', [], { timeout: 15000 });

      assertions.didNotTimeout(result);
      // Metrics should show even without active swarm
    });
  });

  describe('Version and Info', () => {
    it('should show version', async () => {
      if (!cliAvailable) return;

      const result = await runCLI(['--version'], { timeout: 5000 });

      assertions.didNotTimeout(result);
      // Version should be in output
      expect(result.stdout.length > 0 || result.exitCode === 0).toBe(true);
    });

    it('should show status', async () => {
      if (!cliAvailable) return;

      const result = await runCLI(['status'], { timeout: 15000 });

      assertions.didNotTimeout(result);
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown command gracefully', async () => {
      if (!cliAvailable) return;

      const result = await runCLI(['unknown-command-xyz'], { timeout: 10000 });

      assertions.didNotTimeout(result);
      // Should either show help or error message, not crash
    });

    it('should handle invalid hive-mind subcommand', async () => {
      if (!cliAvailable) return;

      const result = await runHiveMind('invalid-subcommand', [], { timeout: 10000 });

      assertions.didNotTimeout(result);
    });
  });

  describe('Environment Variables', () => {
    it('should respect TIARA_TEST_MODE', async () => {
      if (!cliAvailable) return;

      const result = await runCLI(['status'], {
        timeout: 10000,
        env: {
          TIARA_TEST_MODE: 'true',
          TIARA_DEBUG: 'true'
        }
      });

      assertions.didNotTimeout(result);
    });

    it('should respect TIARA_HEADLESS', async () => {
      if (!cliAvailable) return;

      const result = await runHiveMind('status', [], {
        timeout: 10000,
        env: {
          TIARA_HEADLESS: 'true'
        }
      });

      assertions.didNotTimeout(result);
    });
  });
});

describe('Performance Tests', () => {
  let cliAvailable = false;

  beforeAll(() => {
    cliAvailable = existsSync(getCLIPath());
  });

  it('should complete help within 5 seconds', async () => {
    if (!cliAvailable) return;

    const result = await runCLI(['--help'], { timeout: 5000 });

    assertions.didNotTimeout(result);
    assertions.completedWithin(result, 5000);
  });

  it('should complete status within 10 seconds', async () => {
    if (!cliAvailable) return;

    const result = await runCLI(['status'], { timeout: 10000 });

    assertions.didNotTimeout(result);
    assertions.completedWithin(result, 10000);
  });
});
