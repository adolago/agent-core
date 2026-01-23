/**
 * Legacy memory migration helper.
 *
 * This migrates EnhancedMemory namespaces into the provided store when available.
 */

import EnhancedMemory from './enhanced-memory.js';

export async function migrateLegacyMemory(options = {}) {
  const summary = {
    memoryEntries: 0,
    reasoningBankEntries: 0,
    persistenceAgents: 0,
    persistenceTasks: 0,
    deleted: [],
    errors: [],
  };

  const includeSqlite = options.includeSqlite !== false;
  if (!includeSqlite) {
    return summary;
  }

  const source = new EnhancedMemory();
  await source.initialize();

  try {
    const data = await source.exportData();
    const store = options.store;

    for (const [namespace, entries] of Object.entries(data)) {
      for (const entry of entries) {
        summary.memoryEntries += 1;

        if (options.dryRun || !store) {
          continue;
        }

        try {
          await store.store(entry.key, entry.value, {
            namespace,
            metadata: entry.metadata || {},
          });
        } catch (error) {
          summary.errors.push({
            source: `${namespace}:${entry.key}`,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (options.deleteSources && !options.dryRun) {
      for (const [namespace, entries] of Object.entries(data)) {
        for (const entry of entries) {
          try {
            await source.delete(entry.key, { namespace });
          } catch (error) {
            summary.errors.push({
              source: `delete:${namespace}:${entry.key}`,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
      summary.deleted.push('enhanced-memory');
    }
  } catch (error) {
    summary.errors.push({
      source: 'enhanced-memory',
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (typeof source.close === 'function') {
      source.close();
    }
  }

  return summary;
}

export default migrateLegacyMemory;
