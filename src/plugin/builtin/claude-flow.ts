/**
 * Claude Flow Hooks Integration Plugin
 *
 * Integrates tiara hooks system for task coordination,
 * session management, and memory persistence.
 *
 * Features:
 * - Pre/post task hooks with memory coordination
 * - Session lifecycle management
 * - File edit notifications
 * - Neural pattern training integration
 */

import type {
  PluginFactory,
  PluginContext,
  PluginInstance,
  ShellResult,
} from '../plugin';

export interface ClaudeFlowConfig {
  /** Enable automatic session management */
  autoSession?: boolean;
  /** Enable memory coordination */
  memoryCoordination?: boolean;
  /** Enable neural pattern training */
  neuralTraining?: boolean;
  /** Session ID to use (auto-generated if not provided) */
  sessionId?: string;
  /** Swarm ID for multi-agent coordination */
  swarmId?: string;
}

/**
 * Claude Flow Hooks Plugin Factory
 */
export const ClaudeFlowPlugin: PluginFactory = async (
  ctx: PluginContext
): Promise<PluginInstance> => {
  const config: ClaudeFlowConfig = {
    autoSession: ctx.config.get('claudeFlow.autoSession') ?? true,
    memoryCoordination: ctx.config.get('claudeFlow.memoryCoordination') ?? true,
    neuralTraining: ctx.config.get('claudeFlow.neuralTraining') ?? false,
    sessionId: ctx.config.get('claudeFlow.sessionId'),
    swarmId: ctx.config.get('claudeFlow.swarmId'),
  };

  let currentSessionId = config.sessionId || generateSessionId();
  let taskCount = 0;

  /**
   * Execute tiara hook command
   */
  async function executeHook(
    hookType: string,
    args: Record<string, string>
  ): Promise<ShellResult> {
    const argsStr = Object.entries(args)
      .map(([k, v]) => `--${k} "${v}"`)
      .join(' ');

    try {
      return await ctx.shell(`npx tiara@alpha hooks ${hookType} ${argsStr}`);
    } catch (error) {
      ctx.logger.warn(`Claude-flow hook execution failed: ${hookType}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return { stdout: '', stderr: String(error), exitCode: 1 };
    }
  }

  return {
    metadata: {
      name: 'tiara-hooks',
      version: '1.0.0',
      description: 'Claude Flow hooks integration for task coordination',
      tags: ['hooks', 'tiara', 'coordination'],
    },

    lifecycle: {
      async init() {
        ctx.logger.info('Claude Flow hooks plugin initialized', {
          sessionId: currentSessionId,
          swarmId: config.swarmId,
        });
      },

      async destroy() {
        // End session on plugin destruction
        if (config.autoSession) {
          await executeHook('session-end', {
            'session-id': currentSessionId,
            'export-metrics': 'true',
          });
        }
        ctx.logger.info('Claude Flow hooks plugin destroyed');
      },
    },

    hooks: {
      // -----------------------------------------------------------------------
      // Session Lifecycle
      // -----------------------------------------------------------------------
      'session.start': async (input, output) => {
        if (!config.autoSession) return output;

        currentSessionId = input.sessionId || generateSessionId();

        // Restore previous session if available
        const result = await executeHook('session-restore', {
          'session-id': currentSessionId,
        });

        if (result.exitCode === 0) {
          ctx.logger.debug('Restored session from tiara', {
            sessionId: currentSessionId,
          });
        }

        return {
          ...output,
          context: {
            ...output.context,
            claudeFlowSessionId: currentSessionId,
            claudeFlowSwarmId: config.swarmId,
          },
        };
      },

      'session.end': async (input, output) => {
        if (!config.autoSession) return output;

        await executeHook('session-end', {
          'session-id': currentSessionId,
          'export-metrics': 'true',
        });

        return {
          ...output,
          metrics: {
            ...output.metrics,
            claudeFlowTaskCount: taskCount,
          },
        };
      },

      // -----------------------------------------------------------------------
      // Task Lifecycle
      // -----------------------------------------------------------------------
      'pre-task': async (input, output) => {
        taskCount++;

        await executeHook('pre-task', {
          description: input.description,
          'task-id': input.taskId,
          ...(input.agentType && { 'agent-type': input.agentType }),
        });

        return {
          ...output,
          context: {
            ...output.context,
            claudeFlowTaskId: input.taskId,
            claudeFlowTaskNumber: taskCount,
          },
        };
      },

      'post-task': async (input, output) => {
        const memoryUpdates: Record<string, unknown> = {};

        // Store task metrics in memory if enabled
        if (config.memoryCoordination && ctx.memory) {
          const taskKey = `swarm/tasks/${input.taskId}`;
          memoryUpdates[taskKey] = {
            taskId: input.taskId,
            duration: input.duration,
            success: input.success,
            timestamp: Date.now(),
          };

          await ctx.memory.set(taskKey, memoryUpdates[taskKey]);
        }

        await executeHook('post-task', {
          'task-id': input.taskId,
          ...(input.success ? {} : { failed: 'true' }),
        });

        // Train neural patterns if enabled and task succeeded
        if (config.neuralTraining && input.success) {
          try {
            await ctx.shell(
              `npx tiara@alpha neural train --pattern coordination --data "${input.taskId}:${input.duration}ms"`
            );
          } catch {
            // Neural training is optional, don't fail on errors
          }
        }

        return {
          ...output,
          metrics: {
            ...output.metrics,
            taskDuration: input.duration,
          },
          memoryUpdates,
        };
      },

      // -----------------------------------------------------------------------
      // File Edit Coordination
      // -----------------------------------------------------------------------
      'pre-edit': async (input, output) => {
        await executeHook('pre-edit', {
          file: input.filePath,
          type: input.editType,
        });

        return output;
      },

      'post-edit': async (input, output) => {
        const memoryKey = config.memoryCoordination
          ? `swarm/edits/${input.filePath.replace(/\//g, '_')}`
          : undefined;

        await executeHook('post-edit', {
          file: input.filePath,
          ...(memoryKey && { 'memory-key': memoryKey }),
        });

        // Store edit in memory
        if (memoryKey && ctx.memory) {
          await ctx.memory.set(memoryKey, {
            filePath: input.filePath,
            editType: input.editType,
            success: input.success,
            timestamp: Date.now(),
          });
        }

        // Notify other agents
        await executeHook('notify', {
          message: `File ${input.editType}: ${input.filePath}`,
        });

        return {
          ...output,
          memoryKey,
        };
      },

      // -----------------------------------------------------------------------
      // Memory Coordination
      // -----------------------------------------------------------------------
      'memory.update': async (input, output) => {
        if (!config.memoryCoordination) return output;

        // Sync memory update to tiara
        const key = input.namespace
          ? `${input.namespace}/${input.key}`
          : input.key;

        await executeHook('post-edit', {
          'memory-key': key,
          file: 'memory',
        });

        return output;
      },
    },
  };
};

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `session-${timestamp}-${random}`;
}

export default ClaudeFlowPlugin;
