export interface LegacyMigrationSummary {
  memoryEntries: number;
  reasoningBankEntries: number;
  persistenceAgents: number;
  persistenceTasks: number;
  deleted: string[];
  errors: Array<{ source: string; error: string }>;
}

export interface LegacyMigrationOptions {
  store?: {
    store: (
      key: string,
      value: unknown,
      options?: { namespace?: string; metadata?: Record<string, unknown> },
    ) => Promise<unknown>;
  };
  persistence?: unknown;
  dryRun?: boolean;
  deleteSources?: boolean;
  includePersistence?: boolean;
  includeReasoningBank?: boolean;
  includeSqlite?: boolean;
}

export function migrateLegacyMemory(options?: LegacyMigrationOptions): Promise<LegacyMigrationSummary>;

export default migrateLegacyMemory;
