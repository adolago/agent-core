import chalk from 'chalk';
/**
 * Memory management commands
 *
 * Backend: Qdrant (agent_memory collection by default)
 * Provides vector-friendly search and persistent storage via QdrantMemoryStore.
 */

import { Command } from '../commander-fix.js';
import { promises as fs } from 'node:fs';
import * as Table from 'cli-table3';
import { QdrantMemoryStore } from '../../memory/qdrant-kv-store.js';
import { QdrantPersistenceManager } from '../../core/qdrant-persistence.js';
import { migrateLegacyMemory } from '../../memory/legacy-migration.js';

interface MemoryEntry {
  key: string;
  value: string;
  namespace: string;
  timestamp: number;
  confidence?: number;
  usage_count?: number;
  created_at?: string;
  id?: string;
}

// Memory backend type
type MemoryBackend = 'qdrant';

function normalizeEntry(entry: any): MemoryEntry {
  let value = '';
  if (typeof entry?.value === 'string') {
    value = entry.value;
  } else {
    try {
      value = JSON.stringify(entry?.value ?? '');
    } catch {
      value = String(entry?.value ?? '');
    }
  }

  const timestamp =
    entry?.updatedAt ||
    entry?.createdAt ||
    entry?.timestamp ||
    entry?.created_at ||
    Date.now();

  const ts =
    typeof timestamp === 'number'
      ? timestamp
      : timestamp instanceof Date
        ? timestamp.getTime()
        : Date.parse(timestamp);

  return {
    key: entry?.key ?? '',
    value,
    namespace: entry?.namespace ?? 'default',
    timestamp: Number.isFinite(ts) ? ts : Date.now(),
    confidence: entry?.confidence,
    id: entry?.id,
  };
}

/**
 * Unified Memory Manager - Qdrant only
 */
export class UnifiedMemoryManager {
  private memoryStore: QdrantMemoryStore | null = null;
  private storeConfig: {
    url?: string;
    apiKey?: string;
    collection?: string;
    persistenceCollection?: string;
  } | null = null;

  private async getStore(): Promise<QdrantMemoryStore> {
    const injected = (this as any).store;
    if (injected && typeof injected !== 'function') {
      return injected as QdrantMemoryStore;
    }

    if (!this.memoryStore) {
      if (!this.storeConfig) {
        this.storeConfig = await loadMemoryConfig();
      }
      this.memoryStore = new QdrantMemoryStore(this.storeConfig);
      await this.memoryStore.initialize();
    }
    return this.memoryStore;
  }

  async store(key: string, value: string, namespace: string = 'default') {
    const store = await this.getStore();
    const result = await store.store(key, value, { namespace, metadata: { source: 'cli' } });
    const storedId = (result as { id?: string } | null | undefined)?.id;
    return { backend: 'qdrant' as MemoryBackend, id: storedId };
  }

  async query(search: string, namespace?: string, limit: number = 10) {
    const store = await this.getStore();
    const results = await store.search(search, { namespace, limit });
    return results.map(normalizeEntry);
  }

  async list(namespace?: string, limit: number = 10) {
    const store = await this.getStore();
    const entries = namespace ? await store.listAll({ namespace }) : await store.listAll();
    return entries.slice(0, limit).map(normalizeEntry);
  }

  async getStats() {
    const store = await this.getStore();
    const entries = await store.listAll();
    const namespaceStats: Record<string, number> = {};

    for (const entry of entries) {
      const ns = entry.namespace || 'default';
      namespaceStats[ns] = (namespaceStats[ns] || 0) + 1;
    }

    const sizeBytes = new TextEncoder().encode(JSON.stringify(entries)).length;

    return {
      backend: 'qdrant',
      totalEntries: entries.length,
      namespaces: Object.keys(namespaceStats).length,
      namespaceStats,
      sizeBytes,
      url: store.options?.url,
      collection: store.options?.collection,
    };
  }

  async exportData(filePath: string) {
    const store = await this.getStore();
    const entries = await store.listAll();
    const exportData: Record<string, any[]> = {};

    for (const entry of entries) {
      const ns = entry.namespace || 'default';
      if (!exportData[ns]) {
        exportData[ns] = [];
      }
      exportData[ns].push({
        key: entry.key,
        value: entry.value,
        namespace: ns,
        timestamp: entry.updatedAt ? new Date(entry.updatedAt).getTime() : Date.now(),
        metadata: entry.metadata || undefined,
      });
    }

    await fs.writeFile(filePath, JSON.stringify(exportData, null, 2));
  }

  async importData(filePath: string) {
    const content = await fs.readFile(filePath, 'utf8');
    const importData = JSON.parse(content);
    const store = await this.getStore();

    for (const [namespace, entries] of Object.entries(importData)) {
      for (const entry of entries as any[]) {
        await store.store(entry.key, entry.value, {
          namespace: entry.namespace || namespace,
          metadata: entry.metadata || {},
        });
      }
    }
  }

  async cleanup(daysOld: number = 30) {
    const store = await this.getStore();
    const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;
    const entries = await store.listAll();
    let removedCount = 0;

    for (const entry of entries) {
      const timestamp =
        entry.updatedAt || entry.createdAt || entry.timestamp || entry.created_at || Date.now();
      const ts =
        typeof timestamp === 'number'
          ? timestamp
          : timestamp instanceof Date
            ? timestamp.getTime()
            : Date.parse(timestamp);

      if (Number.isFinite(ts) && ts < cutoffTime) {
        await store.delete(entry.key, { namespace: entry.namespace || 'default' });
        removedCount++;
      }
    }

    return removedCount;
  }
}

async function loadMemoryConfig(): Promise<{
  url?: string;
  apiKey?: string;
  collection?: string;
  persistenceCollection?: string;
}> {
  try {
    const content = await fs.readFile('claude-flow.config.json', 'utf8');
    const config = JSON.parse(content);
    const memoryConfig = config?.memory || {};
    return {
      url: memoryConfig.url,
      apiKey: memoryConfig.apiKey,
      collection: memoryConfig.collection,
      persistenceCollection: memoryConfig.persistenceCollection,
    };
  } catch {
    return {};
  }
}

export class SimpleMemoryManager {
  private manager = new UnifiedMemoryManager();

  async store(key: string, value: string, namespace: string = 'default') {
    await this.manager.store(key, value, namespace);
  }

  async query(search: string, namespace?: string) {
    return await this.manager.query(search, namespace);
  }

  async getStats() {
    return await this.manager.getStats();
  }

  async exportData(filePath: string) {
    await this.manager.exportData(filePath);
  }

  async importData(filePath: string) {
    await this.manager.importData(filePath);
  }

  async cleanup(daysOld: number = 30) {
    return await this.manager.cleanup(daysOld);
  }
}

export const memoryCommand = new Command()
  .name('memory')
  .description('Manage persistent memory with Qdrant-backed storage')
  .action(() => {
    memoryCommand.help();
  });

// Store command
memoryCommand
  .command('store')
  .description('Store information in memory (Qdrant)')
  .arguments('<key> <value>')
  .option('-n, --namespace <namespace>', 'Target namespace', 'default')
  .action(async (key: string, value: string, options: any) => {
    try {
      const memory = new UnifiedMemoryManager();
      const result = await memory.store(key, value, options.namespace);
      console.log(chalk.green('✅ Stored successfully'));
      console.log(`📝 Key: ${key}`);
      console.log(`📦 Namespace: ${options.namespace}`);
      console.log(`💾 Size: ${new TextEncoder().encode(value).length} bytes`);
      if (result.id) {
        console.log(chalk.gray(`🆔 ID: ${result.id}`));
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to store:'), (error as Error).message);
    }
  });

// Query command
memoryCommand
  .command('query')
  .description('Search memory entries (Qdrant)')
  .arguments('<search>')
  .option('-n, --namespace <namespace>', 'Filter by namespace')
  .option('-l, --limit <limit>', 'Limit results', '10')
  .action(async (search: string, options: any) => {
    try {
      const memory = new UnifiedMemoryManager();
      const results = await memory.query(search, options.namespace, parseInt(options.limit));

      if (results.length === 0) {
        console.log(chalk.yellow('⚠️  No results found'));
        return;
      }

      console.log(chalk.green(`✅ Found ${results.length} results:\n`));

      for (const entry of results) {
        console.log(chalk.blue(`📌 ${entry.key}`));
        console.log(`   Namespace: ${entry.namespace}`);
        console.log(
          `   Value: ${entry.value.substring(0, 100)}${entry.value.length > 100 ? '...' : ''}`,
        );
        const timestamp = entry.created_at || entry.timestamp;
        if (timestamp) {
          const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
          console.log(`   Stored: ${date.toLocaleString()}`);
        }
        if (entry.confidence) {
          console.log(chalk.gray(`   Confidence: ${(entry.confidence * 100).toFixed(0)}%`));
        }
        console.log('');
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to query:'), (error as Error).message);
    }
  });

// List command
memoryCommand
  .command('list')
  .description('List all memory entries')
  .option('-n, --namespace <namespace>', 'Filter by namespace')
  .option('-l, --limit <limit>', 'Limit results', '10')
  .action(async (options: any) => {
    try {
      const memory = new UnifiedMemoryManager();
      const results = await memory.list(options.namespace, parseInt(options.limit));

      if (results.length === 0) {
        console.log(chalk.yellow('⚠️  No memories found'));
        return;
      }

      // Group by namespace
      const byNamespace: Record<string, MemoryEntry[]> = {};
      for (const entry of results) {
        if (!byNamespace[entry.namespace]) {
          byNamespace[entry.namespace] = [];
        }
        byNamespace[entry.namespace].push(entry);
      }

      console.log(chalk.green(`📊 Memory Bank (${results.length} entries):\n`));

      if (Object.keys(byNamespace).length === 0) {
        console.log(chalk.yellow('⚠️  No namespaces found'));
        return;
      }

      console.log(chalk.green('✅ Available namespaces:'));
      for (const [ns, entries] of Object.entries(byNamespace)) {
        console.log(`  ${ns} (${entries.length} entries)`);
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to list:'), (error as Error).message);
    }
  });

// Export command
memoryCommand
  .command('export')
  .description('Export memory to file')
  .arguments('<file>')
  .action(async (file: string, options: any) => {
    try {
      const memory = new UnifiedMemoryManager();
      await memory.exportData(file);
      const stats = await memory.getStats();
      console.log(chalk.green('✅ Memory exported successfully'));
      console.log(`📁 File: ${file}`);
      console.log(`📊 Entries: ${stats.totalEntries}`);
      if (stats.sizeBytes) {
        console.log(`💾 Size: ${(stats.sizeBytes / 1024).toFixed(2)} KB`);
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to export:'), (error as Error).message);
    }
  });

// Import command
memoryCommand
  .command('import')
  .description('Import memory from file')
  .arguments('<file>')
  .action(async (file: string, options: any) => {
    try {
      const memory = new UnifiedMemoryManager();
      await memory.importData(file);
      const stats = await memory.getStats();
      console.log(chalk.green('✅ Memory imported successfully'));
      console.log(`📁 File: ${file}`);
      console.log(`📊 Entries: ${stats.totalEntries}`);
      console.log(`🗂️  Namespaces: ${stats.namespaces}`);
    } catch (error) {
      console.error(chalk.red('❌ Failed to import:'), (error as Error).message);
    }
  });

// Migrate command
memoryCommand
  .command('migrate')
  .description('Migrate legacy memory stores into Qdrant')
  .option('--dry-run', 'Preview migration without writing or deleting')
  .option('--no-delete', 'Keep legacy files after migration')
  .option('--skip-sqlite', 'Skip migrating legacy SQLite memory stores')
  .option('--skip-persistence', 'Skip migrating agent/task persistence JSON')
  .option('--skip-reasoningbank', 'Skip migrating ReasoningBank SQLite')
  .action(async (options: any) => {
    try {
      const config = await loadMemoryConfig();
      const dryRun = Boolean(options.dryRun);
      const includePersistence = !options.skipPersistence;
      const includeReasoningBank = !options.skipReasoningbank;
      const includeSqlite = !options.skipSqlite;

      const store = dryRun ? undefined : new QdrantMemoryStore(config);
      if (store) {
        await store.initialize();
      }

      const persistence =
        !dryRun && includePersistence
          ? new QdrantPersistenceManager({
              collection: config.persistenceCollection,
              url: config.url,
              apiKey: config.apiKey,
            })
          : undefined;
      if (persistence) {
        await persistence.initialize();
      }

      const summary = await migrateLegacyMemory({
        store,
        persistence,
        dryRun,
        deleteSources: options.delete !== false,
        includePersistence,
        includeReasoningBank,
        includeSqlite,
      });

      const totalMemory = summary.memoryEntries + summary.reasoningBankEntries;
      console.log(chalk.green('✅ Legacy memory migration complete'));
      console.log(`📦 Memory entries migrated: ${totalMemory}`);
      if (!options.skipPersistence) {
        console.log(`🤖 Agents migrated: ${summary.persistenceAgents}`);
        console.log(`🧭 Tasks migrated: ${summary.persistenceTasks}`);
      }

      if (summary.deleted.length > 0) {
        console.log('🧹 Deleted legacy sources:');
        summary.deleted.forEach((item: string) => console.log(`   - ${item}`));
      } else if (options.delete === false) {
        console.log(chalk.gray('Legacy sources retained (--no-delete).'));
      }

      if (summary.errors.length > 0) {
        console.log(chalk.yellow('⚠️  Some sources could not be migrated:'));
        summary.errors.forEach((err: { source: string; error: string }) =>
          console.log(`   - ${err.source}: ${err.error}`),
        );
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to migrate:'), (error as Error).message);
    }
  });

// Stats command
memoryCommand
  .command('stats')
  .description('Show memory statistics and backend info')
  .action(async () => {
    try {
      const memory = new UnifiedMemoryManager();
      const stats = await memory.getStats();

      console.log(chalk.green('\n📊 Memory Bank Statistics:\n'));
      console.log(chalk.cyan(`   Backend: ${stats.backend}`));
      console.log(`   Total Entries: ${stats.totalEntries}`);
      console.log(`   Namespaces: ${stats.namespaces}`);

      if (stats.sizeBytes) {
        console.log(`   Size: ${(stats.sizeBytes / 1024).toFixed(2)} KB`);
      }

      if (stats.namespaceStats && Object.keys(stats.namespaceStats).length > 0) {
        console.log(chalk.blue('\n📁 Namespace Breakdown:'));
        for (const [namespace, count] of Object.entries(stats.namespaceStats)) {
          console.log(`   ${namespace}: ${count} entries`);
        }
      }

      if (stats.url) {
        console.log(chalk.gray(`\n   Qdrant URL: ${stats.url}`));
      }
      if (stats.collection) {
        console.log(chalk.gray(`   Collection: ${stats.collection}`));
      }

      console.log('');
    } catch (error) {
      console.error(chalk.red('❌ Failed to get stats:'), (error as Error).message);
    }
  });

// Cleanup command
memoryCommand
  .command('cleanup')
  .description('Clean up old entries')
  .option('-d, --days <days>', 'Entries older than n days', '30')
  .action(async (options: any) => {
    try {
      const memory = new UnifiedMemoryManager();
      const removed = await memory.cleanup(parseInt(options.days));
      console.log(chalk.green('✅ Cleanup completed'));
      console.log(`🗑️  Removed: ${removed} entries older than ${options.days} days`);
    } catch (error) {
      console.error(chalk.red('❌ Failed to cleanup:'), (error as Error).message);
    }
  });

// Vector Search alias (Qdrant)
memoryCommand
  .command('vector-search')
  .description('Alias for memory query (Qdrant search)')
  .arguments('<query>')
  .option('-k, --top <k>', 'Number of results', '10')
  .option('-t, --threshold <threshold>', 'Minimum similarity threshold (0-1)', '0.7')
  .option('-n, --namespace <namespace>', 'Filter by namespace')
  .option('-m, --metric <metric>', 'Distance metric (cosine, euclidean, dot)', 'cosine')
  .action(async (query: string, options: any) => {
    try {
      const memory = new UnifiedMemoryManager();
      const limit = parseInt(options.top, 10) || 10;
      const results = await memory.query(query, options.namespace, limit);

      if (results.length === 0) {
        console.log(chalk.yellow('⚠️  No results found'));
        return;
      }

      console.log(chalk.green(`✅ Found ${results.length} results:\n`));

      for (const entry of results) {
        console.log(chalk.blue(`📌 ${entry.key}`));
        console.log(`   Namespace: ${entry.namespace}`);
        console.log(
          `   Value: ${entry.value.substring(0, 100)}${entry.value.length > 100 ? '...' : ''}`,
        );
        console.log(`   Stored: ${new Date(entry.timestamp).toLocaleString()}`);
        console.log('');
      }
    } catch (error) {
      console.error(chalk.red('Failed to vector search:'), (error as Error).message);
    }
  });

// Vector store alias (Qdrant)
memoryCommand
  .command('store-vector')
  .description('Alias for memory store (Qdrant)')
  .arguments('<key> <value>')
  .option('-n, --namespace <namespace>', 'Target namespace', 'default')
  .option('-m, --metadata <metadata>', 'Additional metadata (JSON)')
  .action(async (key: string, value: string, options: any) => {
    try {
      const memory = new UnifiedMemoryManager();
      await memory.store(key, value, options.namespace);
      console.log(chalk.green('✅ Stored successfully'));
      console.log(`📝 Key: ${key}`);
      console.log(`📦 Namespace: ${options.namespace}`);
      if (options.metadata) {
        console.log(chalk.gray('ℹ️  Metadata is ignored in Qdrant CLI store'));
      }
    } catch (error) {
      console.error(chalk.red('Failed to store vector:'), (error as Error).message);
    }
  });

// Qdrant Info command
memoryCommand
  .command('agentdb-info')
  .description('Show Qdrant memory configuration')
  .action(async () => {
    try {
      const memory = new UnifiedMemoryManager();
      const stats = await memory.getStats();

      console.log(chalk.green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log(chalk.bold.cyan('  Qdrant Memory Configuration'));
      console.log(chalk.green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
      console.log(chalk.blue('📦 Backend:'));
      console.log(`   Type: ${stats.backend}`);
      console.log(`   URL: ${stats.url || 'http://localhost:6333'}`);
      console.log(`   Collection: ${stats.collection || 'agent_memory'}`);
      console.log('\n💡 Tip: Configure via claude-flow.config.json or MEMORY_QDRANT_* env vars.\n');
      console.log(chalk.green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
    } catch (error) {
      console.error(chalk.red('Failed to get Qdrant info:'), (error as Error).message);
    }
  });
