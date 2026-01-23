#!/usr/bin/env node
/**
 * MCP Server entry point that uses the wrapper by default
 */

import { ClaudeCodeMCPWrapper } from './claude-code-wrapper.js';
import { MCPServer } from './server.js';
import { EventBus } from '../core/event-bus.js';
import { logger } from '../core/logger.js';

// Check if we should use the legacy server
const useLegacy =
  process.env.CLAUDE_FLOW_LEGACY_MCP === 'true' || process.argv.includes('--legacy');

async function main() {
  if (useLegacy) {
    console.error('Starting Claude-Flow MCP in legacy mode...');
    const server = new MCPServer({ transport: 'stdio' }, EventBus.getInstance(), logger);
    await server.start();
  } else {
    console.error('Starting Claude-Flow MCP with Claude Code wrapper...');
    const wrapper = new ClaudeCodeMCPWrapper();
    await wrapper.run();
  }
}

// Run the server
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
