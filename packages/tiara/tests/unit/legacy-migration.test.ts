/**
 * Legacy memory migration tests
 */

import { describe, it, expect, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { migrateLegacyMemory } from '../../src/memory/legacy-migration.js';

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiara-migration-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe('migrateLegacyMemory', () => {
  it('migrates JSON memory + persistence files and deletes sources', async () =>
    withTempDir(async (dir) => {
      const memoryPath = path.join(dir, 'memory-store.json');
      const persistencePath = path.join(dir, 'claude-flow-data.json');

      await fs.writeFile(
        memoryPath,
        JSON.stringify(
          {
            default: [{ key: 'alpha', value: 'one' }],
            project: [{ key: 'beta', value: 'two', metadata: { origin: 'test' } }],
          },
          null,
          2,
        ),
      );

      await fs.writeFile(
        persistencePath,
        JSON.stringify(
          {
            agents: [{ id: 'agent-1', type: 'assistant', name: 'Agent One' }],
            tasks: [{ id: 'task-1', type: 'build', description: 'Test' }],
          },
          null,
          2,
        ),
      );

      const fakeStore = {
        initialize: jest.fn(),
        store: jest.fn(),
      };

      const fakePersistence = {
        initialize: jest.fn(),
        saveAgent: jest.fn(),
        saveTask: jest.fn(),
      };

      const summary = await migrateLegacyMemory({
        store: fakeStore as any,
        persistence: fakePersistence as any,
        memoryFiles: [memoryPath],
        persistenceFiles: [persistencePath],
        sqlitePaths: [],
        includeReasoningBank: false,
        includeSqlite: false,
      });

      expect(summary.memoryEntries).toBe(2);
      expect(summary.persistenceAgents).toBe(1);
      expect(summary.persistenceTasks).toBe(1);
      expect(fakeStore.store).toHaveBeenCalledTimes(2);
      expect(fakePersistence.saveAgent).toHaveBeenCalledTimes(1);
      expect(fakePersistence.saveTask).toHaveBeenCalledTimes(1);

      await expect(fs.access(memoryPath)).rejects.toThrow();
      await expect(fs.access(persistencePath)).rejects.toThrow();
      expect(summary.deleted).toEqual([memoryPath, persistencePath]);
    }));

  it('supports dry-run without writing or deleting sources', async () =>
    withTempDir(async (dir) => {
      const memoryPath = path.join(dir, 'memory-store.json');

      await fs.writeFile(
        memoryPath,
        JSON.stringify([{ key: 'alpha', value: 'one', namespace: 'default' }], null, 2),
      );

      const fakeStore = {
        initialize: jest.fn(),
        store: jest.fn(),
      };

      const summary = await migrateLegacyMemory({
        store: fakeStore as any,
        dryRun: true,
        includePersistence: false,
        includeReasoningBank: false,
        includeSqlite: false,
        memoryFiles: [memoryPath],
        persistenceFiles: [],
        sqlitePaths: [],
      });

      expect(summary.memoryEntries).toBe(1);
      expect(fakeStore.store).not.toHaveBeenCalled();
      await expect(fs.access(memoryPath)).resolves.toBeUndefined();
    }));
});
