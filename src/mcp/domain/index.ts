/**
 * Domain Tools Index
 *
 * Domain-specific tools for Stanley (financial) and Zee (personal assistant).
 * These tools provide specialized functionality for each agent persona.
 */

import type { ToolDefinition } from '../types';
import { getToolRegistry } from '../registry';

// Domain tool implementations
import { StanleyMarketDataTool, StanleyResearchTool, StanleyPortfolioTool, StanleySecFilingTool } from './stanley';
import { ZeeMemoryStoreTool, ZeeMemorySearchTool, ZeeMessagingTool, ZeeNotificationTool } from './zee';

// ============================================================================
// Domain Tools Registry
// ============================================================================

/**
 * Stanley domain tools (financial analysis)
 */
export const stanleyTools: ToolDefinition[] = [
  StanleyMarketDataTool,
  StanleyResearchTool,
  StanleyPortfolioTool,
  StanleySecFilingTool,
];

/**
 * Zee domain tools (personal assistant)
 */
export const zeeTools: ToolDefinition[] = [
  ZeeMemoryStoreTool,
  ZeeMemorySearchTool,
  ZeeMessagingTool,
  ZeeNotificationTool,
];

/**
 * All domain tools
 */
export const domainTools: ToolDefinition[] = [...stanleyTools, ...zeeTools];

/**
 * Register Stanley tools with the registry
 */
export function registerStanleyTools(): void {
  const registry = getToolRegistry();
  registry.registerAll(stanleyTools, { source: 'domain', enabled: true });
}

/**
 * Register Zee tools with the registry
 */
export function registerZeeTools(): void {
  const registry = getToolRegistry();
  registry.registerAll(zeeTools, { source: 'domain', enabled: true });
}

/**
 * Register all domain tools with the registry
 */
export function registerDomainTools(): void {
  registerStanleyTools();
  registerZeeTools();
}

// ============================================================================
// Re-exports
// ============================================================================

export * from './stanley';
export * from './zee';
