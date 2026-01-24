declare module '@anthropic-ai/claude-code' {
  export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

  export interface McpSdkServerConfigWithInstance {
    name: string;
    transport?: string;
    instance?: unknown;
  }

  export interface Options {
    resume?: string;
    resumeSessionAt?: string;
    forkSession?: boolean;
    maxTurns?: number;
    timeout?: number;
    mcpServers?: Record<string, McpSdkServerConfigWithInstance>;
    model?: string;
    cwd?: string;
    [key: string]: unknown;
  }

  export interface SDKMessage {
    type: string;
    uuid?: string;
    message?: {
      content?: Array<{ type: string; name?: string; input?: unknown }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    [key: string]: unknown;
  }

  export interface ModelInfo {
    id?: string;
    name?: string;
    description?: string;
    [key: string]: unknown;
  }

  export interface Query extends AsyncIterable<SDKMessage> {
    on?: (event: string, handler: (...args: unknown[]) => void) => void;
    interrupt(): Promise<void>;
    setModel(model: string): Promise<void>;
    setPermissionMode(mode: PermissionMode): Promise<void>;
    supportedModels(): Promise<ModelInfo[]>;
  }

  export function query(args: { prompt: string; options?: Options }): Query;

  export function tool<TInput = unknown, TResult = unknown>(config: {
    name: string;
    description: string;
    parameters: unknown;
    execute: (input: TInput) => TResult | Promise<TResult>;
  }): unknown;

  export function tool(
    name: string,
    description: string,
    schema: unknown,
    handler: (args: unknown, extra: unknown) => unknown | Promise<unknown>,
  ): unknown;

  export function createSdkMcpServer(config: {
    name: string;
    version: string;
    tools: unknown[];
  }): McpSdkServerConfigWithInstance;
}
