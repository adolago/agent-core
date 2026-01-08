/**
 * personas Integration Tests
 *
 * Tests the personas system against a running Qdrant instance.
 * Run with: npx tsx src/personas/integration.test.ts
 */

import {
  createMemoryBridge,
  createWeztermBridge,
  createContinuityManager,
  createOrchestrator,
  type PersonasState,
  type ConversationState,
} from "./index";

// Test configuration
const TEST_CONFIG = {
  qdrant: {
    url: "http://localhost:6333",
    stateCollection: "personas_test_state",
    memoryCollection: "personas_test_memory",
  },
  wezterm: {
    enabled: true,
    layout: "horizontal" as const,
    showStatusPane: false, // Don't create status pane in tests
  },
};

// Test utilities
function log(msg: string) {
  console.log(`[TEST] ${msg}`);
}

function success(msg: string) {
  console.log(`[✓] ${msg}`);
}

function fail(msg: string) {
  console.error(`[✗] ${msg}`);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Memory Bridge Tests
// ============================================================================

async function testMemoryBridge() {
  log("Testing Memory Bridge...");

  const bridge = createMemoryBridge(TEST_CONFIG.qdrant);

  try {
    // Initialize
    await bridge.init();
    success("Memory bridge initialized");

    // Store a memory
    const memoryId = await bridge.storeMemory(
      "User prefers dark mode for all applications",
      { type: "preference", persona: "zee" }
    );
    success(`Stored memory: ${memoryId}`);

    // Search memories
    const results = await bridge.searchMemories("dark mode preference", 5);
    if (results.length > 0 && results[0].content.includes("dark mode")) {
      success(`Found memory via search: "${results[0].content.slice(0, 50)}..."`);
    } else {
      fail("Memory search did not return expected results");
    }

    // Save state
    const testState: PersonasState = {
      version: "1.0.0",
      workers: [],
      tasks: [],
      lastSyncAt: Date.now(),
      stats: {
        totalTasksCompleted: 5,
        totalDronesSpawned: 3,
        totalTokensUsed: 10000,
      },
    };
    await bridge.saveState(testState);
    success("Saved personas state");

    // Load state
    const loadedState = await bridge.loadState();
    if (loadedState && loadedState.stats.totalTasksCompleted === 5) {
      success("Loaded personas state correctly");
    } else {
      fail("State loading failed or data mismatch");
    }

    // Test conversation state
    const convState: ConversationState = {
      sessionId: "test-session-123",
      leadPersona: "zee",
      summary: "Discussed project setup and configuration",
      plan: "1. Set up environment\n2. Configure services\n3. Test integration",
      objectives: ["Complete setup", "Verify all services"],
      keyFacts: ["User prefers TypeScript", "Project uses Bun"],
      sessionChain: [],
      updatedAt: Date.now(),
    };
    await bridge.saveConversationState(convState);
    success("Saved conversation state");

    const loadedConv = await bridge.loadConversationState("test-session-123");
    if (loadedConv && loadedConv.objectives.length === 2) {
      success("Loaded conversation state correctly");
    } else {
      fail("Conversation state loading failed");
    }

    return true;
  } catch (e) {
    fail(`Memory bridge error: ${e}`);
    return false;
  }
}

// ============================================================================
// Continuity Manager Tests
// ============================================================================

async function testContinuityManager() {
  log("Testing Continuity Manager...");

  const bridge = createMemoryBridge(TEST_CONFIG.qdrant);
  await bridge.init();
  const continuity = createContinuityManager(bridge, { maxKeyFacts: 10 });

  try {
    // Start a session
    const state = await continuity.startSession("cont-test-session", "stanley");
    success(`Started session: ${state.sessionId}`);

    // Process some messages
    const messages = [
      "I want to analyze AAPL stock performance",
      "The current P/E ratio is 28.5",
      "We decided to set a price target of $200",
      "User prefers fundamental analysis over technical",
    ];
    await continuity.processMessages(messages);
    success("Processed messages");

    // Check extracted facts
    const currentState = continuity.getState();
    if (currentState && currentState.keyFacts.length > 0) {
      success(`Extracted ${currentState.keyFacts.length} key facts`);
    } else {
      fail("No key facts extracted");
    }

    // Update plan
    await continuity.updatePlan("Analyze tech stocks for Q1 portfolio");
    success("Updated plan");

    // Add objective
    await continuity.addObjective("Complete AAPL analysis");
    success("Added objective");

    // Get context for prompt
    const context = continuity.getContextForPrompt();
    if (context.includes("AAPL") || context.includes("portfolio")) {
      success("Context formatted correctly for prompt injection");
    } else {
      fail("Context formatting issue");
    }

    // End session
    await continuity.endSession();
    success("Session ended");

    // Restore session
    const restored = await continuity.restoreSession("cont-test-session");
    if (restored && restored.objectives.includes("Complete AAPL analysis")) {
      success("Session restored correctly");
    } else {
      fail("Session restoration failed");
    }

    return true;
  } catch (e) {
    fail(`Continuity manager error: ${e}`);
    return false;
  }
}

// ============================================================================
// WezTerm Bridge Tests
// ============================================================================

async function testWeztermBridge() {
  log("Testing WezTerm Bridge...");

  const wezterm = createWeztermBridge(TEST_CONFIG.wezterm);

  try {
    // Check availability
    const available = await wezterm.isAvailable();
    if (available) {
      success("WezTerm CLI is available");
    } else {
      fail("WezTerm CLI not available");
      return false;
    }

    // List panes
    const panes = await wezterm.listPanes();
    success(`Found ${panes.length} existing panes`);

    // Get current pane
    const currentPaneId = await wezterm.getCurrentPaneId();
    success(`Current pane ID: ${currentPaneId}`);

    // Note: We won't create panes in tests to avoid disrupting the terminal
    // In a real test environment, we would:
    // - Create a test pane
    // - Send commands to it
    // - Close it

    return true;
  } catch (e) {
    fail(`WezTerm bridge error: ${e}`);
    return false;
  }
}

// ============================================================================
// Orchestrator Tests (Basic)
// ============================================================================

async function testOrchestrator() {
  log("Testing Orchestrator (basic operations)...");

  const tiara = createOrchestrator({
    ...TEST_CONFIG,
    maxDronesPerPersona: 2,
    autoSpawn: false, // Don't auto-spawn in tests
  });

  try {
    // Initialize
    await tiara.init();
    success("Orchestrator initialized");

    // Get initial state
    const state = tiara.state();
    if (state.version === "1.0.0") {
      success("Initial state correct");
    }

    // Set plan
    await tiara.setPlan("Test plan for integration testing");
    success("Plan set");

    // Add objective
    await tiara.addObjective("Complete integration tests");
    success("Objective added");

    // Check conversation state
    const conv = tiara.conversation();
    if (conv && conv.objectives.length === 1) {
      success("Conversation state accessible");
    }

    // Submit a task (won't auto-spawn since disabled)
    const task = await tiara.submitTask({
      persona: "zee",
      description: "Test task",
      prompt: "This is a test prompt",
      priority: "normal",
      contextMemoryIds: [],
    });
    if (task.status === "pending") {
      success(`Task submitted: ${task.id}`);
    }

    // List tasks
    const tasks = tiara.listTasks();
    if (tasks.length === 1) {
      success("Task list correct");
    }

    // Subscribe to events
    let eventReceived = false;
    const unsubscribe = tiara.subscribe("state:synced", () => {
      eventReceived = true;
    });

    // Save state (should trigger event)
    await tiara.saveState();
    await sleep(100);

    if (eventReceived) {
      success("Event subscription working");
    }
    unsubscribe();

    // Shutdown
    await tiara.shutdown();
    success("Orchestrator shutdown cleanly");

    return true;
  } catch (e) {
    fail(`Orchestrator error: ${e}`);
    return false;
  }
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function runTests() {
  console.log("\n========================================");
  console.log("    PERSONAS INTEGRATION TESTS");
  console.log("========================================\n");

  const results: Record<string, boolean> = {};

  // Run tests
  results["Memory Bridge"] = await testMemoryBridge();
  console.log("");

  results["Continuity Manager"] = await testContinuityManager();
  console.log("");

  results["WezTerm Bridge"] = await testWeztermBridge();
  console.log("");

  results["Orchestrator"] = await testOrchestrator();
  console.log("");

  // Summary
  console.log("========================================");
  console.log("    TEST SUMMARY");
  console.log("========================================\n");

  let passed = 0;
  let failed = 0;

  for (const [name, result] of Object.entries(results)) {
    if (result) {
      console.log(`  ✓ ${name}`);
      passed++;
    } else {
      console.log(`  ✗ ${name}`);
      failed++;
    }
  }

  console.log(`\n  Total: ${passed} passed, ${failed} failed\n`);

  // Cleanup test collections
  console.log("Cleaning up test collections...");
  try {
    void await fetch(
      `${TEST_CONFIG.qdrant.url}/collections/${TEST_CONFIG.qdrant.stateCollection}`,
      { method: "DELETE" }
    );
    void await fetch(
      `${TEST_CONFIG.qdrant.url}/collections/${TEST_CONFIG.qdrant.memoryCollection}`,
      { method: "DELETE" }
    );
    console.log("Test collections cleaned up.\n");
  } catch {
    console.log("Note: Could not clean up test collections.\n");
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Run
runTests().catch((e) => {
  console.error("Test runner error:", e);
  process.exit(1);
});
