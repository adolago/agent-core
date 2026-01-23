export class ClaudeCodeWebServer {
  constructor(port?: number);
  start(): Promise<void>;
  stop(): Promise<void>;
  handleRequest(req: unknown, res: unknown): void;
}
