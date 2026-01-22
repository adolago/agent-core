// memory.js - Memory management commands (Qdrant only)
import { printSuccess, printError, printWarning, printInfo, readJsonFile } from '../utils.js';
import { promises as fs } from 'fs';
import { QdrantMemoryStore } from '../../memory/qdrant-kv-store.js';
import { KeyRedactor } from '../../utils/key-redactor.js';
import { QdrantPersistenceManager } from '../../core/qdrant-persistence.js';
import { migrateLegacyMemory } from '../../memory/legacy-migration.js';

let storePromise = null;
let persistencePromise = null;

async function getMemoryStore(flags = {}) {
  if (!storePromise) {
    storePromise = (async () => {
      const config = await readJsonFile('claude-flow.config.json', {});
      const memoryConfig = config?.memory || {};
      const store = new QdrantMemoryStore({
        url: flags?.url || memoryConfig.url,
        apiKey: flags?.apiKey || memoryConfig.apiKey,
        collection: flags?.collection || memoryConfig.collection,
      });
      await store.initialize();
      return store;
    })();
  }
  return storePromise;
}

async function getPersistenceManager(flags = {}) {
  if (!persistencePromise) {
    persistencePromise = (async () => {
      const config = await readJsonFile('claude-flow.config.json', {});
      const memoryConfig = config?.memory || {};
      const manager = new QdrantPersistenceManager({
        collection: flags?.persistenceCollection || memoryConfig.persistenceCollection,
        url: flags?.url || memoryConfig.url,
        apiKey: flags?.apiKey || memoryConfig.apiKey,
      });
      await manager.initialize();
      return manager;
    })();
  }
  return persistencePromise;
}

export async function memoryCommand(subArgs, flags) {
  const memorySubcommand = subArgs[0];
  const namespace = flags?.namespace || flags?.ns || getNamespaceFromArgs(subArgs) || 'default';
  const enableRedaction = flags?.redact || subArgs.includes('--redact') || subArgs.includes('--secure');

  switch (memorySubcommand) {
    case 'store':
      await storeMemory(subArgs, namespace, enableRedaction, flags);
      break;

    case 'query':
      await queryMemory(subArgs, namespace, enableRedaction, flags);
      break;

    case 'stats':
    case 'status':
      await showMemoryStats(flags);
      break;

    case 'export':
      await exportMemory(subArgs, namespace, flags);
      break;

    case 'import':
      await importMemory(subArgs, flags);
      break;

    case 'clear':
      await clearMemory(subArgs, namespace, flags);
      break;

    case 'list':
      await listNamespaces(flags);
      break;

    case 'detect':
    case 'mode':
      await showMemoryMode(flags);
      break;

    case 'migrate':
      await migrateMemory(flags);
      break;

    default:
      showMemoryHelp();
  }
}

async function storeMemory(subArgs, namespace, enableRedaction, flags) {
  const key = subArgs[1];
  let value = subArgs.slice(2).join(' ');

  if (!key || !value) {
    printError('Usage: memory store <key> <value> [--namespace <ns>] [--redact]');
    return;
  }

  try {
    let redactedValue = value;
    let securityWarnings = [];

    if (enableRedaction) {
      redactedValue = KeyRedactor.redact(value, true);
      const validation = KeyRedactor.validate(value);

      if (!validation.safe) {
        securityWarnings = validation.warnings;
        printWarning('🔒 Redaction enabled: Sensitive data detected and redacted');
        securityWarnings.forEach((warning) => console.log(`   ⚠️  ${warning}`));
      }
    } else {
      const validation = KeyRedactor.validate(value);
      if (!validation.safe) {
        printWarning('⚠️  Potential sensitive data detected! Use --redact flag for automatic redaction');
        validation.warnings.forEach((warning) => console.log(`   ⚠️  ${warning}`));
        console.log('   💡 Tip: Add --redact flag to automatically redact API keys');
      }
    }

    const store = await getMemoryStore(flags);
    await store.store(key, redactedValue, {
      namespace,
      metadata: {
        redacted: enableRedaction && securityWarnings.length > 0,
        source: 'cli',
      },
    });

    printSuccess(
      enableRedaction && securityWarnings.length > 0
        ? '🔒 Stored successfully (with redaction)'
        : '✅ Stored successfully',
    );
    console.log(`📝 Key: ${key}`);
    console.log(`📦 Namespace: ${namespace}`);
    console.log(`💾 Size: ${new TextEncoder().encode(redactedValue).length} bytes`);
    if (enableRedaction && securityWarnings.length > 0) {
      console.log(`🔒 Security: ${securityWarnings.length} sensitive pattern(s) redacted`);
    }
  } catch (err) {
    printError(`Failed to store: ${err.message}`);
  }
}

async function queryMemory(subArgs, namespace, enableRedaction, flags) {
  const search = subArgs.slice(1).join(' ');
  const limit = parseLimit(flags, subArgs, 10);

  if (!search) {
    printError('Usage: memory query <search> [--namespace <ns>] [--limit <n>] [--redact]');
    return;
  }

  try {
    const store = await getMemoryStore(flags);
    let results = await store.search(search, {
      namespace: namespace || 'default',
      limit,
    });

    if (!results.length) {
      const allEntries = await store.listAll({ namespace: namespace || 'default' });
      results = allEntries
        .filter((entry) => {
          const value = formatValue(entry.value);
          return entry.key.includes(search) || value.includes(search);
        })
        .slice(0, limit)
        .map((entry) => ({
          key: entry.key,
          value: entry.value,
          namespace: entry.namespace,
          updatedAt: entry.updatedAt || entry.createdAt,
        }));
    }

    if (results.length === 0) {
      printWarning('No results found');
      return;
    }

    printSuccess(`Found ${results.length} results:`);

    for (const entry of results) {
      const displayValue = enableRedaction
        ? KeyRedactor.redact(formatValue(entry.value), true)
        : formatValue(entry.value);

      console.log(`\n📌 ${entry.key}`);
      console.log(`   Namespace: ${entry.namespace}`);
      console.log(
        `   Value: ${displayValue.substring(0, 100)}${displayValue.length > 100 ? '...' : ''}`,
      );
      if (entry.updatedAt) {
        console.log(`   Stored: ${new Date(entry.updatedAt).toLocaleString()}`);
      }
    }
  } catch (err) {
    printError(`Failed to query: ${err.message}`);
  }
}

async function showMemoryStats(flags) {
  try {
    const store = await getMemoryStore(flags);
    const entries = await store.listAll({ namespace: null });

    let totalEntries = 0;
    const namespaceStats = {};

    for (const entry of entries) {
      const ns = entry.namespace || 'default';
      namespaceStats[ns] = (namespaceStats[ns] || 0) + 1;
      totalEntries++;
    }

    printSuccess('Memory Bank Statistics:');
    console.log(`   Backend: Qdrant`);
    console.log(`   Total Entries: ${totalEntries}`);
    console.log(`   Namespaces: ${Object.keys(namespaceStats).length}`);

    if (Object.keys(namespaceStats).length > 0) {
      console.log('\n📁 Namespace Breakdown:');
      for (const [ns, count] of Object.entries(namespaceStats)) {
        console.log(`   ${ns}: ${count} entries`);
      }
    }

    if (store.options?.url) {
      console.log(`\n🔗 Qdrant URL: ${store.options.url}`);
    }
    if (store.options?.collection) {
      console.log(`📦 Collection: ${store.options.collection}`);
    }
  } catch (err) {
    printError(`Failed to get stats: ${err.message}`);
  }
}

async function exportMemory(subArgs, namespace, flags) {
  const filename = subArgs[1] || `memory-export-${Date.now()}.json`;

  try {
    const store = await getMemoryStore(flags);
    const entries = await store.listAll({
      namespace: namespace || null,
    });

    const exportData = {};
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

    await fs.writeFile(filename, JSON.stringify(exportData, null, 2));

    let totalEntries = 0;
    for (const nsEntries of Object.values(exportData)) {
      totalEntries += nsEntries.length;
    }

    printSuccess('Memory exported successfully');
    console.log(`📁 File: ${filename}`);
    console.log(`📊 Entries: ${totalEntries}`);
  } catch (err) {
    printError(`Failed to export: ${err.message}`);
  }
}

async function importMemory(subArgs, flags) {
  const filename = subArgs[1];

  if (!filename) {
    printError('Usage: memory import <filename>');
    return;
  }

  try {
    const content = await fs.readFile(filename, 'utf8');
    const importData = JSON.parse(content);
    const store = await getMemoryStore(flags);

    let imported = 0;

    for (const [namespace, entries] of Object.entries(importData)) {
      for (const entry of entries) {
        await store.store(entry.key, entry.value, {
          namespace: entry.namespace || namespace,
          metadata: entry.metadata || {},
        });
        imported++;
      }
    }

    printSuccess('Memory imported successfully');
    console.log(`📊 Imported entries: ${imported}`);
  } catch (err) {
    printError(`Failed to import: ${err.message}`);
  }
}

async function clearMemory(subArgs, namespace, flags) {
  const allFlag = flags?.all || subArgs.includes('--all');

  try {
    const store = await getMemoryStore(flags);

    if (allFlag) {
      await store.deleteAll();
      printSuccess('Cleared all memory entries');
      return;
    }

    await store.deleteNamespace(namespace || 'default');
    printSuccess(`Cleared memory namespace: ${namespace}`);
  } catch (err) {
    printError(`Failed to clear: ${err.message}`);
  }
}

async function listNamespaces(flags) {
  try {
    const store = await getMemoryStore(flags);
    const entries = await store.listAll({ namespace: null });
    const namespaceStats = {};

    for (const entry of entries) {
      const ns = entry.namespace || 'default';
      namespaceStats[ns] = (namespaceStats[ns] || 0) + 1;
    }

    if (Object.keys(namespaceStats).length === 0) {
      printWarning('No namespaces found');
      return;
    }

    printSuccess('Namespaces:');
    for (const [ns, count] of Object.entries(namespaceStats)) {
      console.log(`   ${ns}: ${count} entries`);
    }
  } catch (err) {
    printError(`Failed to list namespaces: ${err.message}`);
  }
}

async function showMemoryMode(flags) {
  try {
    const store = await getMemoryStore(flags);
    printInfo('📊 Memory Configuration:\n');
    console.log('Mode: QDRANT (default)');
    if (store.options?.url) {
      console.log(`Qdrant URL: ${store.options.url}`);
    }
    if (store.options?.collection) {
      console.log(`Collection: ${store.options.collection}`);
    }
  } catch (err) {
    printError(`Failed to get configuration: ${err.message}`);
  }
}

async function migrateMemory(flags) {
  try {
    const dryRun = Boolean(flags?.['dry-run'] || flags?.dryRun);
    const deleteSources = !(flags?.['no-delete'] || flags?.keep);
    const includePersistence = !flags?.['skip-persistence'];
    const includeSqlite = !(flags?.['skip-sqlite'] || flags?.skipSqlite);
    const includeReasoningBank = !flags?.['skip-reasoningbank'];
    const store = dryRun ? null : await getMemoryStore(flags);
    const persistence =
      dryRun || !includePersistence ? null : await getPersistenceManager(flags);

    if (dryRun) {
      printInfo('Running migration in dry-run mode (no changes will be written).');
    }

    const summary = await migrateLegacyMemory({
      store: store || undefined,
      persistence: persistence || undefined,
      dryRun,
      deleteSources,
      includePersistence,
      includeSqlite,
      includeReasoningBank,
    });

    const totalMemory = summary.memoryEntries + summary.reasoningBankEntries;
    printSuccess('Legacy memory migration complete.');
    console.log(`📦 Memory entries migrated: ${totalMemory}`);
    if (includePersistence) {
      console.log(`🤖 Agents migrated: ${summary.persistenceAgents}`);
      console.log(`🧭 Tasks migrated: ${summary.persistenceTasks}`);
    }

    if (summary.deleted.length > 0) {
      console.log('🧹 Deleted legacy sources:');
      summary.deleted.forEach((item) => console.log(`   - ${item}`));
    } else if (!deleteSources) {
      printInfo('Legacy sources retained (--no-delete).');
    }

    if (summary.errors.length > 0) {
      printWarning('Some sources could not be migrated:');
      summary.errors.forEach((err) => console.log(`   - ${err.source}: ${err.error}`));
    }
  } catch (err) {
    printError(`Failed to migrate memory: ${err.message}`);
  }
}

function parseLimit(flags, subArgs, defaultValue) {
  const flagValue = flags?.limit || getArgValue(subArgs, '--limit');
  if (!flagValue) return defaultValue;
  const parsed = Number.parseInt(flagValue, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function formatValue(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getNamespaceFromArgs(args) {
  const index = args.indexOf('--namespace');
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  const shortIndex = args.indexOf('--ns');
  if (shortIndex !== -1 && shortIndex + 1 < args.length) {
    return args[shortIndex + 1];
  }
  return null;
}

function getArgValue(args, flag) {
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return null;
}

function showMemoryHelp() {
  console.log('Memory commands:');
  console.log('  store <key> <value>      Store a key-value pair');
  console.log('  query <search>           Search for entries');
  console.log('  stats                    Show memory statistics');
  console.log('  export [filename]        Export memory to file');
  console.log('  import <filename>        Import memory from file');
  console.log('  clear --namespace <ns>   Clear a namespace');
  console.log('  clear --all              Clear all namespaces');
  console.log('  list                     List all namespaces');
  console.log('  migrate                  Migrate legacy memory stores into Qdrant');
  console.log();
  console.log('Options:');
  console.log('  --namespace <ns>         Specify namespace for operations');
  console.log('  --ns <ns>                Short form of --namespace');
  console.log('  --limit <n>              Limit number of results (default: 10)');
  console.log('  --redact                 🔒 Enable API key redaction (security feature)');
  console.log('  --secure                 Alias for --redact');
  console.log('  --dry-run                Preview migration without writing or deleting');
  console.log('  --no-delete              Keep legacy files after migration');
  console.log('  --skip-sqlite            Skip migrating legacy SQLite memory stores');
  console.log('  --skip-persistence       Skip migrating agent/task persistence JSON');
  console.log('  --skip-reasoningbank      Skip migrating ReasoningBank SQLite');
  console.log();
  console.log('Qdrant configuration:');
  console.log('  Uses claude-flow.config.json or MEMORY_QDRANT_* env vars');
  console.log();
  console.log('Examples:');
  console.log('  memory store previous_work "Research findings"');
  console.log('  memory store api_config "key=sk-ant-..." --redact');
  console.log('  memory query research --namespace sparc');
  console.log('  memory export backup.json');
  console.log('  memory import backup.json');
}
