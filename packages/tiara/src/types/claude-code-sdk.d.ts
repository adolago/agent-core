declare module '@anthropic-ai/claude-code/sdk' {
  export interface McpSdkServerConfigWithInstance {
    name: string;
    transport: string;
    instance?: unknown;
  }

  export interface Options {
    mcpServers?: Record<string, McpSdkServerConfigWithInstance>;
    [key: string]: unknown;
  }

  export interface Query {
    on?: (event: string, handler: (...args: unknown[]) => void) => void;
    [key: string]: unknown;
    [Symbol.asyncIterator](): AsyncIterator<{ type: string; [key: string]: unknown }>;
  }

  export function query(args: { prompt: string; options?: Options }): Query;

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
