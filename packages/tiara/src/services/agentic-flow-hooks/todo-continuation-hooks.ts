/**
 * Todo Continuation Hook System for agentic-flow
 *
 * Enables automatic session continuation when incomplete tasks remain.
 * Injects system reminders to continue working on pending todos.
 */

import { agenticHookManager } from './hook-manager.js';
import type {
  AgenticHookContext,
  HookHandlerResult,
  TodoContinuationHookPayload,
  SideEffect,
  TodoItem,
  TodoState,
} from './types.js';

// ===== Todo Continuation Hook =====

export const todoContinuationHook = {
  id: 'agentic-todo-continuation',
  type: 'todo-continuation' as const,
  priority: 95, // High priority to run early
  handler: async (
    payload: TodoContinuationHookPayload,
    context: AgenticHookContext
  ): Promise<HookHandlerResult> => {
    const { todoState, proceedWithoutAsking, completionThreshold } = payload;

    const sideEffects: SideEffect[] = [];

    // If no todos or all complete, nothing to do
    if (!todoState || todoState.total === 0 || todoState.remaining === 0) {
      return { continue: true };
    }

    // Check if we're below the completion threshold
    if (todoState.percentage >= completionThreshold) {
      return { continue: true };
    }

    // Generate reminder message
    const reminderMessage = generateReminderMessage(todoState, proceedWithoutAsking);

    // Store continuation state
    sideEffects.push({
      type: 'memory',
      action: 'store',
      data: {
        key: `todo:continuation:${context.sessionId}:${Date.now()}`,
        value: {
          todoState,
          reminderMessage,
          proceedWithoutAsking,
          timestamp: Date.now(),
        },
        ttl: 86400, // 24 hours
      },
    });

    // Log the continuation trigger
    sideEffects.push({
      type: 'log',
      action: 'info',
      data: {
        message: `Todo continuation triggered: ${todoState.completed}/${todoState.total} completed`,
        remaining: todoState.remaining,
      },
    });

    // Emit notification for UI/system
    sideEffects.push({
      type: 'notification',
      action: 'emit',
      data: {
        event: 'todo:continuation',
        data: {
          message: reminderMessage,
          todoState,
          proceedWithoutAsking,
        },
      },
    });

    return {
      continue: true,
      modified: true,
      payload: {
        ...payload,
        reminderMessage,
        shouldContinue: true,
      },
      metadata: {
        todoStatus: `${todoState.completed}/${todoState.total} completed, ${todoState.remaining} remaining`,
        incomplete: todoState.items.filter(i => i.status !== 'completed'),
      },
      sideEffects,
    };
  },
};

// ===== Todo Status Check Hook =====

export const todoStatusCheckHook = {
  id: 'agentic-todo-status-check',
  type: 'todo-status-check' as const,
  priority: 100,
  handler: async (
    payload: TodoContinuationHookPayload,
    context: AgenticHookContext
  ): Promise<HookHandlerResult> => {
    // Check current todo state from context
    const todoState = context.todoState || payload.todoState;

    if (!todoState) {
      return { continue: true };
    }

    const sideEffects: SideEffect[] = [];

    // Track status check
    sideEffects.push({
      type: 'metric',
      action: 'update',
      data: {
        name: 'todo.status.check',
        value: 1,
        tags: {
          completed: todoState.completed,
          remaining: todoState.remaining,
          percentage: todoState.percentage,
        },
      },
    });

    // Update context with current state
    return {
      continue: true,
      modified: true,
      metadata: {
        todoState,
        lastCheck: Date.now(),
      },
      sideEffects,
    };
  },
};

// ===== Todo Reminder Inject Hook =====

export const todoReminderInjectHook = {
  id: 'agentic-todo-reminder-inject',
  type: 'todo-reminder-inject' as const,
  priority: 90,
  handler: async (
    payload: TodoContinuationHookPayload,
    context: AgenticHookContext
  ): Promise<HookHandlerResult> => {
    const { todoState, proceedWithoutAsking } = payload;

    if (!todoState || todoState.remaining === 0) {
      return { continue: true };
    }

    const sideEffects: SideEffect[] = [];

    // Generate the system reminder format (like the screenshot shows)
    const systemReminder = formatSystemReminder(todoState, proceedWithoutAsking);

    // Store reminder for injection
    sideEffects.push({
      type: 'memory',
      action: 'store',
      data: {
        key: `todo:reminder:${context.sessionId}`,
        value: {
          reminder: systemReminder,
          todoState,
          generatedAt: Date.now(),
        },
        ttl: 3600, // 1 hour
      },
    });

    // Log reminder injection
    sideEffects.push({
      type: 'log',
      action: 'info',
      data: {
        message: 'System reminder injected for todo continuation',
        completed: todoState.completed,
        total: todoState.total,
      },
    });

    return {
      continue: true,
      modified: true,
      payload: {
        ...payload,
        reminderMessage: systemReminder,
      },
      metadata: {
        systemReminder,
        injectedAt: Date.now(),
      },
      sideEffects,
    };
  },
};

// ===== Helper Functions =====

/**
 * Generate a reminder message for todo continuation
 */
function generateReminderMessage(
  todoState: TodoState,
  proceedWithoutAsking: boolean
): string {
  const { completed, total, remaining, percentage } = todoState;

  let message = `[SYSTEM REMINDER - TODO CONTINUATION]\n\n`;
  message += `Incomplete tasks remain in your todo list. Continue working on the next pending task.\n\n`;

  if (proceedWithoutAsking) {
    message += `- Proceed without asking for permission\n`;
  }
  message += `- Mark each task complete when finished\n`;
  message += `- Do not stop until all tasks are done\n\n`;

  message += `[Status: ${completed}/${total} completed, ${remaining} remaining]`;

  return message;
}

/**
 * Format a system reminder block (matches the UI format in the screenshot)
 */
function formatSystemReminder(
  todoState: TodoState,
  proceedWithoutAsking: boolean
): string {
  const { completed, total, remaining } = todoState;

  const lines: string[] = [
    '[SYSTEM REMINDER - TODO CONTINUATION]',
    '',
    'Incomplete tasks remain in your todo list. Continue working on the next pending task.',
    '',
  ];

  if (proceedWithoutAsking) {
    lines.push('- Proceed without asking for permission');
  }
  lines.push('- Mark each task complete when finished');
  lines.push('- Do not stop until all tasks are done');
  lines.push('');
  lines.push(`[Status: ${completed}/${total} completed, ${remaining} remaining]`);

  return lines.join('\n');
}

/**
 * Calculate todo state from a list of todo items
 */
export function calculateTodoState(todos: TodoItem[]): TodoState {
  const total = todos.length;
  const completed = todos.filter(t => t.status === 'completed').length;
  const inProgress = todos.filter(t => t.status === 'in_progress').length;
  const remaining = total - completed;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 100;

  return {
    total,
    completed,
    remaining,
    inProgress,
    percentage,
    items: todos,
  };
}

/**
 * Check if continuation should trigger based on todo state
 */
export function shouldTriggerContinuation(
  todoState: TodoState,
  options: {
    completionThreshold?: number;
    minRemaining?: number;
  } = {}
): boolean {
  const { completionThreshold = 100, minRemaining = 1 } = options;

  // No todos = no continuation needed
  if (todoState.total === 0) {
    return false;
  }

  // All complete = no continuation needed
  if (todoState.remaining === 0) {
    return false;
  }

  // Below threshold and has minimum remaining
  if (todoState.percentage < completionThreshold && todoState.remaining >= minRemaining) {
    return true;
  }

  return false;
}

/**
 * Create a todo continuation payload for hook execution
 */
export function createTodoContinuationPayload(
  todos: TodoItem[],
  options: {
    proceedWithoutAsking?: boolean;
    completionThreshold?: number;
  } = {}
): TodoContinuationHookPayload {
  const todoState = calculateTodoState(todos);
  const { proceedWithoutAsking = true, completionThreshold = 100 } = options;

  return {
    operation: 'continue',
    todoState,
    proceedWithoutAsking,
    completionThreshold,
    shouldContinue: shouldTriggerContinuation(todoState, { completionThreshold }),
  };
}

// ===== Register Hooks =====

export function registerTodoContinuationHooks(): void {
  agenticHookManager.register(todoContinuationHook);
  agenticHookManager.register(todoStatusCheckHook);
  agenticHookManager.register(todoReminderInjectHook);
}
