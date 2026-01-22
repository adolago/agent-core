/**
 * Agent-Core Daemon Client
 * HTTP client for communicating with agent-core daemon API
 * Replaces direct Claude Code CLI spawning
 */

import type {
  AgentCoreClientConfig,
  PersonaId,
  PromptCallbacks,
  PromptOptions,
  PromptResult,
  Session,
  SessionCreateOptions,
  SPARCExecuteOptions,
  SPARCExecuteResult,
  SPARC_PERSONA_MAP,
  UsageInfo,
} from "./types.js";

// Default configuration
const DEFAULT_CONFIG: Required<AgentCoreClientConfig> = {
  baseUrl: process.env.AGENT_CORE_URL || "http://127.0.0.1:3210",
  timeoutMs: 120000,
  maxRetries: 3,
  initialRetryDelayMs: 1000,
};

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 5,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  timeoutMs: 5000,
};

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if agent-core daemon is running
 */
async function isDaemonRunning(baseUrl: string): Promise<boolean> {
  const { maxRetries, initialDelayMs, maxDelayMs, timeoutMs } = RETRY_CONFIG;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const resp = await fetch(`${baseUrl}/session`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (resp.ok) {
        return true;
      }
    } catch {
      if (attempt < maxRetries - 1) {
        const delay = Math.min(initialDelayMs * Math.pow(2, attempt), maxDelayMs);
        await sleep(delay);
      }
    }
  }

  return false;
}

/**
 * Agent-Core Daemon Client
 */
export class AgentCoreClient {
  private config: Required<AgentCoreClientConfig>;
  private sessions: Map<string, Session> = new Map();

  constructor(config: AgentCoreClientConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get the base URL
   */
  get baseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Check if daemon is running
   */
  async isDaemonRunning(): Promise<boolean> {
    return isDaemonRunning(this.config.baseUrl);
  }

  /**
   * Ensure the daemon is running
   */
  async ensureConnected(): Promise<void> {
    const running = await this.isDaemonRunning();
    if (!running) {
      throw new Error(
        `agent-core daemon not running at ${this.config.baseUrl}. ` +
          `Start it with: agent-core daemon`
      );
    }
  }

  /**
   * Create a new session
   */
  async createSession(options: SessionCreateOptions = {}): Promise<Session> {
    await this.ensureConnected();

    const response = await fetch(`${this.config.baseUrl}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: options.title }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.statusText}`);
    }

    const session = (await response.json()) as Session;
    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const response = await fetch(`${this.config.baseUrl}/session/${sessionId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error(`Failed to delete session: ${response.statusText}`);
    }

    this.sessions.delete(sessionId);
  }

  /**
   * Call an MCP tool via the agent-core daemon
   */
  async callMcpTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown> = {},
  ): Promise<unknown> {
    await this.ensureConnected();

    const response = await fetch(
      `${this.config.baseUrl}/mcp/${encodeURIComponent(serverName)}/tool`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: toolName, arguments: args }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MCP tool call failed: ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Send a prompt to a session with persona routing
   */
  async prompt(options: PromptOptions, callbacks?: PromptCallbacks): Promise<PromptResult> {
    const { sessionId, prompt, persona = "zee", model, system, signal } = options;

    // Build request body
    const body: Record<string, unknown> = {
      parts: [{ type: "text", text: prompt }],
      agent: persona, // Persona routing
    };

    if (model) {
      body.model = model;
    }

    if (system) {
      body.system = system;
    }

    // Create abort controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    if (signal) {
      signal.addEventListener("abort", () => controller.abort());
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/session/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          text: "",
          tokenCount: 0,
          aborted: false,
          error: `Prompt failed: ${response.statusText} - ${errorText}`,
          toolCalls: [],
        };
      }

      const message = (await response.json()) as {
        parts: Array<{
          type: string;
          text?: string;
          tool?: string;
          callID?: string;
          state?: { output?: string };
        }>;
        info: {
          tokens?: {
            input?: number;
            output?: number;
            cache?: { read?: number; write?: number };
          };
        };
      };

      // Process response parts
      let fullText = "";
      const toolCalls: Array<{ name: string; result?: string }> = [];

      for (const part of message.parts) {
        if (part.type === "text" && part.text) {
          fullText += part.text;
          callbacks?.onText?.(part.text);
        } else if (part.type === "reasoning" && part.text) {
          callbacks?.onReasoning?.(part.text);
        } else if (part.type === "tool" && part.tool) {
          callbacks?.onToolStart?.(part.tool);
          toolCalls.push({
            name: part.tool,
            result: part.state?.output,
          });
          callbacks?.onToolEnd?.(part.tool, part.state?.output);
        }
      }

      // Calculate token count
      const usage: UsageInfo = {
        input: message.info.tokens?.input ?? 0,
        output: message.info.tokens?.output ?? 0,
        cacheRead: message.info.tokens?.cache?.read ?? 0,
        cacheWrite: message.info.tokens?.cache?.write ?? 0,
      };
      const tokenCount = (usage.input ?? 0) + (usage.output ?? 0);

      return {
        success: true,
        text: fullText,
        tokenCount,
        aborted: false,
        toolCalls,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (controller.signal.aborted) {
        return {
          success: false,
          text: "",
          tokenCount: 0,
          aborted: true,
          error: "Request aborted",
          toolCalls: [],
        };
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      callbacks?.onError?.(error instanceof Error ? error : new Error(errorMessage));

      return {
        success: false,
        text: "",
        tokenCount: 0,
        aborted: false,
        error: errorMessage,
        toolCalls: [],
      };
    }
  }

  /**
   * Abort a running session
   */
  async abort(sessionId: string): Promise<void> {
    const response = await fetch(`${this.config.baseUrl}/session/${sessionId}/abort`, {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Failed to abort session: ${response.statusText}`);
    }
  }

  /**
   * Summarize a session (compact context)
   */
  async summarize(sessionId: string): Promise<void> {
    const response = await fetch(`${this.config.baseUrl}/session/${sessionId}/summarize`, {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Failed to summarize session: ${response.statusText}`);
    }
  }

  /**
   * Execute a SPARC mode task
   * Routes to appropriate persona based on phase type
   */
  async executeSPARC(options: SPARCExecuteOptions): Promise<SPARCExecuteResult> {
    const { mode, task, context, callbacks, signal } = options;

    // Import the mapping (avoid circular dependency at top level)
    const { SPARC_PERSONA_MAP } = await import("./types.js");

    // Determine persona for this SPARC mode
    const persona: PersonaId = SPARC_PERSONA_MAP[mode] ?? SPARC_PERSONA_MAP["default"];

    // Create session for this SPARC execution
    const session = await this.createSession({
      title: `sparc-${mode}-${Date.now()}`,
    });

    try {
      // Build enhanced prompt with SPARC context
      const enhancedPrompt = buildSPARCPrompt(mode, task, context);

      // Execute via daemon
      const result = await this.prompt(
        {
          sessionId: session.id,
          prompt: enhancedPrompt,
          persona,
          signal,
        },
        callbacks
      );

      return {
        success: result.success,
        text: result.text,
        phase: mode,
        persona,
        tokenCount: result.tokenCount,
        error: result.error,
      };
    } finally {
      // Cleanup session
      try {
        await this.deleteSession(session.id);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Build SPARC-enhanced prompt
 */
function buildSPARCPrompt(
  mode: string,
  task: string,
  context?: Record<string, unknown>
): string {
  const contextStr = context ? `\n\nContext:\n${JSON.stringify(context, null, 2)}` : "";

  return `# SPARC Mode: ${mode}

## Task
${task}

## SPARC Methodology
You are executing within the SPARC (Specification, Pseudocode, Architecture, Refinement, Completion) methodology.

### Phase: ${mode}
${getPhaseInstructions(mode)}

### Guidelines
- Keep files under 500 lines
- Never hardcode secrets
- Document key decisions
- Follow test-driven development where applicable
${contextStr}

Proceed with the task following SPARC methodology.`;
}

/**
 * Get phase-specific instructions
 */
function getPhaseInstructions(mode: string): string {
  const instructions: Record<string, string> = {
    "spec-pseudocode":
      "Create detailed specifications and pseudocode. Focus on requirements, edge cases, and algorithmic thinking.",
    architect:
      "Design system architecture and component structure. Consider scalability, maintainability, and separation of concerns.",
    code: "Implement code solutions following best practices. Write clean, tested, documented code.",
    tdd: "Write tests first, then implement to pass them. Follow red-green-refactor cycle.",
    "refinement-optimization-mode":
      "Refactor and optimize existing code. Improve performance, readability, and maintainability.",
    "security-review":
      "Analyze code for security vulnerabilities. Check for OWASP top 10, input validation, auth issues.",
    integration:
      "Integrate components and verify complete solution. Ensure all parts work together.",
    debug:
      "Identify and fix issues in code. Use systematic debugging approaches. Document root causes.",
    "docs-writer":
      "Create clear, comprehensive documentation. Include examples and usage instructions.",
  };

  return instructions[mode] ?? "Execute the task following best practices.";
}

// Singleton instance
let clientInstance: AgentCoreClient | null = null;

/**
 * Get or create the agent-core client
 */
export function getAgentCoreClient(config?: AgentCoreClientConfig): AgentCoreClient {
  if (!clientInstance || config) {
    clientInstance = new AgentCoreClient(config);
  }
  return clientInstance;
}

/**
 * Create a new agent-core client
 */
export function createAgentCoreClient(config?: AgentCoreClientConfig): AgentCoreClient {
  return new AgentCoreClient(config);
}

// Re-export types
export * from "./types.js";
