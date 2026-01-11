/**
 * Memory Module
 *
 * Unified memory system with Qdrant vector storage,
 * supporting semantic search, pattern storage, and cross-session context.
 *
 * Primary API:
 * - Memory class (unified.ts) - Single class for all memory operations
 * - getMemory() - Get shared Memory instance
 *
 * Legacy exports (for backwards compatibility):
 * - QdrantVectorStorage - Low-level Qdrant client
 * - MemoryStore - Legacy store API
 * - createEmbeddingProvider - Embedding factory
 */

// Primary API - unified Memory class
export { Memory, getMemory, resetMemory, extractKeyFacts } from "./unified";
export type {
  MemoryConfig,
  PersonaId,
  ConversationState,
  PersonasState,
  EntryType,
} from "./unified";

// Types
export * from "./types";

// Embedding providers
export * from "./embedding";

// Low-level storage (for advanced use cases)
export { QdrantVectorStorage, QdrantMemoryStore } from "./qdrant";

// Legacy store API (deprecated - use Memory class instead)
export { MemoryStore, getMemoryStore, resetMemoryStore } from "./store";
