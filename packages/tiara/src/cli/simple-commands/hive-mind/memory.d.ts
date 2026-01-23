export class CollectiveMemory {
  constructor(config?: Record<string, unknown>);
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  getAdvancedAnalytics(): Record<string, unknown>;
  healthCheck(): Promise<Record<string, unknown>>;
  compress(): Promise<void>;
  learnPatterns(): Promise<unknown>;
}

export class MemoryOptimizer {
  constructor(memory: CollectiveMemory);
  optimize(): Promise<unknown>;
}
