/**
 * Test Infrastructure Index
 *
 * Exports all test utilities, mocks, and helpers for testing
 * the hive-mind system without external dependencies.
 */

// Test mode configuration
export {
  getTestModeConfig,
  isTestMode,
  isHeadlessMode,
  isDebugEnabled,
  shouldMockQdrant,
  debugLog,
  testLogger,
  type TestModeConfig,
} from "./test-mode";

// Mock stores
export {
  MockQdrantStore,
  getMockQdrantStore,
  TiaraNamespaces,
  type TiaraNamespace,
  type SwarmData,
  type AgentData,
  type TaskData,
  type CommunicationData,
  type ConsensusData,
  type MetricsData,
  type MemoryData,
  type ConsensusProposal,
  type PerformanceMetrics,
  type MemoryEntry,
} from "./MockQdrantStore";

// Re-export test utils from the tests folder
export * from "./test-helpers";

// CLI test harness
export {
  runCLI,
  runHiveMind,
  assertions,
  getCLIPath,
  InteractiveCLI,
  type CLIResult,
  type CLIOptions
} from "./cli-harness";
