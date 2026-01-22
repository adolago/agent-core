/**
 * Tiara Storage Adapters
 *
 * This module provides storage backend options for tiara coordination:
 *
 * - QdrantCoordinationAdapter: Direct Qdrant REST API adapter
 * - StorageBackend: Unified interface for all storage backends
 * - getStorage(): Factory function to get configured storage
 *
 * Configuration is resolved from agent-core.json(c):
 *   memory.qdrant + tiara.qdrant entries
 *
 * Migration:
 *   npx ts-node scripts/migrate-to-qdrant.ts --help
 */

export {
  // Qdrant adapter
  QdrantCoordinationAdapter,
  QdrantConfig,
  DEFAULT_QDRANT_CONFIG,
  type MemoryEntry,
  type PatternEntry,
  type CoordinationEntityType,
  getQdrantAdapter,
  resetQdrantAdapter,
} from './qdrant-adapter.js';

export {
  // Storage factory
  type StorageBackend,
  type StorageConfig,
  type StorageType,
  DEFAULT_STORAGE_CONFIG,
  getStorage,
  resetStorage,
  QdrantStorageBackend,
} from './storage-factory.js';
