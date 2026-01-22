#!/usr/bin/env npx ts-node
/**
 * Migration Script: Tiara SQLite → Agent-Core
 *
 * Migrates memory and neural patterns from Tiara's local SQLite
 * to Agent-Core's centralized Qdrant storage.
 *
 * What gets migrated:
 * - memory table → agent-core /memory/store (semantic data)
 * - neural_patterns table → agent-core /memory/store (patterns namespace)
 *
 * What stays in SQLite (operational):
 * - swarms, agents, tasks, communications, consensus, metrics
 *
 * Usage:
 *   npx ts-node scripts/migrate-to-agent-core.ts [options]
 *
 * Options:
 *   --dry-run         Show what would be migrated without making changes
 *   --batch-size N    Number of entries per batch (default: 100)
 *   --daemon-url URL  Agent-core daemon URL (default: http://127.0.0.1:3210)
 *   --db-path PATH    SQLite database path (auto-detected if not specified)
 *   --verify          Verify migration by searching for migrated entries
 *   --cleanup         Delete SQLite entries after successful migration
 */

import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import fsSync from 'fs';
import { AgentCoreClient, TiaraNamespaces } from '../src/hive-mind/integration/AgentCoreClient.js';

// Types
interface SQLiteMemoryEntry {
  key: string;
  namespace: string;
  value: string;
  ttl: number | null;
  access_count: number;
  created_at: string;
  metadata: string | null;
}

interface SQLiteNeuralPattern {
  id: string;
  swarm_id: string;
  pattern_type: string;
  pattern_data: string;
  confidence: number;
  usage_count: number;
  success_rate: number;
  created_at: string;
  metadata: string | null;
}

interface MigrationStats {
  memoryEntries: number;
  neuralPatterns: number;
  memoryMigrated: number;
  patternsMigrated: number;
  errors: string[];
  startTime: number;
  endTime?: number;
}

// Resolve Hive Mind data directory
function resolveHiveMindDataDir(): string {
  const localDir = path.join(process.cwd(), '.hive-mind');
  if (fsSync.existsSync(localDir)) {
    return localDir;
  }

  const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(dataHome, 'agent-core', 'tiara', 'hive-mind');
}

// Parse command line arguments
function parseArgs(): {
  dryRun: boolean;
  batchSize: number;
  daemonUrl: string;
  dbPath: string;
  verify: boolean;
  cleanup: boolean;
} {
  const args = process.argv.slice(2);
  const result = {
    dryRun: false,
    batchSize: 100,
    daemonUrl: 'http://127.0.0.1:3210',
    dbPath: path.join(resolveHiveMindDataDir(), 'hive-mind.db'),
    verify: false,
    cleanup: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--batch-size':
        result.batchSize = parseInt(args[++i], 10);
        break;
      case '--daemon-url':
        result.daemonUrl = args[++i];
        break;
      case '--db-path':
        result.dbPath = args[++i];
        break;
      case '--verify':
        result.verify = true;
        break;
      case '--cleanup':
        result.cleanup = true;
        break;
      case '--help':
        console.log(`
Migration Script: Tiara SQLite → Agent-Core

Usage:
  npx ts-node scripts/migrate-to-agent-core.ts [options]

Options:
  --dry-run         Show what would be migrated without making changes
  --batch-size N    Number of entries per batch (default: 100)
  --daemon-url URL  Agent-core daemon URL (default: http://127.0.0.1:3210)
  --db-path PATH    SQLite database path (auto-detected if not specified)
  --verify          Verify migration by searching for migrated entries
  --cleanup         Delete SQLite entries after successful migration
`);
        process.exit(0);
    }
  }

  return result;
}

// Map SQLite namespace to Tiara namespace
function mapNamespace(sqliteNamespace: string): string {
  const namespaceMap: Record<string, string> = {
    'hive-mind': TiaraNamespaces.SWARM_HISTORY,
    default: TiaraNamespaces.AGENT_STATE,
    learning: TiaraNamespaces.LEARNING,
    patterns: TiaraNamespaces.PATTERNS,
    decisions: TiaraNamespaces.DECISIONS,
    tasks: TiaraNamespaces.TASK_CONTEXT,
    consensus: TiaraNamespaces.CONSENSUS,
  };

  return namespaceMap[sqliteNamespace] || `tiara:${sqliteNamespace}`;
}

// Map pattern type to category
function mapPatternType(patternType: string): string {
  const typeMap: Record<string, string> = {
    coordination: 'pattern',
    optimization: 'pattern',
    prediction: 'insight',
    behavior: 'pattern',
  };

  return typeMap[patternType] || 'pattern';
}

// Main migration function
async function migrate() {
  const args = parseArgs();
  const stats: MigrationStats = {
    memoryEntries: 0,
    neuralPatterns: 0,
    memoryMigrated: 0,
    patternsMigrated: 0,
    errors: [],
    startTime: Date.now(),
  };

  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║     Tiara SQLite → Agent-Core Migration                       ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log();

  // Check database exists
  if (!fsSync.existsSync(args.dbPath)) {
    console.log(`Database not found at: ${args.dbPath}`);
    console.log('Nothing to migrate.');
    process.exit(0);
  }

  console.log(`Database: ${args.dbPath}`);
  console.log(`Daemon:   ${args.daemonUrl}`);
  console.log(`Dry run:  ${args.dryRun}`);
  console.log(`Batch:    ${args.batchSize}`);
  console.log();

  // Initialize agent-core client
  const client = new AgentCoreClient({ baseUrl: args.daemonUrl });

  // Check daemon health
  console.log('Checking agent-core daemon health...');
  try {
    const health = await client.checkHealth();
    if (!health.healthy) {
      console.error('Agent-core daemon is not healthy:', health.error);
      console.error('Please ensure agent-core daemon is running: agent-core daemon');
      process.exit(1);
    }
    console.log('✓ Agent-core daemon is healthy');
  } catch (error) {
    console.error('Cannot connect to agent-core daemon:', (error as Error).message);
    console.error('Please ensure agent-core daemon is running: agent-core daemon');
    process.exit(1);
  }

  // Dynamic import SQLite
  let db: any;
  try {
    const { createDatabase, isSQLiteAvailable } = await import('../src/memory/sqlite-wrapper.js');
    const available = await isSQLiteAvailable();
    if (!available) {
      console.error('SQLite is not available in this environment');
      process.exit(1);
    }
    db = await createDatabase(args.dbPath);
  } catch (error) {
    console.error('Failed to open SQLite database:', (error as Error).message);
    process.exit(1);
  }

  // Count entries
  try {
    const memoryCount = db.prepare('SELECT COUNT(*) as count FROM memory').get();
    const patternCount = db.prepare('SELECT COUNT(*) as count FROM neural_patterns').get();
    stats.memoryEntries = memoryCount?.count || 0;
    stats.neuralPatterns = patternCount?.count || 0;
  } catch (error) {
    console.error('Failed to count entries:', (error as Error).message);
    process.exit(1);
  }

  console.log();
  console.log('Found entries to migrate:');
  console.log(`  Memory entries:   ${stats.memoryEntries}`);
  console.log(`  Neural patterns:  ${stats.neuralPatterns}`);
  console.log();

  if (stats.memoryEntries === 0 && stats.neuralPatterns === 0) {
    console.log('Nothing to migrate.');
    process.exit(0);
  }

  if (args.dryRun) {
    console.log('DRY RUN - No changes will be made');
    console.log();
  }

  // Migrate memory entries
  if (stats.memoryEntries > 0) {
    console.log('Migrating memory entries...');

    const memoryEntries: SQLiteMemoryEntry[] = db
      .prepare('SELECT * FROM memory ORDER BY created_at')
      .all();

    // Process in batches
    for (let i = 0; i < memoryEntries.length; i += args.batchSize) {
      const batch = memoryEntries.slice(i, i + args.batchSize);
      const transformedBatch = batch.map((entry) => {
        let parsedMetadata: Record<string, any> = {};
        try {
          parsedMetadata = entry.metadata ? JSON.parse(entry.metadata) : {};
        } catch {
          // Ignore parse errors
        }

        return {
          category: 'note' as const,
          content: entry.value,
          namespace: mapNamespace(entry.namespace),
          metadata: {
            importance: 0.5,
            extra: {
              source: 'tiara-migration',
              originalKey: entry.key,
              originalNamespace: entry.namespace,
              accessCount: entry.access_count,
              migratedAt: new Date().toISOString(),
              ...parsedMetadata,
            },
          },
        };
      });

      if (!args.dryRun) {
        try {
          await client.storeMemoryBatch(transformedBatch);
          stats.memoryMigrated += batch.length;
        } catch (error) {
          const errMsg = `Failed to migrate memory batch ${i}-${i + batch.length}: ${(error as Error).message}`;
          stats.errors.push(errMsg);
          console.error(`  ✗ ${errMsg}`);
        }
      } else {
        stats.memoryMigrated += batch.length;
      }

      // Progress
      const progress = Math.min(i + args.batchSize, memoryEntries.length);
      process.stdout.write(`  Progress: ${progress}/${memoryEntries.length}\r`);
    }
    console.log(`  ✓ Migrated ${stats.memoryMigrated}/${stats.memoryEntries} memory entries`);
  }

  // Migrate neural patterns
  if (stats.neuralPatterns > 0) {
    console.log('Migrating neural patterns...');

    const patterns: SQLiteNeuralPattern[] = db
      .prepare('SELECT * FROM neural_patterns ORDER BY created_at')
      .all();

    for (let i = 0; i < patterns.length; i += args.batchSize) {
      const batch = patterns.slice(i, i + args.batchSize);
      const transformedBatch = batch.map((pattern) => {
        let parsedMetadata: Record<string, any> = {};
        try {
          parsedMetadata = pattern.metadata ? JSON.parse(pattern.metadata) : {};
        } catch {
          // Ignore parse errors
        }

        return {
          category: mapPatternType(pattern.pattern_type) as 'pattern' | 'insight',
          content: pattern.pattern_data,
          namespace: TiaraNamespaces.PATTERNS,
          metadata: {
            importance: pattern.confidence,
            extra: {
              source: 'tiara-migration',
              patternId: pattern.id,
              swarmId: pattern.swarm_id,
              patternType: pattern.pattern_type,
              usageCount: pattern.usage_count,
              successRate: pattern.success_rate,
              migratedAt: new Date().toISOString(),
              ...parsedMetadata,
            },
          },
        };
      });

      if (!args.dryRun) {
        try {
          await client.storeMemoryBatch(transformedBatch);
          stats.patternsMigrated += batch.length;
        } catch (error) {
          const errMsg = `Failed to migrate patterns batch ${i}-${i + batch.length}: ${(error as Error).message}`;
          stats.errors.push(errMsg);
          console.error(`  ✗ ${errMsg}`);
        }
      } else {
        stats.patternsMigrated += batch.length;
      }

      // Progress
      const progress = Math.min(i + args.batchSize, patterns.length);
      process.stdout.write(`  Progress: ${progress}/${patterns.length}\r`);
    }
    console.log(`  ✓ Migrated ${stats.patternsMigrated}/${stats.neuralPatterns} neural patterns`);
  }

  // Verification
  if (args.verify && !args.dryRun) {
    console.log();
    console.log('Verifying migration...');

    try {
      // Search for migrated entries
      const learningResults = await client.searchMemory({
        query: 'tiara-migration',
        namespace: TiaraNamespaces.LEARNING,
        limit: 5,
      });

      const patternResults = await client.searchMemory({
        query: 'tiara-migration',
        namespace: TiaraNamespaces.PATTERNS,
        limit: 5,
      });

      const historyResults = await client.searchMemory({
        query: 'tiara-migration',
        namespace: TiaraNamespaces.SWARM_HISTORY,
        limit: 5,
      });

      const totalFound = learningResults.length + patternResults.length + historyResults.length;

      if (totalFound > 0) {
        console.log(`  ✓ Verification passed: Found ${totalFound} migrated entries in agent-core`);
        console.log(`    - Learning: ${learningResults.length}`);
        console.log(`    - Patterns: ${patternResults.length}`);
        console.log(`    - History:  ${historyResults.length}`);
      } else {
        console.log('  ⚠ No migrated entries found in agent-core (may need time to index)');
      }
    } catch (error) {
      console.error(`  ✗ Verification failed: ${(error as Error).message}`);
    }
  }

  // Cleanup (optional)
  if (args.cleanup && !args.dryRun && stats.errors.length === 0) {
    console.log();
    console.log('Cleaning up SQLite entries...');

    try {
      db.prepare('DELETE FROM memory').run();
      db.prepare('DELETE FROM neural_patterns').run();
      console.log('  ✓ SQLite entries cleaned up');
    } catch (error) {
      console.error(`  ✗ Cleanup failed: ${(error as Error).message}`);
    }
  }

  // Summary
  stats.endTime = Date.now();
  const duration = ((stats.endTime - stats.startTime) / 1000).toFixed(2);

  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Migration Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Memory migrated:    ${stats.memoryMigrated}/${stats.memoryEntries}`);
  console.log(`  Patterns migrated:  ${stats.patternsMigrated}/${stats.neuralPatterns}`);
  console.log(`  Errors:             ${stats.errors.length}`);
  console.log(`  Duration:           ${duration}s`);
  console.log();

  if (stats.errors.length > 0) {
    console.log('Errors:');
    stats.errors.forEach((err) => console.log(`  - ${err}`));
    console.log();
    process.exit(1);
  }

  if (args.dryRun) {
    console.log('DRY RUN completed. No changes were made.');
    console.log('Run without --dry-run to perform actual migration.');
  } else {
    console.log('Migration completed successfully!');
  }
}

// Run migration
migrate().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
