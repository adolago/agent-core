/**
 * Hive Mind CLI Initialization Commands
 *
 * Provides CLI interface for initializing and managing the Hive Mind system.
 * Uses QdrantStore for persistence via agent-core daemon.
 */

import { HiveMind } from '../../../hive-mind/index.js';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

// Track active hive mind instance
let activeHiveMind = null;

/**
 * Get default hive mind configuration
 */
function getDefaultConfig() {
  return {
    agentCoreUrl: process.env.AGENT_CORE_URL || 'http://127.0.0.1:3210',
    topology: 'mesh',
    queenMode: true,
    maxAgents: 10,
    consensusThreshold: 0.66,
    memoryTTL: 3600
  };
}

/**
 * Initialize Hive Mind system
 *
 * @param {Object} options - Initialization options
 * @returns {Promise<Object>} Initialization result
 */
export async function initializeHiveMind(options = {}) {
  const config = {
    ...getDefaultConfig(),
    ...options
  };

  try {
    console.log(chalk.cyan('\n🐝 Initializing Hive Mind...\n'));

    // Create HiveMind instance
    const hiveMind = new HiveMind({
      swarmName: options.swarmName || 'default-swarm',
      topology: config.topology,
      queenMode: config.queenMode,
      maxAgents: config.maxAgents,
      consensusThreshold: config.consensusThreshold,
      memoryTTL: config.memoryTTL,
      agentCoreUrl: config.agentCoreUrl
    });

    // Initialize
    await hiveMind.initialize();

    // Store reference
    activeHiveMind = hiveMind;

    console.log(chalk.green('✅ Hive Mind initialized successfully'));
    console.log(chalk.gray(`   Swarm: ${hiveMind.getSwarmId()}`));
    console.log(chalk.gray(`   Topology: ${config.topology}`));
    console.log(chalk.gray(`   Queen Mode: ${config.queenMode}`));

    return {
      success: true,
      swarmId: hiveMind.getSwarmId(),
      message: 'Hive Mind initialized successfully',
      config
    };
  } catch (error) {
    console.error(chalk.red(`❌ Hive Mind initialization failed: ${error.message}`));
    return {
      success: false,
      error: error.message,
      message: `Initialization failed: ${error.message}`
    };
  }
}

/**
 * Get Hive Mind status
 *
 * @returns {Promise<Object>} Status information
 */
export async function getHiveMindStatus() {
  try {
    if (!activeHiveMind) {
      return {
        running: false,
        message: 'No active Hive Mind instance'
      };
    }

    const status = await activeHiveMind.getStatus();
    const metrics = await activeHiveMind.getMetrics();

    return {
      running: true,
      swarmId: activeHiveMind.getSwarmId(),
      status,
      metrics,
      message: 'Hive Mind is running'
    };
  } catch (error) {
    return {
      running: false,
      error: error.message,
      message: `Failed to get status: ${error.message}`
    };
  }
}

/**
 * Rollback Hive Mind initialization
 *
 * @returns {Promise<Object>} Rollback result
 */
export async function rollbackHiveMindInit() {
  try {
    if (activeHiveMind) {
      await activeHiveMind.shutdown();
      activeHiveMind = null;
      console.log(chalk.yellow('🔄 Hive Mind shutdown complete'));
    }

    return {
      success: true,
      message: 'Hive Mind rollback successful'
    };
  } catch (error) {
    console.error(chalk.red(`❌ Rollback failed: ${error.message}`));
    return {
      success: false,
      error: error.message,
      message: `Rollback failed: ${error.message}`
    };
  }
}

/**
 * Check if Hive Mind is available (daemon running)
 */
export async function isHiveMindAvailable() {
  try {
    const agentCoreUrl = process.env.AGENT_CORE_URL || 'http://127.0.0.1:3210';
    const response = await fetch(`${agentCoreUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get active HiveMind instance
 */
export function getActiveHiveMind() {
  return activeHiveMind;
}

export default {
  initializeHiveMind,
  getHiveMindStatus,
  rollbackHiveMindInit,
  isHiveMindAvailable,
  getActiveHiveMind
};
