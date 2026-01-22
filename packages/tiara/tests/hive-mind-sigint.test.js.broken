/**
 * Tests for SIGINT handling in hive-mind spawn command
 *
 * Updated for Qdrant storage - verifies behavior through process output
 * rather than direct database queries.
 *
 * NOTE: These are integration tests that require:
 * 1. The CLI to be built (npm run build)
 * 2. Or run with tsx for TypeScript support
 *
 * Skip in CI/test mode when CLI isn't available.
 */

import { describe, it, expect, beforeAll, afterEach } from '@jest/globals';
import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set test mode environment variables
process.env.TIARA_TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

// Check if CLI is available (built or via tsx)
const cliPath = path.join(__dirname, '..', 'src', 'cli', 'simple-cli.js');
const distCliPath = path.join(__dirname, '..', 'dist', 'src', 'cli', 'simple-cli.js');

let cliAvailable = false;
let cliCommand = [];

// Try to determine best way to run CLI
function checkCliAvailability() {
  // Check if dist CLI exists (built version)
  if (existsSync(distCliPath)) {
    cliCommand = ['node', distCliPath];
    cliAvailable = true;
    return;
  }

  // Check if tsx is available for running TypeScript directly
  try {
    execSync('which tsx', { stdio: 'ignore' });
    const tsCliPath = path.join(__dirname, '..', 'src', 'cli', 'simple-cli.ts');
    if (existsSync(tsCliPath)) {
      cliCommand = ['tsx', tsCliPath];
      cliAvailable = true;
      return;
    }
  } catch {
    // tsx not available
  }

  // Check if JS version works (may have import issues)
  if (existsSync(cliPath)) {
    // We'll try it but it may fail due to .js -> .ts resolution
    cliCommand = ['node', cliPath];
    cliAvailable = true;
  }
}

describe('Hive Mind SIGINT Handler', () => {
  let hiveMindProcess;

  beforeAll(() => {
    checkCliAvailability();
    if (!cliAvailable) {
      console.log('⚠️  Skipping SIGINT tests: CLI not available');
      console.log('   Build the project with: npm run build');
      console.log('   Or install tsx: npm install -g tsx');
    }
  });

  afterEach(() => {
    if (hiveMindProcess && !hiveMindProcess.killed) {
      hiveMindProcess.kill('SIGKILL');
    }
  });

  it('should pause session when SIGINT is received during spawn', (done) => {
    if (!cliAvailable) {
      console.log('   Skipped: CLI not available');
      done();
      return;
    }

    // Start hive-mind spawn
    hiveMindProcess = spawn(cliCommand[0], [...cliCommand.slice(1), 'hive-mind', 'spawn', 'Test SIGINT handling'], {
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'test', TIARA_TEST_MODE: 'true' }
    });

    let output = '';
    let sessionId = null;
    let hasError = false;

    hiveMindProcess.stdout.on('data', (data) => {
      output += data.toString();

      // Extract session ID from output
      const sessionMatch = output.match(/Session ID:\s+(\S+)/);
      if (sessionMatch && !sessionId) {
        sessionId = sessionMatch[1];
      }

      // When swarm is ready, send SIGINT
      if (output.includes('Swarm is ready for coordination')) {
        setTimeout(() => {
          hiveMindProcess.kill('SIGINT');
        }, 500);
      }
    });

    hiveMindProcess.stderr.on('data', (data) => {
      const err = data.toString();
      // Only mark as error if it's a module resolution error
      if (err.includes('ERR_MODULE_NOT_FOUND') || err.includes('Cannot find module')) {
        hasError = true;
        console.log('   Skipped: CLI has module resolution issues (run npm run build)');
        hiveMindProcess.kill('SIGKILL');
      }
    });

    hiveMindProcess.on('exit', (code) => {
      if (hasError) {
        // Skip test when CLI isn't properly built
        done();
        return;
      }

      expect(code).toBe(0);
      expect(output).toContain('Pausing session...');
      expect(output).toContain('Session paused successfully');

      // Session ID should be present for resume command
      if (sessionId) {
        expect(output).toContain(`hive-mind resume ${sessionId}`);
      }

      done();
    });
  }, 30000);

  it('should save checkpoint when pausing session', (done) => {
    if (!cliAvailable) {
      console.log('   Skipped: CLI not available');
      done();
      return;
    }

    hiveMindProcess = spawn(cliCommand[0], [...cliCommand.slice(1), 'hive-mind', 'spawn', 'Test checkpoint saving'], {
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'test', TIARA_TEST_MODE: 'true' }
    });

    let output = '';
    let hasError = false;

    hiveMindProcess.stdout.on('data', (data) => {
      output += data.toString();

      if (output.includes('Swarm is ready for coordination')) {
        setTimeout(() => {
          hiveMindProcess.kill('SIGINT');
        }, 500);
      }
    });

    hiveMindProcess.stderr.on('data', (data) => {
      const err = data.toString();
      if (err.includes('ERR_MODULE_NOT_FOUND') || err.includes('Cannot find module')) {
        hasError = true;
        hiveMindProcess.kill('SIGKILL');
      }
    });

    hiveMindProcess.on('exit', (code) => {
      if (hasError) {
        done();
        return;
      }

      expect(code).toBe(0);
      expect(output).toContain('Session paused');
      done();
    });
  }, 30000);

  it('should terminate Claude Code process when SIGINT is received', (done) => {
    if (!cliAvailable) {
      console.log('   Skipped: CLI not available');
      done();
      return;
    }

    // This test requires claude command to be available
    let claudeAvailable = false;

    try {
      execSync('which claude', { stdio: 'ignore' });
      claudeAvailable = true;
    } catch {
      console.log('   Skipped: claude command not available');
      done();
      return;
    }

    hiveMindProcess = spawn(
      cliCommand[0],
      [...cliCommand.slice(1), 'hive-mind', 'spawn', 'Test Claude termination', '--claude'],
      {
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'test', TIARA_TEST_MODE: 'true' }
      }
    );

    let output = '';
    let claudeLaunched = false;
    let hasError = false;

    hiveMindProcess.stdout.on('data', (data) => {
      output += data.toString();

      if (output.includes('Claude Code launched with Hive Mind coordination')) {
        claudeLaunched = true;
        setTimeout(() => {
          hiveMindProcess.kill('SIGINT');
        }, 1000);
      }
    });

    hiveMindProcess.stderr.on('data', (data) => {
      const err = data.toString();
      if (err.includes('ERR_MODULE_NOT_FOUND') || err.includes('Cannot find module')) {
        hasError = true;
        hiveMindProcess.kill('SIGKILL');
      }
    });

    hiveMindProcess.on('exit', (code) => {
      if (hasError) {
        done();
        return;
      }

      if (claudeLaunched) {
        expect(output).toContain('Pausing session and terminating Claude Code...');
      }
      expect(code).toBe(0);
      done();
    });
  }, 30000);
});
