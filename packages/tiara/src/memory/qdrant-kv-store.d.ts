export interface QdrantMemoryStoreOptions {
  url?: string;
  apiKey?: string;
  collection?: string;
  persistenceCollection?: string;
  namespace?: string;
  [key: string]: unknown;
}

export class QdrantMemoryStore {
  constructor(options?: QdrantMemoryStoreOptions);
  options?: QdrantMemoryStoreOptions;
  initialize(): Promise<void>;
  store(
    key: string,
    value: unknown,
    options?: { namespace?: string; metadata?: Record<string, unknown>; embedding?: unknown },
  ): Promise<unknown>;
  retrieve(key: string, options?: { namespace?: string }): Promise<unknown>;
  list(options?: { namespace?: string; limit?: number }): Promise<any[]>;
  listAll(options?: { namespace?: string; limit?: number }): Promise<any[]>;
  search(query: string, options?: { namespace?: string; limit?: number }): Promise<any[]>;
  delete(key: string, options?: { namespace?: string }): Promise<boolean>;
  exportData(namespace?: string | null): Promise<Record<string, any[]>>;
  close(): void;
}

export default QdrantMemoryStore;
