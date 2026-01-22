/**
 * Test Helpers
 *
 * Common utilities for testing hive-mind components.
 */

import { MockQdrantStore, getMockQdrantStore } from "./MockQdrantStore";
import { getTestModeConfig, debugLog } from "./test-mode";

// =============================================================================
// Mock npm/CLI Operations
// =============================================================================

export interface MockNpmResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Mock npm operation results
 */
export const mockNpmOperations = {
  cacheClean: (): MockNpmResult => ({
    success: true,
    stdout: "npm cache cleaned successfully",
    stderr: "",
    exitCode: 0,
  }),

  install: (packageName: string): MockNpmResult => ({
    success: true,
    stdout: `+ ${packageName}\nadded 1 package in 0.5s`,
    stderr: "",
    exitCode: 0,
  }),

  installFail: (packageName: string, error: string): MockNpmResult => ({
    success: false,
    stdout: "",
    stderr: `npm ERR! ${error}`,
    exitCode: 1,
  }),
};

/**
 * Create a mock execSync that returns controlled results
 */
export function createMockExecSync(results: Map<string, MockNpmResult>) {
  return (command: string, options?: any): Buffer | string => {
    debugLog("MockExecSync", `Executing: ${command}`);

    // Find matching result
    for (const [pattern, result] of results.entries()) {
      if (command.includes(pattern)) {
        if (!result.success) {
          const error = new Error(result.stderr) as any;
          error.status = result.exitCode;
          error.stdout = result.stdout;
          error.stderr = result.stderr;
          throw error;
        }
        return result.stdout;
      }
    }

    // Default: return empty success
    return "";
  };
}

// =============================================================================
// Test Data Factories
// =============================================================================

let idCounter = 0;

/**
 * Generate unique test ID
 */
export function generateTestId(prefix: string = "test"): string {
  return `${prefix}-${Date.now()}-${++idCounter}`;
}

/**
 * Create test swarm data
 */
export function createTestSwarm(overrides: Partial<import("./MockQdrantStore").SwarmData> = {}): import("./MockQdrantStore").SwarmData {
  return {
    id: generateTestId("swarm"),
    name: "Test Swarm",
    topology: "mesh",
    queenMode: false,
    maxAgents: 10,
    consensusThreshold: 0.66,
    memoryTTL: 3600,
    config: {},
    isActive: true,
    createdAt: Date.now(),
    ...overrides,
  };
}

/**
 * Create test agent data
 */
export function createTestAgent(swarmId: string, overrides: Partial<import("./MockQdrantStore").AgentData> = {}): import("./MockQdrantStore").AgentData {
  return {
    id: generateTestId("agent"),
    swarmId,
    name: "Test Agent",
    type: "worker",
    status: "idle",
    capabilities: ["test"],
    successCount: 0,
    errorCount: 0,
    messageCount: 0,
    metadata: {},
    createdAt: Date.now(),
    lastHeartbeat: Date.now(),
    ...overrides,
  };
}

/**
 * Create test task data
 */
export function createTestTask(swarmId: string, overrides: Partial<import("./MockQdrantStore").TaskData> = {}): import("./MockQdrantStore").TaskData {
  return {
    id: generateTestId("task"),
    swarmId,
    description: "Test task description",
    priority: "medium",
    strategy: "single",
    status: "pending",
    dependencies: [],
    assignedAgents: [],
    requireConsensus: false,
    maxAgents: 1,
    requiredCapabilities: [],
    metadata: {},
    createdAt: Date.now(),
    ...overrides,
  };
}

/**
 * Create test communication data
 */
export function createTestCommunication(
  swarmId: string,
  fromAgentId: string,
  overrides: Partial<import("./MockQdrantStore").CommunicationData> = {}
): Omit<import("./MockQdrantStore").CommunicationData, "id" | "timestamp"> {
  return {
    fromAgentId,
    toAgentId: undefined,
    swarmId,
    messageType: "status_update",
    content: "Test message",
    priority: "normal",
    requiresResponse: false,
    ...overrides,
  };
}

// =============================================================================
// Test Environment Setup
// =============================================================================

/**
 * Setup test environment with mock store
 */
export async function setupTestEnvironment(): Promise<{
  store: MockQdrantStore;
  cleanup: () => void;
}> {
  const store = await getMockQdrantStore();
  store.reset();

  debugLog("TestHelper", "Test environment setup complete");

  return {
    store,
    cleanup: () => {
      store.reset();
      debugLog("TestHelper", "Test environment cleaned up");
    },
  };
}

/**
 * Setup test environment with pre-populated data
 */
export async function setupTestEnvironmentWithData(): Promise<{
  store: MockQdrantStore;
  swarm: import("./MockQdrantStore").SwarmData;
  agents: import("./MockQdrantStore").AgentData[];
  tasks: import("./MockQdrantStore").TaskData[];
  cleanup: () => void;
}> {
  const { store, cleanup } = await setupTestEnvironment();

  // Create swarm
  const swarm = createTestSwarm();
  await store.createSwarm(swarm);

  // Create agents
  const agents: import("./MockQdrantStore").AgentData[] = [];
  for (let i = 0; i < 3; i++) {
    const agent = createTestAgent(swarm.id, {
      name: `Agent ${i + 1}`,
      capabilities: ["research", "coding"],
    });
    await store.registerAgent(agent);
    agents.push(agent);
  }

  // Create tasks
  const tasks: import("./MockQdrantStore").TaskData[] = [];
  for (let i = 0; i < 2; i++) {
    const task = createTestTask(swarm.id, {
      description: `Task ${i + 1}`,
      priority: i === 0 ? "high" : "medium",
    });
    await store.createTask(task);
    tasks.push(task);
  }

  return { store, swarm, agents, tasks, cleanup };
}

// =============================================================================
// Assertion Helpers
// =============================================================================

/**
 * Assert that an async function throws
 */
export async function assertThrows(
  fn: () => Promise<any>,
  errorMessageIncludes?: string
): Promise<Error> {
  try {
    await fn();
    throw new Error("Expected function to throw");
  } catch (error: any) {
    if (error.message === "Expected function to throw") {
      throw error;
    }
    if (errorMessageIncludes && !error.message.includes(errorMessageIncludes)) {
      throw new Error(
        `Expected error message to include "${errorMessageIncludes}", got "${error.message}"`
      );
    }
    return error;
  }
}

/**
 * Wait for condition with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number; message?: string } = {}
): Promise<void> {
  const { timeout = 5000, interval = 100, message = "Condition not met" } = options;
  const startTime = Date.now();

  while (true) {
    const result = await condition();
    if (result) return;

    if (Date.now() - startTime > timeout) {
      throw new Error(`${message} (timeout after ${timeout}ms)`);
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

/**
 * Wait for event emission
 */
export function waitForEvent(
  emitter: import("events").EventEmitter,
  event: string,
  timeout: number = 5000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Event "${event}" not emitted within ${timeout}ms`));
    }, timeout);

    emitter.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

// =============================================================================
// CLI Test Helpers
// =============================================================================

export interface CLITestResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

/**
 * Simulate CLI command execution in test mode
 */
export function simulateCLICommand(
  command: string,
  options: {
    exitCode?: number;
    stdout?: string;
    stderr?: string;
  } = {}
): CLITestResult {
  debugLog("CLITest", `Simulating command: ${command}`);

  return {
    exitCode: options.exitCode ?? 0,
    stdout: options.stdout ?? "",
    stderr: options.stderr ?? "",
    duration: Math.random() * 100, // Simulated duration
  };
}

/**
 * Create mock spawn result for CLI tests
 */
export function createMockSpawnResult(overrides: Partial<CLITestResult> = {}): CLITestResult {
  return {
    exitCode: 0,
    stdout: "Command executed successfully\nSession ID: test-session-123\nSwarm is ready for coordination",
    stderr: "",
    duration: 150,
    ...overrides,
  };
}

// =============================================================================
// Error Recovery Test Helpers
// =============================================================================

/**
 * Create mock error recovery results
 */
export const mockErrorRecovery = {
  createNpmCacheError: () =>
    new Error("ENOTEMPTY: directory not empty, rmdir '/home/user/.npm/_npx/xxx/node_modules/some-package'"),

  createQdrantConnectionError: () =>
    new Error("connect ECONNREFUSED 127.0.0.1:6333"),

  createSuccessRecoveryResult: () => ({
    success: true,
    action: "cache-cleanup",
    message: "Cache cleaned successfully",
    recovered: true,
  }),

  createFailedRecoveryResult: (message: string) => ({
    success: false,
    action: "error-recovery",
    message,
    recovered: false,
  }),
};

export default {
  mockNpmOperations,
  createMockExecSync,
  generateTestId,
  createTestSwarm,
  createTestAgent,
  createTestTask,
  createTestCommunication,
  setupTestEnvironment,
  setupTestEnvironmentWithData,
  assertThrows,
  waitFor,
  waitForEvent,
  simulateCLICommand,
  createMockSpawnResult,
  mockErrorRecovery,
};
