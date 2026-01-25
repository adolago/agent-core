/**
 * Provider Instructions
 *
 * Provider-specific instruction formatting for optimal tool use.
 * Different providers have different strengths and preferences.
 *
 * Ported from claude-flow v3 @agentic-flow/proxy
 *
 * @module tiara/proxy/provider-instructions
 */

import type {
  ToolInstructions,
  InstructionOptions,
  ParallelCapabilities,
} from "./types.js";

// =============================================================================
// Base Instructions
// =============================================================================

/**
 * Base tool instructions (provider-agnostic)
 */
export const BASE_INSTRUCTIONS: ToolInstructions = {
  format: `When you need to perform operations, use the provided tools.
For file operations, read files before editing them.
For command execution, use the bash tool.`,
  commands: {
    write: "Use the write/edit tool to modify files",
    read: "Use the read tool to view file contents",
    bash: "Use the bash tool to execute commands",
  },
  examples: `Example: To read a file, use the read tool with the file path.
Example: To run a command, use the bash tool with the command string.`,
};

/**
 * Anthropic-optimized instructions
 */
export const ANTHROPIC_INSTRUCTIONS: ToolInstructions = {
  format: `You have access to tools for file operations and command execution.
Think step by step about what you need to do, then use the appropriate tools.
Always read files before making edits to understand their current state.`,
  commands: {
    write: "Edit tool with old_string and new_string for surgical edits",
    read: "Read tool for viewing file contents (supports line ranges)",
    bash: "Bash tool for shell command execution",
  },
  examples: `For reading: Read(file_path="/path/to/file")
For editing: Edit(file_path="/path", old_string="before", new_string="after")
For commands: Bash(command="git status")`,
  emphasis: `IMPORTANT: Always read a file before editing it.
Use Edit for precise changes, Write only for new files or complete rewrites.`,
};

/**
 * OpenAI-optimized instructions
 */
export const OPENAI_INSTRUCTIONS: ToolInstructions = {
  format: `You can use function calls to interact with the system.
Each function has a specific purpose - choose the right one for each task.
Chain multiple function calls when needed to accomplish complex goals.`,
  commands: {
    write: "file_write function with path and content parameters",
    read: "file_read function with path parameter",
    bash: "execute_command function with command parameter",
  },
  examples: `Reading: file_read(path="/etc/config")
Writing: file_write(path="/tmp/output", content="data")
Commands: execute_command(command="ls -la")`,
};

/**
 * Google Gemini-optimized instructions
 */
export const GOOGLE_INSTRUCTIONS: ToolInstructions = {
  format: `Use the available function declarations to perform operations.
Gemini supports parallel function calling - batch related operations together.
For file operations, prefer reading before writing.`,
  commands: {
    write: "writeFile function declaration",
    read: "readFile function declaration",
    bash: "runCommand function declaration",
  },
  examples: `Use functionCall with appropriate parameters.
Multiple function calls can be made in a single turn.`,
};

/**
 * Meta Llama-optimized instructions
 */
export const META_INSTRUCTIONS: ToolInstructions = {
  format: `<|begin_of_text|>You have access to tools.
When you need to use a tool, output in this format:
<|tool_call|>{"name": "tool_name", "arguments": {...}}<|end_tool_call|>`,
  commands: {
    write: 'file_write tool: {"path": "...", "content": "..."}',
    read: 'file_read tool: {"path": "..."}',
    bash: 'shell tool: {"command": "..."}',
  },
};

/**
 * DeepSeek-optimized instructions
 */
export const DEEPSEEK_INSTRUCTIONS: ToolInstructions = {
  format: `You can call functions to help complete tasks.
Output function calls in JSON format when needed.
Think through the problem carefully before calling functions.`,
  commands: {
    write: "write_file(path, content)",
    read: "read_file(path)",
    bash: "execute(command)",
  },
};

/**
 * Mistral-optimized instructions
 */
export const MISTRAL_INSTRUCTIONS: ToolInstructions = {
  format: `[INST]You have access to tools for various operations.
Use [TOOL_CALLS] to invoke tools with proper arguments.
Multiple tool calls can be batched together.[/INST]`,
  commands: {
    write: "[TOOL_CALLS][{name: 'write', arguments: {...}}]",
    read: "[TOOL_CALLS][{name: 'read', arguments: {...}}]",
    bash: "[TOOL_CALLS][{name: 'bash', arguments: {...}}]",
  },
};

/**
 * xAI Grok-optimized instructions
 */
export const XAI_INSTRUCTIONS: ToolInstructions = {
  format: `You can use tools to interact with the environment.
Format tool calls as JSON objects with name and parameters.
Be precise and efficient in your tool usage.`,
  commands: {
    write: "Use write tool with file path and content",
    read: "Use read tool with file path",
    bash: "Use bash tool with command string",
  },
};

// =============================================================================
// Instruction Selection
// =============================================================================

/**
 * Get instructions for a specific model
 */
export function getInstructionsForModel(
  modelId: string,
  provider?: string
): ToolInstructions {
  const modelLower = modelId.toLowerCase();

  // Check provider first
  if (provider) {
    switch (provider.toLowerCase()) {
      case "anthropic":
        return ANTHROPIC_INSTRUCTIONS;
      case "openai":
        return OPENAI_INSTRUCTIONS;
      case "google":
      case "gemini":
        return GOOGLE_INSTRUCTIONS;
      case "meta":
      case "llama":
        return META_INSTRUCTIONS;
      case "deepseek":
        return DEEPSEEK_INSTRUCTIONS;
      case "mistral":
        return MISTRAL_INSTRUCTIONS;
      case "xai":
        return XAI_INSTRUCTIONS;
    }
  }

  // Infer from model ID
  if (modelLower.includes("claude")) {
    return ANTHROPIC_INSTRUCTIONS;
  }
  if (modelLower.includes("gpt") || modelLower.includes("o1") || modelLower.includes("o3")) {
    return OPENAI_INSTRUCTIONS;
  }
  if (modelLower.includes("gemini") || modelLower.includes("palm")) {
    return GOOGLE_INSTRUCTIONS;
  }
  if (modelLower.includes("llama") || modelLower.includes("meta")) {
    return META_INSTRUCTIONS;
  }
  if (modelLower.includes("deepseek")) {
    return DEEPSEEK_INSTRUCTIONS;
  }
  if (modelLower.includes("mistral") || modelLower.includes("mixtral")) {
    return MISTRAL_INSTRUCTIONS;
  }
  if (modelLower.includes("grok")) {
    return XAI_INSTRUCTIONS;
  }

  // Default to base instructions
  return BASE_INSTRUCTIONS;
}

/**
 * Check if a task requires file operations
 */
export function taskRequiresFileOps(
  systemPrompt: string,
  userMessages: Array<{ content: string }>
): boolean {
  const allText = [
    systemPrompt,
    ...userMessages.map((m) => m.content),
  ].join(" ").toLowerCase();

  const fileOpsKeywords = [
    "read",
    "write",
    "edit",
    "modify",
    "create file",
    "open file",
    "save",
    "update file",
    "change file",
    "file content",
    "code",
    "implement",
    "fix",
    "refactor",
  ];

  return fileOpsKeywords.some((keyword) => allText.includes(keyword));
}

/**
 * Format instructions for output
 */
export function formatInstructions(
  instructions: ToolInstructions,
  includeXmlInstructions = false
): string {
  let formatted = instructions.format;

  if (instructions.emphasis) {
    formatted += `\n\n${instructions.emphasis}`;
  }

  if (instructions.examples) {
    formatted += `\n\nExamples:\n${instructions.examples}`;
  }

  if (includeXmlInstructions) {
    formatted += `\n\nFor structured output, you may use XML tags:
<thinking>Your reasoning here</thinking>
<result>Final output</result>`;
  }

  return formatted;
}

// =============================================================================
// Parallel Execution
// =============================================================================

/**
 * Parallel execution instructions
 */
export const PARALLEL_EXECUTION_INSTRUCTIONS = `
═══════════════════════════════════════════════════════════════
CRITICAL: Concurrent Execution System
═══════════════════════════════════════════════════════════════

This system supports parallel agent execution via CLI subprocesses and
ReasoningBank coordination. Follow these patterns for optimal performance:

1. SUBPROCESS SPAWNING
   When decomposing tasks, spawn subagents via CLI:

   \`\`\`typescript
   const results = await Promise.all([
     exec('npx agentic-flow --agent researcher --task "analyze security"'),
     exec('npx agentic-flow --agent coder --task "implement features"'),
     exec('npx agentic-flow --agent tester --task "create tests"')
   ]);
   \`\`\`

2. REASONINGBANK COORDINATION
   Each subagent stores results in ReasoningBank:

   \`\`\`typescript
   // Subagent stores results
   await reasoningBank.storePattern({
     sessionId: 'swarm/task-123/agent-1',
     task: 'Research security patterns',
     output: findings,
     reward: 0.95,
     success: true
   });

   // Parent retrieves all results
   const allResults = await reasoningBank.searchPatterns('swarm/task-123');
   \`\`\`

3. PERFORMANCE BENEFITS
   - 2.8-4.4x speedup with parallel execution
   - 50-70% time reduction with QUIC transport
   - 32.3% token reduction via batching

═══════════════════════════════════════════════════════════════
`;

// =============================================================================
// Model Capabilities
// =============================================================================

/**
 * Get max tokens for a model
 */
export function getMaxTokensForModel(
  modelId: string,
  requestedMaxTokens?: number
): number {
  const modelLower = modelId.toLowerCase();

  // Model-specific limits
  const limits: Record<string, number> = {
    "claude-opus-4": 32768,
    "claude-sonnet-4": 16384,
    "claude-3.5-sonnet": 8192,
    "claude-3-opus": 4096,
    "gpt-4o": 16384,
    "gpt-4-turbo": 4096,
    "gpt-4": 4096,
    "gpt-3.5": 4096,
    "o1": 100000,
    "o3": 100000,
    "gemini-2.0": 8192,
    "gemini-1.5-pro": 8192,
    "gemini-1.5-flash": 8192,
    "llama-3.3": 4096,
    "llama-3.1": 4096,
    "deepseek-v3": 8192,
    "deepseek-coder": 8192,
    "mistral-large": 8192,
    "mixtral": 4096,
    "grok-2": 8192,
  };

  // Find matching limit
  let maxTokens = 4096; // Default
  for (const [pattern, limit] of Object.entries(limits)) {
    if (modelLower.includes(pattern.toLowerCase())) {
      maxTokens = limit;
      break;
    }
  }

  // Apply requested limit if lower
  if (requestedMaxTokens && requestedMaxTokens < maxTokens) {
    return requestedMaxTokens;
  }

  return maxTokens;
}

/**
 * Get parallel execution capabilities for a model
 */
export function getParallelCapabilities(modelId: string): ParallelCapabilities {
  const modelLower = modelId.toLowerCase();

  // High-capability models
  if (
    modelLower.includes("claude-opus") ||
    modelLower.includes("gpt-4o") ||
    modelLower.includes("o1") ||
    modelLower.includes("o3") ||
    modelLower.includes("gemini-2.0") ||
    modelLower.includes("deepseek-v3")
  ) {
    return {
      maxConcurrency: 8,
      recommendedBatchSize: 10,
      supportsSubprocesses: true,
      supportsReasoningBank: true,
    };
  }

  // Medium-capability models
  if (
    modelLower.includes("claude-sonnet") ||
    modelLower.includes("gpt-4-turbo") ||
    modelLower.includes("gemini-1.5-pro") ||
    modelLower.includes("llama-3.3")
  ) {
    return {
      maxConcurrency: 4,
      recommendedBatchSize: 5,
      supportsSubprocesses: true,
      supportsReasoningBank: true,
    };
  }

  // Basic models
  return {
    maxConcurrency: 2,
    recommendedBatchSize: 3,
    supportsSubprocesses: false,
    supportsReasoningBank: true,
  };
}

/**
 * Build full instructions for a model
 */
export function buildInstructions(
  modelId: string,
  provider: string | undefined,
  options?: InstructionOptions
): string {
  const baseInstructions = getInstructionsForModel(modelId, provider);
  let instructions = formatInstructions(
    baseInstructions,
    options?.includeXmlInstructions
  );

  // Add parallel execution instructions if enabled
  if (options?.enableParallel) {
    instructions += PARALLEL_EXECUTION_INSTRUCTIONS;

    const capabilities = getParallelCapabilities(modelId);
    instructions += `\nModel Capabilities:
- Max Concurrency: ${capabilities.maxConcurrency}
- Recommended Batch Size: ${options.batchSize || capabilities.recommendedBatchSize}
- Subprocesses: ${capabilities.supportsSubprocesses ? "Supported" : "Not supported"}
- ReasoningBank: ${capabilities.supportsReasoningBank ? "Supported" : "Not supported"}
`;
  }

  // Add ReasoningBank instructions if enabled
  if (options?.enableReasoningBank) {
    instructions += `\n
ReasoningBank Integration:
- Store successful patterns with high rewards
- Query similar patterns before complex tasks
- Use session IDs to track conversation context
`;
  }

  return instructions;
}
