#!/usr/bin/env npx ts-node
/**
 * Migration script: SQLite → Qdrant
 *
 * Migrates tiara's SQLite database to Qdrant for unified memory storage.
 *
 * Usage:
 *   npx ts-node scripts/migrate-to-qdrant.ts [options]
 *
 * Options:
 *   --sqlite-path <path>   Path to SQLite database (default: .swarm/memory.db)
 *   --qdrant-url <url>     Qdrant server URL (default: http://localhost:6333)
 *   --dry-run              Show what would be migrated without making changes
 *   --verbose              Show detailed progress
 */

import { promises as fs } from 'fs';
import path from 'path';

// Dynamic imports for optional dependencies
async function loadSqlite() {
  try {
    const Database = (await import('better-sqlite3')).default;
    return Database;
  } catch (e) {
    console.error('Error: better-sqlite3 is required for migration.');
    console.error('Install it with: npm install better-sqlite3');
    process.exit(1);
  }
}

import {
  QdrantCoordinationAdapter,
  QdrantConfig,
  DEFAULT_QDRANT_CONFIG,
} from '../src/adapters/qdrant-adapter.js';

// =============================================================================
// Configuration
// =============================================================================

interface MigrationConfig {
  sqlitePath: string;
  qdrantUrl: string;
  qdrantApiKey?: string;
  dryRun: boolean;
  verbose: boolean;
}

function parseArgs(): MigrationConfig {
  const args = process.argv.slice(2);
  const config: MigrationConfig = {
    sqlitePath: '.swarm/memory.db',
    qdrantUrl: DEFAULT_QDRANT_CONFIG.url,
    dryRun: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--sqlite-path':
        config.sqlitePath = args[++i];
        break;
      case '--qdrant-url':
        config.qdrantUrl = args[++i];
        break;
      case '--qdrant-api-key':
        config.qdrantApiKey = args[++i];
        break;
      case '--dry-run':
        config.dryRun = true;
        break;
      case '--verbose':
        config.verbose = true;
        break;
      case '--help':
        console.log(`
Migration script: SQLite → Qdrant

Usage:
  npx ts-node scripts/migrate-to-qdrant.ts [options]

Options:
  --sqlite-path <path>    Path to SQLite database (default: .swarm/memory.db)
  --qdrant-url <url>      Qdrant server URL (default: http://localhost:6333)
  --qdrant-api-key <key>  Qdrant API key (optional)
  --dry-run               Show what would be migrated without making changes
  --verbose               Show detailed progress
  --help                  Show this help message
`);
        process.exit(0);
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  return config;
}

// =============================================================================
// Migration Functions
// =============================================================================

interface MigrationStats {
  swarms: number;
  agents: number;
  tasks: number;
  events: number;
  memoryEntries: number;
  errors: string[];
}

class Migrator {
  private db: any;
  private qdrant: QdrantCoordinationAdapter;
  private config: MigrationConfig;
  private stats: MigrationStats = {
    swarms: 0,
    agents: 0,
    tasks: 0,
    events: 0,
    memoryEntries: 0,
    errors: [],
  };

  constructor(config: MigrationConfig) {
    this.config = config;
    this.qdrant = new QdrantCoordinationAdapter({
      url: config.qdrantUrl,
      apiKey: config.qdrantApiKey,
    });
  }

  private log(message: string, ...args: unknown[]) {
    if (this.config.verbose) {
      console.log(`[${new Date().toISOString()}] ${message}`, ...args);
    }
  }

  private logProgress(message: string) {
    console.log(`→ ${message}`);
  }

  async run(): Promise<MigrationStats> {
    console.log('\n🚀 Tiara SQLite → Qdrant Migration\n');
    console.log(`SQLite: ${this.config.sqlitePath}`);
    console.log(`Qdrant: ${this.config.qdrantUrl}`);
    console.log(`Mode: ${this.config.dryRun ? 'DRY RUN' : 'LIVE'}\n`);

    // Check if SQLite database exists
    try {
      await fs.access(this.config.sqlitePath);
    } catch {
      console.error(`❌ SQLite database not found: ${this.config.sqlitePath}`);
      process.exit(1);
    }

    // Load SQLite
    const Database = await loadSqlite();
    this.db = new Database(this.config.sqlitePath, { readonly: true });

    // Initialize Qdrant
    if (!this.config.dryRun) {
      this.logProgress('Initializing Qdrant collections...');
      await this.qdrant.initialize();
    }

    // Check what tables exist
    const tables = this.getExistingTables();
    this.log('Found tables:', tables);

    // Migrate each entity type
    if (tables.includes('swarms')) {
      await this.migrateSwarms();
    }
    if (tables.includes('agents')) {
      await this.migrateAgents();
    }
    if (tables.includes('tasks')) {
      await this.migrateTasks();
    }
    if (tables.includes('events')) {
      await this.migrateEvents();
    }
    if (tables.includes('memory_entries')) {
      await this.migrateMemoryEntries();
    }

    // Close SQLite
    this.db.close();

    // Print summary
    this.printSummary();

    return this.stats;
  }

  private getExistingTables(): string[] {
    const result = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all();
    return result.map((row: { name: string }) => row.name);
  }

  private async migrateSwarms(): Promise<void> {
    this.logProgress('Migrating swarms...');

    const rows = this.db.prepare('SELECT * FROM swarms').all();
    this.log(`Found ${rows.length} swarms`);

    for (const row of rows) {
      try {
        if (!this.config.dryRun) {
          await this.qdrant.createSwarm({
            name: row.name,
            topology: row.topology,
            maxAgents: row.max_agents,
            strategy: row.strategy,
            status: row.status,
            config: row.config ? JSON.parse(row.config) : undefined,
            destroyedAt: row.destroyed_at ? new Date(row.destroyed_at) : undefined,
          });
        }
        this.stats.swarms++;
        this.log(`  Migrated swarm: ${row.name} (${row.id})`);
      } catch (e) {
        const error = `Failed to migrate swarm ${row.id}: ${(e as Error).message}`;
        this.stats.errors.push(error);
        console.error(`  ❌ ${error}`);
      }
    }
  }

  private async migrateAgents(): Promise<void> {
    this.logProgress('Migrating agents...');

    const rows = this.db.prepare('SELECT * FROM agents').all();
    this.log(`Found ${rows.length} agents`);

    for (const row of rows) {
      try {
        if (!this.config.dryRun) {
          await this.qdrant.createAgent({
            swarmId: row.swarm_id,
            type: row.type,
            name: row.name,
            status: row.status,
            capabilities: row.capabilities ? JSON.parse(row.capabilities) : undefined,
            config: row.config ? JSON.parse(row.config) : undefined,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
            terminatedAt: row.terminated_at ? new Date(row.terminated_at) : undefined,
          });
        }
        this.stats.agents++;
        this.log(`  Migrated agent: ${row.name || row.type} (${row.id})`);
      } catch (e) {
        const error = `Failed to migrate agent ${row.id}: ${(e as Error).message}`;
        this.stats.errors.push(error);
        console.error(`  ❌ ${error}`);
      }
    }
  }

  private async migrateTasks(): Promise<void> {
    this.logProgress('Migrating tasks...');

    const rows = this.db.prepare('SELECT * FROM tasks').all();
    this.log(`Found ${rows.length} tasks`);

    for (const row of rows) {
      try {
        if (!this.config.dryRun) {
          await this.qdrant.createTask({
            swarmId: row.swarm_id,
            description: row.description,
            priority: row.priority,
            strategy: row.strategy,
            status: row.status,
            maxAgents: row.max_agents,
            requirements: row.requirements ? JSON.parse(row.requirements) : undefined,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
            result: row.result ? JSON.parse(row.result) : undefined,
            errorMessage: row.error_message,
            assignedTo: row.assigned_to,
            startedAt: row.started_at ? new Date(row.started_at) : undefined,
            completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
          });
        }
        this.stats.tasks++;
        this.log(`  Migrated task: ${row.description.substring(0, 50)}... (${row.id})`);
      } catch (e) {
        const error = `Failed to migrate task ${row.id}: ${(e as Error).message}`;
        this.stats.errors.push(error);
        console.error(`  ❌ ${error}`);
      }
    }
  }

  private async migrateEvents(): Promise<void> {
    this.logProgress('Migrating events...');

    const rows = this.db.prepare('SELECT * FROM events ORDER BY created_at DESC LIMIT 10000').all();
    this.log(`Found ${rows.length} events (limited to 10000)`);

    for (const row of rows) {
      try {
        if (!this.config.dryRun) {
          await this.qdrant.logEvent({
            swarmId: row.swarm_id,
            agentId: row.agent_id,
            eventType: row.event_type,
            eventName: row.event_name,
            eventData: row.event_data ? JSON.parse(row.event_data) : undefined,
            severity: row.severity,
          });
        }
        this.stats.events++;
        if (this.stats.events % 100 === 0) {
          this.log(`  Progress: ${this.stats.events} events`);
        }
      } catch (e) {
        const error = `Failed to migrate event ${row.id}: ${(e as Error).message}`;
        this.stats.errors.push(error);
        // Don't log every event error
      }
    }
    this.log(`  Migrated ${this.stats.events} events`);
  }

  private async migrateMemoryEntries(): Promise<void> {
    this.logProgress('Migrating memory entries...');

    const rows = this.db.prepare('SELECT * FROM memory_entries').all();
    this.log(`Found ${rows.length} memory entries`);

    for (const row of rows) {
      try {
        // Skip expired entries
        if (row.expires_at && row.expires_at < Date.now() / 1000) {
          this.log(`  Skipping expired entry: ${row.key}`);
          continue;
        }

        if (!this.config.dryRun) {
          await this.qdrant.memoryStore(
            row.key,
            row.value,
            row.namespace,
            {
              ttl: row.ttl,
              metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
            }
          );
        }
        this.stats.memoryEntries++;
        this.log(`  Migrated memory: ${row.namespace}:${row.key}`);
      } catch (e) {
        const error = `Failed to migrate memory ${row.namespace}:${row.key}: ${(e as Error).message}`;
        this.stats.errors.push(error);
        console.error(`  ❌ ${error}`);
      }
    }
  }

  private printSummary(): void {
    console.log('\n' + '='.repeat(50));
    console.log('Migration Summary');
    console.log('='.repeat(50));
    console.log(`Swarms:         ${this.stats.swarms}`);
    console.log(`Agents:         ${this.stats.agents}`);
    console.log(`Tasks:          ${this.stats.tasks}`);
    console.log(`Events:         ${this.stats.events}`);
    console.log(`Memory Entries: ${this.stats.memoryEntries}`);
    console.log('-'.repeat(50));
    console.log(`Total:          ${this.stats.swarms + this.stats.agents + this.stats.tasks + this.stats.events + this.stats.memoryEntries}`);
    console.log(`Errors:         ${this.stats.errors.length}`);

    if (this.stats.errors.length > 0) {
      console.log('\nErrors:');
      for (const error of this.stats.errors.slice(0, 10)) {
        console.log(`  - ${error}`);
      }
      if (this.stats.errors.length > 10) {
        console.log(`  ... and ${this.stats.errors.length - 10} more errors`);
      }
    }

    if (this.config.dryRun) {
      console.log('\n⚠️  DRY RUN - No data was actually migrated');
      console.log('Remove --dry-run to perform the actual migration');
    } else {
      console.log('\n✅ Migration complete!');
    }
    console.log('');
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const config = parseArgs();

  try {
    const migrator = new Migrator(config);
    await migrator.run();
  } catch (e) {
    console.error('\n❌ Migration failed:', (e as Error).message);
    if (config.verbose) {
      console.error((e as Error).stack);
    }
    process.exit(1);
  }
}

main();
