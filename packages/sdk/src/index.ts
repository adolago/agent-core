// Agent Core SDK
// Re-exports from the internal SDK implementation

export * from "./client.js"
export * from "./server.js"

import { createAgentCoreClient } from "./client.js"
import { createAgentCoreServer } from "./server.js"
import type { ServerOptions } from "./server.js"

/**
 * Creates both an Agent Core server and client
 * @param options Server options
 * @returns Object with client and server instances
 */
export async function createAgentCore(options?: ServerOptions) {
  const server = await createAgentCoreServer({
    ...options,
  })

  const client = createAgentCoreClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}

/** @deprecated Use createAgentCore instead */
export const createOpencode = createAgentCore
