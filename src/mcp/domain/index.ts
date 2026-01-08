/**
 * Domain Tools Index
 *
 * Domain-specific tools for Stanley (financial), Zee (personal assistant), and shared tools.
 * These tools provide specialized functionality for each agent persona.
 */

import type { ToolDefinition } from '../types';
import { getToolRegistry } from '../registry';

import { StanleyMarketDataTool, StanleyResearchTool, StanleyPortfolioTool, StanleySecFilingTool } from './stanley';
import { ZeeMemoryStoreTool, ZeeMemorySearchTool, ZeeMessagingTool, ZeeNotificationTool } from './zee';
import { CANVAS_TOOLS } from '../../domain/shared/canvas-tool';

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
 * Shared domain tools (available to all personas)
 */
export const sharedTools: ToolDefinition[] = CANVAS_TOOLS;

/**
 * All domain tools
 */
export const domainTools: ToolDefinition[] = [...stanleyTools, ...zeeTools, ...sharedTools];

/**
 * Register Stanley tools with the registry
 */
export function registerStanleyTools(): void {
  const registry = getToolRegistry();
  registry.registerAll(stanleyTools, { source: 'domain', enabled: true });
}

/**
 * Register Zee tools with registry
 */
export function registerZeeTools(): void {
  const registry = getToolRegistry();
  registry.registerAll(zeeTools, { source: 'domain', enabled: true });
}

/**
 * Register shared tools with registry
 */
export function registerSharedTools(): void {
  const registry = getToolRegistry();
  registry.registerAll(sharedTools, { source: 'domain', enabled: true });
}

/**
 * Register all domain tools with registry
 */
export function registerDomainTools(): void {
  registerStanleyTools();
  registerZeeTools();
  registerSharedTools();
}

// ============================================================================
// Re-exports
// ============================================================================

export * from './stanley';
export * from './zee';
