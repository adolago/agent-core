/**
 * Test Mode Configuration
 *
 * Provides environment-based test mode detection and configuration
 * for running hive-mind in headless/test environments.
 *
 * Environment Variables:
 * - TIARA_TEST_MODE=true - Enable test mode with mocked dependencies
 * - TIARA_HEADLESS=true - Enable headless mode (no interactive prompts)
 * - TIARA_DEBUG=true - Enable verbose debug logging
 * - TIARA_MOCK_QDRANT=true - Use MockQdrantStore instead of real daemon
 */

export interface TestModeConfig {
  /** Whether test mode is enabled */
  testMode: boolean;
  /** Whether headless mode is enabled (no interactive prompts) */
  headless: boolean;
  /** Whether debug logging is enabled */
  debug: boolean;
  /** Whether to use mock Qdrant store */
  mockQdrant: boolean;
  /** Whether to skip real npm operations */
  mockNpm: boolean;
  /** Test timeout in milliseconds */
  timeout: number;
  /** Whether running in CI environment */
  ci: boolean;
}

/**
 * Get test mode configuration from environment
 */
export function getTestModeConfig(): TestModeConfig {
  const isTest = process.env.NODE_ENV === 'test' ||
                 process.env.TIARA_TEST_MODE === 'true' ||
                 process.env.VITEST === 'true' ||
                 process.env.JEST_WORKER_ID !== undefined;

  const isCI = process.env.CI === 'true' ||
               process.env.GITHUB_ACTIONS === 'true' ||
               process.env.GITLAB_CI === 'true';

  return {
    testMode: isTest,
    headless: isTest || process.env.TIARA_HEADLESS === 'true' || isCI,
    debug: process.env.TIARA_DEBUG === 'true' || process.env.DEBUG?.includes('tiara'),
    mockQdrant: isTest || process.env.TIARA_MOCK_QDRANT === 'true',
    mockNpm: isTest || process.env.TIARA_MOCK_NPM === 'true',
    timeout: parseInt(process.env.TIARA_TEST_TIMEOUT || '30000', 10),
    ci: isCI,
  };
}

/**
 * Check if running in test mode
 */
export function isTestMode(): boolean {
  return getTestModeConfig().testMode;
}

/**
 * Check if running in headless mode
 */
export function isHeadlessMode(): boolean {
  return getTestModeConfig().headless;
}

/**
 * Check if debug logging is enabled
 */
export function isDebugEnabled(): boolean {
  return getTestModeConfig().debug;
}

/**
 * Check if mock Qdrant should be used
 */
export function shouldMockQdrant(): boolean {
  return getTestModeConfig().mockQdrant;
}

/**
 * Debug logger that only logs in debug mode
 */
export function debugLog(component: string, message: string, data?: any): void {
  if (isDebugEnabled()) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [DEBUG] [${component}]`;
    if (data !== undefined) {
      console.log(prefix, message, JSON.stringify(data, null, 2));
    } else {
      console.log(prefix, message);
    }
  }
}

/**
 * Test mode aware console logger
 */
export const testLogger = {
  info: (message: string, ...args: any[]) => {
    if (!getTestModeConfig().testMode || isDebugEnabled()) {
      console.log(`[INFO] ${message}`, ...args);
    }
  },
  warn: (message: string, ...args: any[]) => {
    if (!getTestModeConfig().testMode || isDebugEnabled()) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  },
  error: (message: string, ...args: any[]) => {
    console.error(`[ERROR] ${message}`, ...args);
  },
  debug: (message: string, ...args: any[]) => {
    if (isDebugEnabled()) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },
};

export default {
  getTestModeConfig,
  isTestMode,
  isHeadlessMode,
  isDebugEnabled,
  shouldMockQdrant,
  debugLog,
  testLogger,
};
