#!/usr/bin/env node
/**
 * Claude-Flow MCP Server - Wrapper Mode
 *
 * This version uses the Claude Code MCP wrapper approach instead of templates.
 */

import { ClaudeCodeMCPWrapper } from './claude-code-wrapper.js';
import { MCPServer } from './server.js';
import { EventBus } from '../core/event-bus.js';
import { logger } from '../core/logger.js';

// Check if running as wrapper mode
const isWrapperMode =
  process.env.CLAUDE_FLOW_WRAPPER_MODE === 'true' || process.argv.includes('--wrapper');

async function main() {
  if (isWrapperMode) {
    console.error('Starting Claude-Flow MCP in wrapper mode...');
    const wrapper = new ClaudeCodeMCPWrapper();
    await wrapper.run();
  } else {
    // Fall back to original server
    console.error('Starting Claude-Flow MCP in direct mode...');
    const server = new MCPServer({ transport: 'stdio' }, EventBus.getInstance(), logger);
    await server.start();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
