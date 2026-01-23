/**
 * QdrantMemoryStore compatibility layer.
 *
 * This wraps the AgentDB adapter to provide the legacy QdrantMemoryStore API
 * expected by CLI and MCP integrations.
 */

import { AgentDBMemoryAdapter } from './agentdb-adapter.js';

export class QdrantMemoryStore {
  constructor(options = {}) {
    this.options = { ...options };
    this.adapter = new AgentDBMemoryAdapter(options);
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    await this.adapter.initialize();
    this.initialized = true;
  }

  async store(key, value, options = {}) {
    await this.initialize();
    if (options.embedding && typeof this.adapter.storeWithEmbedding === 'function') {
      return this.adapter.storeWithEmbedding(key, value, options);
    }
    return this.adapter.store(key, value, options);
  }

  async retrieve(key, options = {}) {
    await this.initialize();
    return this.adapter.retrieve(key, options);
  }

  async list(options = {}) {
    await this.initialize();
    return this.adapter.list(options);
  }

  async listAll(options = {}) {
    const limit = options.limit ?? 10000;
    const namespace = options.namespace ?? undefined;
    return this.list({ namespace, limit });
  }

  async search(query, options = {}) {
    await this.initialize();
    return this.adapter.search(query, options);
  }

  async delete(key, options = {}) {
    await this.initialize();
    return this.adapter.delete(key, options);
  }

  async exportData(namespace = null) {
    await this.initialize();
    if (typeof this.adapter.exportData === 'function') {
      return this.adapter.exportData(namespace);
    }

    const entries = await this.listAll({ namespace: namespace ?? undefined });
    const exportData = {};

    for (const entry of entries) {
      const ns = entry.namespace ?? 'default';
      if (!exportData[ns]) {
        exportData[ns] = [];
      }
      exportData[ns].push(entry);
    }

    return exportData;
  }

  close() {
    if (typeof this.adapter.close === 'function') {
      this.adapter.close();
    }
  }
}

export default QdrantMemoryStore;
