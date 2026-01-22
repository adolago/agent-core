/**
 * CLI Test Harness
 *
 * Provides utilities for testing CLI commands in headless mode.
 * Captures stdout/stderr, handles timeouts, and provides assertions.
 */

import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CLIResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  duration: number;
  timedOut: boolean;
  killed: boolean;
}

export interface CLIOptions {
  timeout?: number;
  env?: Record<string, string>;
  cwd?: string;
  input?: string;
  inheritEnv?: boolean;
}

const DEFAULT_TIMEOUT = 30000;

/**
 * Get the CLI entry point path
 */
export function getCLIPath(): string {
  return path.resolve(__dirname, '..', 'cli', 'simple-cli.js');
}

/**
 * Run a CLI command and capture output
 */
export async function runCLI(
  args: string[],
  options: CLIOptions = {}
): Promise<CLIResult> {
  const {
    timeout = DEFAULT_TIMEOUT,
    env = {},
    cwd = process.cwd(),
    input,
    inheritEnv = true
  } = options;

  const cliPath = getCLIPath();
  const startTime = Date.now();

  // Build environment
  const processEnv: Record<string, string> = {
    ...(inheritEnv ? process.env : {}),
    TIARA_TEST_MODE: 'true',
    TIARA_HEADLESS: 'true',
    NODE_ENV: 'test',
    FORCE_COLOR: '0', // Disable color output for easier parsing
    ...env
  } as Record<string, string>;

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let killed = false;

    // Use bun if available, otherwise node
    const runtime = process.env.BUN_INSTALL ? 'bun' : 'node';
    const child = spawn(runtime, [cliPath, ...args], {
      cwd,
      env: processEnv,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Set up timeout
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 5000);
    }, timeout);

    // Capture output
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    // Send input if provided
    if (input) {
      child.stdin?.write(input);
      child.stdin?.end();
    }

    // Handle exit
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      killed = signal !== null;

      resolve({
        exitCode: code,
        stdout,
        stderr,
        duration: Date.now() - startTime,
        timedOut,
        killed
      });
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      stderr += `\nProcess error: ${error.message}`;

      resolve({
        exitCode: 1,
        stdout,
        stderr,
        duration: Date.now() - startTime,
        timedOut,
        killed: true
      });
    });
  });
}

/**
 * Run hive-mind command
 */
export async function runHiveMind(
  subcommand: string,
  args: string[] = [],
  options: CLIOptions = {}
): Promise<CLIResult> {
  return runCLI(['hive-mind', subcommand, ...args], options);
}

/**
 * Assertion helpers for CLI results
 */
export const assertions = {
  /**
   * Assert command succeeded (exit code 0)
   */
  succeeded(result: CLIResult): void {
    if (result.exitCode !== 0) {
      throw new Error(
        `Command failed with exit code ${result.exitCode}\n` +
        `stdout: ${result.stdout}\n` +
        `stderr: ${result.stderr}`
      );
    }
  },

  /**
   * Assert command failed (exit code non-zero)
   */
  failed(result: CLIResult): void {
    if (result.exitCode === 0) {
      throw new Error(
        `Command succeeded but expected failure\n` +
        `stdout: ${result.stdout}`
      );
    }
  },

  /**
   * Assert stdout contains string
   */
  stdoutContains(result: CLIResult, text: string): void {
    if (!result.stdout.includes(text)) {
      throw new Error(
        `Expected stdout to contain "${text}"\n` +
        `Actual stdout: ${result.stdout}`
      );
    }
  },

  /**
   * Assert stderr contains string
   */
  stderrContains(result: CLIResult, text: string): void {
    if (!result.stderr.includes(text)) {
      throw new Error(
        `Expected stderr to contain "${text}"\n` +
        `Actual stderr: ${result.stderr}`
      );
    }
  },

  /**
   * Assert command did not time out
   */
  didNotTimeout(result: CLIResult): void {
    if (result.timedOut) {
      throw new Error(
        `Command timed out after ${result.duration}ms\n` +
        `stdout: ${result.stdout}\n` +
        `stderr: ${result.stderr}`
      );
    }
  },

  /**
   * Assert duration is under threshold
   */
  completedWithin(result: CLIResult, maxMs: number): void {
    if (result.duration > maxMs) {
      throw new Error(
        `Command took ${result.duration}ms, expected under ${maxMs}ms`
      );
    }
  }
};

/**
 * Interactive CLI runner for commands that require input
 */
export class InteractiveCLI extends EventEmitter {
  private process: ChildProcess | null = null;
  private stdout: string = '';
  private stderr: string = '';
  private startTime: number = 0;

  async start(args: string[], options: CLIOptions = {}): Promise<void> {
    const cliPath = getCLIPath();
    this.startTime = Date.now();

    const processEnv: Record<string, string> = {
      ...process.env,
      TIARA_TEST_MODE: 'true',
      NODE_ENV: 'test',
      ...options.env
    } as Record<string, string>;

    const runtime = process.env.BUN_INSTALL ? 'bun' : 'node';
    this.process = spawn(runtime, [cliPath, ...args], {
      cwd: options.cwd || process.cwd(),
      env: processEnv,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.process.stdout?.on('data', (data) => {
      const text = data.toString();
      this.stdout += text;
      this.emit('stdout', text);
    });

    this.process.stderr?.on('data', (data) => {
      const text = data.toString();
      this.stderr += text;
      this.emit('stderr', text);
    });

    this.process.on('exit', (code, signal) => {
      this.emit('exit', {
        exitCode: code,
        signal,
        stdout: this.stdout,
        stderr: this.stderr,
        duration: Date.now() - this.startTime
      });
    });
  }

  write(input: string): void {
    this.process?.stdin?.write(input);
  }

  writeLine(input: string): void {
    this.write(input + '\n');
  }

  async waitFor(pattern: string | RegExp, timeout: number = 10000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for pattern: ${pattern}`));
      }, timeout);

      const check = () => {
        const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
        if (regex.test(this.stdout)) {
          clearTimeout(timer);
          resolve(this.stdout);
        }
      };

      // Check immediately
      check();

      // Listen for new output
      this.on('stdout', check);
    });
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): void {
    this.process?.kill(signal);
  }

  getResult(): CLIResult {
    return {
      exitCode: this.process?.exitCode ?? null,
      stdout: this.stdout,
      stderr: this.stderr,
      duration: Date.now() - this.startTime,
      timedOut: false,
      killed: this.process?.killed ?? false
    };
  }
}

export default {
  getCLIPath,
  runCLI,
  runHiveMind,
  assertions,
  InteractiveCLI
};
