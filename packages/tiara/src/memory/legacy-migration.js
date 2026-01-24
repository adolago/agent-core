/**
 * Legacy memory migration helper.
 *
 * This migrates EnhancedMemory namespaces into the provided store when available.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
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

  const dryRun = options.dryRun === true;
  const deleteSources = options.deleteSources !== false;
  const includePersistence = options.includePersistence !== false;
  const includeSqlite = options.includeSqlite !== false;

  const store = options.store;
  const persistence = options.persistence;
  const memoryFiles =
    Array.isArray(options.memoryFiles) && options.memoryFiles.length > 0
      ? options.memoryFiles
      : [path.join('./memory', 'memory-store.json')];
  const persistenceFiles =
    Array.isArray(options.persistenceFiles) && options.persistenceFiles.length > 0
      ? options.persistenceFiles
      : [path.join('./memory', 'claude-flow-data.json')];

  try {
    // ---------------------------------------------------------------------
    // JSON memory stores (memory-store.json)
    // ---------------------------------------------------------------------
    for (const filePath of memoryFiles) {
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);

        const enqueue = async (namespace, entry) => {
          if (!entry || typeof entry !== 'object') {
            return;
          }
          if (typeof entry.key !== 'string') {
            return;
          }
          summary.memoryEntries += 1;

          if (dryRun || !store) {
            return;
          }

          try {
            await store.store(entry.key, entry.value, {
              namespace,
              metadata: entry.metadata || {},
            });
          } catch (error) {
            summary.errors.push({
              source: `${filePath}:${namespace}:${entry.key}`,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        };

        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            await enqueue(entry.namespace || 'default', entry);
          }
        } else if (parsed && typeof parsed === 'object') {
          for (const [namespace, entries] of Object.entries(parsed)) {
            if (!Array.isArray(entries)) {
              continue;
            }
            for (const entry of entries) {
              await enqueue(namespace, entry);
            }
          }
        }

        if (deleteSources && !dryRun && store) {
          await fs.unlink(filePath);
          summary.deleted.push(filePath);
        }
      } catch (error) {
        summary.errors.push({
          source: filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // ---------------------------------------------------------------------
    // JSON persistence stores (claude-flow-data.json)
    // ---------------------------------------------------------------------
    if (includePersistence) {
      for (const filePath of persistenceFiles) {
        try {
          const raw = await fs.readFile(filePath, 'utf8');
          const parsed = JSON.parse(raw);

          const agents = Array.isArray(parsed?.agents) ? parsed.agents : [];
          const tasks = Array.isArray(parsed?.tasks) ? parsed.tasks : [];

          summary.persistenceAgents += agents.length;
          summary.persistenceTasks += tasks.length;

          if (!dryRun && persistence) {
            for (const agent of agents) {
              await persistence.saveAgent(agent);
            }
            for (const task of tasks) {
              await persistence.saveTask(task);
            }
          }

          if (deleteSources && !dryRun && persistence) {
            await fs.unlink(filePath);
            summary.deleted.push(filePath);
          }
        } catch (error) {
          summary.errors.push({
            source: filePath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // ---------------------------------------------------------------------
    // SQLite enhanced memory store (best-effort)
    // ---------------------------------------------------------------------
    if (includeSqlite) {
      const source = new EnhancedMemory();
      await source.initialize();

      try {
        const data = await source.exportData();

        for (const [namespace, entries] of Object.entries(data)) {
          for (const entry of entries) {
            summary.memoryEntries += 1;

            if (dryRun || !store) {
              continue;
            }

            try {
              await store.store(entry.key, entry.value, {
                namespace,
                metadata: entry.metadata || {},
              });
            } catch (error) {
              summary.errors.push({
                source: `enhanced-memory:${namespace}:${entry.key}`,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }

        if (deleteSources && !dryRun) {
          for (const [namespace, entries] of Object.entries(data)) {
            for (const entry of entries) {
              try {
                await source.delete(entry.key, { namespace });
              } catch (error) {
                summary.errors.push({
                  source: `enhanced-memory:delete:${namespace}:${entry.key}`,
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
    }
  } catch (error) {
    summary.errors.push({
      source: 'legacy-migration',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return summary;
}

export default migrateLegacyMemory;
