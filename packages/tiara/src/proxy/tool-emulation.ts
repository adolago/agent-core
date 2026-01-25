/**
 * Tool Emulation Layer
 *
 * Enables function calling on models without native tool support.
 * Implements ReAct and Prompt-based strategies.
 *
 * Ported from claude-flow v3 @agentic-flow/proxy
 *
 * @module tiara/proxy/tool-emulation
 */

import type { Tool, ToolCall, EmulationResult } from "./types.js";

// =============================================================================
// ReAct Pattern Emulator
// =============================================================================

/**
 * ReAct Pattern Implementation
 *
 * Best for: Models with 32k+ context, complex multi-step tasks.
 * Uses Thought → Action → Observation loop.
 *
 * @example
 * const emulator = new ReActEmulator(tools);
 * const prompt = emulator.buildPrompt('Find and fix the bug');
 * const response = await model.generate(prompt);
 * const parsed = emulator.parseResponse(response);
 *
 * if (parsed.toolCall) {
 *   const result = await executeTool(parsed.toolCall);
 *   const nextPrompt = emulator.appendObservation(prompt, result);
 *   // Continue loop...
 * }
 */
export class ReActEmulator {
  private tools: Tool[];

  constructor(tools: Tool[]) {
    this.tools = tools;
  }

  /**
   * Build ReAct prompt with tool catalog
   */
  buildPrompt(userMessage: string, previousSteps?: string): string {
    const toolCatalog = this.tools
      .map((tool) => {
        const params = tool.input_schema?.properties
          ? Object.entries(tool.input_schema.properties)
              .map(([name, prop]) => `  - ${name}: ${prop.description || prop.type}`)
              .join("\n")
          : "  (no parameters)";

        return `## ${tool.name}
${tool.description || "No description"}
Parameters:
${params}`;
      })
      .join("\n\n");

    const reactInstructions = `You are an AI assistant that can use tools to accomplish tasks.

## Available Tools

${toolCatalog}

## Response Format

You must respond in one of these formats:

### When you need to use a tool:
\`\`\`
Thought: [Your reasoning about what to do next]
Action: [tool_name]
Action Input: {"param1": "value1", "param2": "value2"}
\`\`\`

### When you have the final answer:
\`\`\`
Thought: [Your reasoning about why you're done]
Final Answer: [Your final response to the user]
\`\`\`

## Rules
1. Always start with a Thought
2. Use only the tools listed above
3. Action Input must be valid JSON
4. After receiving an Observation, continue with another Thought
5. When you have enough information, provide a Final Answer

${previousSteps ? `## Previous Steps\n${previousSteps}\n` : ""}
## User Request
${userMessage}

## Your Response`;

    return reactInstructions;
  }

  /**
   * Parse ReAct response and extract tool calls
   */
  parseResponse(response: string): {
    toolCall?: ToolCall;
    thought?: string;
    finalAnswer?: string;
  } {
    const result: {
      toolCall?: ToolCall;
      thought?: string;
      finalAnswer?: string;
    } = {};

    // Extract thought
    const thoughtMatch = response.match(/Thought:\s*(.+?)(?=Action:|Final Answer:|$)/s);
    if (thoughtMatch) {
      result.thought = thoughtMatch[1].trim();
    }

    // Check for final answer
    const finalAnswerMatch = response.match(/Final Answer:\s*(.+?)$/s);
    if (finalAnswerMatch) {
      result.finalAnswer = finalAnswerMatch[1].trim();
      return result;
    }

    // Extract action
    const actionMatch = response.match(/Action:\s*(\w+)/);
    const actionInputMatch = response.match(/Action Input:\s*(\{[\s\S]*?\})/);

    if (actionMatch) {
      const toolName = actionMatch[1];

      let args: Record<string, unknown> = {};
      if (actionInputMatch) {
        try {
          args = JSON.parse(actionInputMatch[1]);
        } catch {
          // Try to extract JSON more aggressively
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              args = JSON.parse(jsonMatch[0]);
            } catch {
              // Keep empty args
            }
          }
        }
      }

      result.toolCall = {
        name: toolName,
        arguments: args,
        id: `call_${Date.now()}`,
      };
    }

    return result;
  }

  /**
   * Build prompt with observation after tool execution
   */
  appendObservation(previousPrompt: string, observation: string): string {
    return `${previousPrompt}

Observation: ${observation}

Continue with your next Thought:`;
  }
}

// =============================================================================
// Prompt-Based Emulator
// =============================================================================

/**
 * Prompt-Based Tool Emulation
 *
 * Best for: Simple tasks, models with limited context.
 * Uses direct JSON tool invocation.
 *
 * @example
 * const emulator = new PromptEmulator(tools);
 * const prompt = emulator.buildPrompt('Read the file config.json');
 * const response = await model.generate(prompt);
 * const parsed = emulator.parseResponse(response);
 */
export class PromptEmulator {
  private tools: Tool[];

  constructor(tools: Tool[]) {
    this.tools = tools;
  }

  /**
   * Build simple prompt for tool invocation
   */
  buildPrompt(userMessage: string): string {
    const toolList = this.tools
      .map((tool) => {
        const schema = tool.input_schema
          ? JSON.stringify(tool.input_schema, null, 2)
          : "{}";
        return `- ${tool.name}: ${tool.description || "No description"}\n  Schema: ${schema}`;
      })
      .join("\n\n");

    return `You can use the following tools by responding with JSON:

${toolList}

To use a tool, respond with:
\`\`\`json
{"tool": "tool_name", "args": {"param1": "value1"}}
\`\`\`

To respond without using a tool, just write your response normally.

User: ${userMessage}

Your response:`;
  }

  /**
   * Parse response - either tool call JSON or regular text
   */
  parseResponse(response: string): {
    toolCall?: ToolCall;
    textResponse?: string;
  } {
    // Try to extract JSON tool call
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.tool && typeof parsed.tool === "string") {
          return {
            toolCall: {
              name: parsed.tool,
              arguments: parsed.args || {},
              id: `call_${Date.now()}`,
            },
          };
        }
      } catch {
        // Not valid JSON
      }
    }

    // Try direct JSON parsing (without code block)
    const directJsonMatch = response.match(/\{"tool":\s*"[^"]+"/);
    if (directJsonMatch) {
      try {
        // Find the complete JSON object
        const startIdx = response.indexOf(directJsonMatch[0]);
        let depth = 0;
        let endIdx = startIdx;
        for (let i = startIdx; i < response.length; i++) {
          if (response[i] === "{") depth++;
          if (response[i] === "}") depth--;
          if (depth === 0) {
            endIdx = i + 1;
            break;
          }
        }
        const parsed = JSON.parse(response.slice(startIdx, endIdx));
        if (parsed.tool) {
          return {
            toolCall: {
              name: parsed.tool,
              arguments: parsed.args || {},
              id: `call_${Date.now()}`,
            },
          };
        }
      } catch {
        // Not valid JSON
      }
    }

    // No tool call found, return as text response
    return { textResponse: response.trim() };
  }
}

// =============================================================================
// Unified Tool Emulator
// =============================================================================

/**
 * Unified Tool Emulator
 *
 * Combines ReAct and Prompt-based strategies with automatic selection.
 *
 * @example
 * const emulator = new ToolEmulator(tools, 'react');
 *
 * const prompt = emulator.buildPrompt('Find all TODO comments');
 * const response = await model.generate(prompt);
 * const parsed = emulator.parseResponse(response);
 *
 * if (parsed.toolCall) {
 *   const valid = emulator.validateToolCall(parsed.toolCall);
 *   if (valid.valid) {
 *     const result = await executeTool(parsed.toolCall);
 *     const nextPrompt = emulator.appendObservation(prompt, result);
 *   }
 * }
 */
export class ToolEmulator {
  private tools: Tool[];
  private strategy: "react" | "prompt";
  private reactEmulator: ReActEmulator;
  private promptEmulator: PromptEmulator;

  constructor(tools: Tool[], strategy: "react" | "prompt" = "react") {
    this.tools = tools;
    this.strategy = strategy;
    this.reactEmulator = new ReActEmulator(tools);
    this.promptEmulator = new PromptEmulator(tools);
  }

  /**
   * Build prompt based on selected strategy
   */
  buildPrompt(
    userMessage: string,
    context?: { previousSteps?: string }
  ): string {
    if (this.strategy === "react") {
      return this.reactEmulator.buildPrompt(userMessage, context?.previousSteps);
    }
    return this.promptEmulator.buildPrompt(userMessage);
  }

  /**
   * Parse model response and extract tool calls
   */
  parseResponse(response: string): {
    toolCall?: ToolCall;
    finalAnswer?: string;
    thought?: string;
    textResponse?: string;
  } {
    if (this.strategy === "react") {
      return this.reactEmulator.parseResponse(response);
    }
    return this.promptEmulator.parseResponse(response);
  }

  /**
   * Append observation (ReAct only)
   */
  appendObservation(prompt: string, observation: string): string {
    if (this.strategy === "react") {
      return this.reactEmulator.appendObservation(prompt, observation);
    }
    // For prompt strategy, rebuild with observation context
    return `${prompt}\n\nTool result: ${observation}\n\nContinue:`;
  }

  /**
   * Validate tool call against schema
   */
  validateToolCall(toolCall: ToolCall): {
    valid: boolean;
    errors?: string[];
  } {
    const tool = this.tools.find((t) => t.name === toolCall.name);
    if (!tool) {
      return { valid: false, errors: [`Unknown tool: ${toolCall.name}`] };
    }

    const errors: string[] = [];

    // Check required parameters
    if (tool.input_schema?.required) {
      for (const required of tool.input_schema.required) {
        if (!(required in toolCall.arguments)) {
          errors.push(`Missing required parameter: ${required}`);
        }
      }
    }

    // Basic type checking
    if (tool.input_schema?.properties) {
      for (const [name, prop] of Object.entries(tool.input_schema.properties)) {
        if (name in toolCall.arguments) {
          const value = toolCall.arguments[name];
          const expectedType = prop.type;

          let actualType = typeof value;
          if (Array.isArray(value)) actualType = "array";
          if (value === null) actualType = "null";

          // Map JS types to JSON Schema types
          const typeMap: Record<string, string> = {
            string: "string",
            number: "number",
            boolean: "boolean",
            object: "object",
            array: "array",
          };

          if (typeMap[actualType] !== expectedType && expectedType !== "any") {
            errors.push(
              `Parameter ${name}: expected ${expectedType}, got ${actualType}`
            );
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Get confidence score for emulation result
   */
  getConfidence(
    parsed: ReturnType<typeof this.parseResponse>
  ): number {
    let confidence = 0;

    if (parsed.finalAnswer) {
      // Final answer is generally high confidence
      confidence = 0.9;
    } else if (parsed.toolCall) {
      // Tool call confidence based on validation
      const validation = this.validateToolCall(parsed.toolCall);
      confidence = validation.valid ? 0.85 : 0.5;

      // Boost for having thought/reasoning
      if (parsed.thought) {
        confidence = Math.min(1.0, confidence + 0.1);
      }
    } else if (parsed.textResponse) {
      // Plain text response
      confidence = 0.7;
    }

    return confidence;
  }

  /**
   * Get the selected strategy
   */
  getStrategy(): "react" | "prompt" {
    return this.strategy;
  }

  /**
   * Get tools
   */
  getTools(): Tool[] {
    return [...this.tools];
  }
}

// =============================================================================
// Emulation Execution
// =============================================================================

/**
 * Execute tool emulation loop
 *
 * @example
 * const result = await executeEmulation(
 *   emulator,
 *   'Find files with TODO comments and count them',
 *   async (prompt) => model.generate(prompt),
 *   async (toolCall) => executeTool(toolCall),
 *   { maxIterations: 5, verbose: true }
 * );
 */
export async function executeEmulation(
  emulator: ToolEmulator,
  userMessage: string,
  modelCall: (prompt: string) => Promise<string>,
  toolExecutor: (toolCall: ToolCall) => Promise<unknown>,
  options?: {
    maxIterations?: number;
    verbose?: boolean;
  }
): Promise<EmulationResult> {
  const maxIterations = options?.maxIterations ?? 10;
  const verbose = options?.verbose ?? false;

  const toolCalls: ToolCall[] = [];
  const reasoningSteps: string[] = [];

  let currentPrompt = emulator.buildPrompt(userMessage);
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;

    if (verbose) {
      console.log(`\n[Iteration ${iteration}]`);
    }

    // Get model response
    const response = await modelCall(currentPrompt);
    const parsed = emulator.parseResponse(response);

    // Record reasoning
    if (parsed.thought) {
      reasoningSteps.push(parsed.thought);
      if (verbose) {
        console.log(`Thought: ${parsed.thought}`);
      }
    }

    // Check for final answer
    if (parsed.finalAnswer) {
      if (verbose) {
        console.log(`Final Answer: ${parsed.finalAnswer}`);
      }

      return {
        toolCalls,
        reasoning: reasoningSteps.join("\n"),
        finalAnswer: parsed.finalAnswer,
        confidence: emulator.getConfidence(parsed),
      };
    }

    // Check for tool call
    if (parsed.toolCall) {
      toolCalls.push(parsed.toolCall);

      if (verbose) {
        console.log(`Tool: ${parsed.toolCall.name}`);
        console.log(`Args: ${JSON.stringify(parsed.toolCall.arguments)}`);
      }

      // Validate tool call
      const validation = emulator.validateToolCall(parsed.toolCall);
      if (!validation.valid) {
        const errorMsg = `Tool call validation failed: ${validation.errors?.join(", ")}`;
        currentPrompt = emulator.appendObservation(currentPrompt, errorMsg);
        continue;
      }

      // Execute tool
      try {
        const result = await toolExecutor(parsed.toolCall);
        const observation =
          typeof result === "string" ? result : JSON.stringify(result);

        if (verbose) {
          console.log(`Observation: ${observation}`);
        }

        currentPrompt = emulator.appendObservation(currentPrompt, observation);
      } catch (error) {
        const errorMsg = `Tool execution failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`;
        currentPrompt = emulator.appendObservation(currentPrompt, errorMsg);
      }
    } else if (parsed.textResponse) {
      // No tool call and no final answer - treat text response as final
      return {
        toolCalls,
        reasoning: reasoningSteps.join("\n"),
        finalAnswer: parsed.textResponse,
        confidence: emulator.getConfidence(parsed),
      };
    } else {
      // No useful output - break to avoid infinite loop
      break;
    }
  }

  // Max iterations reached
  return {
    toolCalls,
    reasoning: reasoningSteps.join("\n"),
    finalAnswer: undefined,
    confidence: 0.3, // Low confidence when max iterations hit
  };
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a ReAct emulator
 */
export function createReActEmulator(tools: Tool[]): ReActEmulator {
  return new ReActEmulator(tools);
}

/**
 * Create a prompt-based emulator
 */
export function createPromptEmulator(tools: Tool[]): PromptEmulator {
  return new PromptEmulator(tools);
}

/**
 * Create a unified tool emulator
 */
export function createToolEmulator(
  tools: Tool[],
  strategy: "react" | "prompt" = "react"
): ToolEmulator {
  return new ToolEmulator(tools, strategy);
}
