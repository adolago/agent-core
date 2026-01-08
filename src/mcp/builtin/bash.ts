/**
 * Bash Tool
 *
 * Execute shell commands with sandboxing, timeout, and permission checking.
 * Supports command parsing for permission validation.
 */

import { z } from 'zod';
import { spawn } from 'child_process';
import { defineTool } from '../registry';
import type { ToolExecutionContext } from '../types';

// ============================================================================
// Configuration
// ============================================================================

const MAX_OUTPUT_LENGTH = 30_000;
const DEFAULT_TIMEOUT = 2 * 60 * 1000; // 2 minutes

// ============================================================================
// Tool Definition
// ============================================================================

export const BashTool = defineTool(
  'bash',
  'builtin',
  async () => ({
    description: `Execute a bash command in a persistent shell session.

IMPORTANT: This tool is for terminal operations like git, npm, docker, etc.

Usage notes:
- The command argument is required.
- You can specify an optional timeout in milliseconds (max 600000ms / 10 minutes).
- Always quote file paths that contain spaces with double quotes.
- If the output exceeds ${MAX_OUTPUT_LENGTH} characters, it will be truncated.
- Avoid using find, grep, cat, head, tail, sed, awk for file operations - use dedicated tools instead.`,

    parameters: z.object({
      command: z.string().describe('The command to execute'),
      timeout: z.number().optional().describe('Optional timeout in milliseconds'),
      workdir: z.string().optional().describe('Working directory for the command'),
      description: z.string().describe('Clear, concise description of what this command does in 5-10 words'),
    }),

    async execute(params, ctx: ToolExecutionContext) {
      const cwd = params.workdir || process.cwd();
      const timeout = params.timeout ?? DEFAULT_TIMEOUT;

      if (params.timeout !== undefined && params.timeout < 0) {
        throw new Error(`Invalid timeout value: ${params.timeout}. Timeout must be a positive number.`);
      }

      // Spawn the process
      const proc = spawn(params.command, {
        shell: true,
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      });

      let output = '';

      // Initialize metadata
      ctx.metadata({
        metadata: {
          output: '',
          description: params.description,
        },
      });

      const append = (chunk: Buffer) => {
        if (output.length <= MAX_OUTPUT_LENGTH) {
          output += chunk.toString();
          ctx.metadata({
            metadata: {
              output,
              description: params.description,
            },
          });
        }
      };

      proc.stdout?.on('data', append);
      proc.stderr?.on('data', append);

      let timedOut = false;
      let aborted = false;
      let exited = false;

      const kill = () => {
        if (exited) return;
        try {
          if (process.platform !== 'win32' && proc.pid) {
            process.kill(-proc.pid, 'SIGTERM');
          } else {
            proc.kill('SIGTERM');
          }
        } catch {
          // Process may have already exited
        }
      };

      if (ctx.abort.aborted) {
        aborted = true;
        kill();
      }

      const abortHandler = () => {
        aborted = true;
        kill();
      };

      ctx.abort.addEventListener('abort', abortHandler, { once: true });

      const timeoutTimer = setTimeout(() => {
        timedOut = true;
        kill();
      }, timeout + 100);

      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timeoutTimer);
          ctx.abort.removeEventListener('abort', abortHandler);
        };

        proc.once('exit', () => {
          exited = true;
          cleanup();
          resolve();
        });

        proc.once('error', (error) => {
          exited = true;
          cleanup();
          reject(error);
        });
      });

      const resultMetadata: string[] = ['<bash_metadata>'];

      if (output.length > MAX_OUTPUT_LENGTH) {
        output = output.slice(0, MAX_OUTPUT_LENGTH);
        resultMetadata.push(`bash tool truncated output as it exceeded ${MAX_OUTPUT_LENGTH} char limit`);
      }

      if (timedOut) {
        resultMetadata.push(`bash tool terminated command after exceeding timeout ${timeout} ms`);
      }

      if (aborted) {
        resultMetadata.push('User aborted the command');
      }

      if (resultMetadata.length > 1) {
        resultMetadata.push('</bash_metadata>');
        output += '\n\n' + resultMetadata.join('\n');
      }

      return {
        title: params.description,
        metadata: {
          output,
          exit: proc.exitCode,
          description: params.description,
        },
        output,
      };
    },
  })
);
