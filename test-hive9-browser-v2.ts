#!/usr/bin/env bun
/**
 * Hive Drone 9 - Browser Standalone Test Script v2
 * Tests LinkedIn learning and multiple navigations with improved stability
 */

import { standaloneBrowserTool } from "./src/domain/zee/browser-standalone.js";

const TEST_RESULTS: any = {
  profile: "hive9",
  startTime: new Date().toISOString(),
  steps: [],
  screenshots: [],
  errors: [],
};

async function runTest() {
  console.log("=== Hive Drone 9: zee:browser-standalone Test v2 ===\n");
  
  const mockContext = {
    metadata: (data: any) => console.log(`[METADATA] ${JSON.stringify(data)}`),
    extra: {},
  };

  const tool = standaloneBrowserTool;
  const initialized = await tool.init!();

  // Step 1: Launch browser
  console.log("\n--- Step 1: Launch Browser ---");
  try {
    const launchResult = await initialized.execute({
      action: "launch",
      profile: "hive9",
      headless: true,
    }, mockContext as any);
    console.log("Launch result:", JSON.stringify(launchResult, null, 2));
    TEST_RESULTS.steps.push({ step: 1, action: "launch", success: true, result: launchResult });
    await sleep(2000);
  } catch (e) {
    TEST_RESULTS.errors.push({ step: 1, error: String(e) });
    throw e;
  }

  // Step 2: Navigate to LinkedIn login
  console.log("\n--- Step 2: Navigate to LinkedIn Login ---");
  try {
    const navResult = await initialized.execute({
      action: "navigate",
      profile: "hive9",
      url: "https://www.linkedin.com/login",
    }, mockContext as any);
    console.log("Navigation result:", JSON.stringify(navResult, null, 2));
    TEST_RESULTS.steps.push({ step: 2, action: "navigate", url: "https://www.linkedin.com/login", success: true });
    await sleep(5000); // Wait for page load
  } catch (e) {
    TEST_RESULTS.errors.push({ step: 2, error: String(e) });
    throw e;
  }

  // Step 3: Screenshot 1 - Login page
  console.log("\n--- Step 3: Screenshot (Login Page) ---");
  try {
    const screenshotResult = await initialized.execute({
      action: "screenshot",
      profile: "hive9",
      fullPage: false,
    }, mockContext as any);
    console.log("Screenshot saved:", screenshotResult.metadata?.path);
    TEST_RESULTS.screenshots.push({ step: 3, page: "login", path: screenshotResult.metadata?.path, success: true });
    TEST_RESULTS.steps.push({ step: 3, action: "screenshot", success: true });
  } catch (e) {
    TEST_RESULTS.errors.push({ step: 3, error: String(e) });
  }

  // Step 4: Navigate to LinkedIn Learning
  console.log("\n--- Step 4: Navigate to LinkedIn Learning ---");
  try {
    const navResult = await initialized.execute({
      action: "navigate",
      profile: "hive9",
      url: "https://www.linkedin.com/learning/",
    }, mockContext as any);
    console.log("Navigation result:", JSON.stringify(navResult, null, 2));
    TEST_RESULTS.steps.push({ step: 4, action: "navigate", url: "https://www.linkedin.com/learning/", success: true });
    await sleep(6000); // Longer wait for learning platform
  } catch (e) {
    TEST_RESULTS.errors.push({ step: 4, error: String(e) });
    throw e;
  }

  // Step 5: Screenshot 2 - Learning page
  console.log("\n--- Step 5: Screenshot (Learning Page) ---");
  try {
    const screenshotResult = await initialized.execute({
      action: "screenshot",
      profile: "hive9",
      fullPage: false,
    }, mockContext as any);
    console.log("Screenshot saved:", screenshotResult.metadata?.path);
    TEST_RESULTS.screenshots.push({ step: 5, page: "learning", path: screenshotResult.metadata?.path, success: true });
    TEST_RESULTS.steps.push({ step: 5, action: "screenshot", success: true });
  } catch (e) {
    TEST_RESULTS.errors.push({ step: 5, error: String(e) });
  }

  // Step 6: Navigate to LinkedIn Help
  console.log("\n--- Step 6: Navigate to LinkedIn Help ---");
  try {
    const navResult = await initialized.execute({
      action: "navigate",
      profile: "hive9",
      url: "https://www.linkedin.com/help/",
    }, mockContext as any);
    console.log("Navigation result:", JSON.stringify(navResult, null, 2));
    TEST_RESULTS.steps.push({ step: 6, action: "navigate", url: "https://www.linkedin.com/help/", success: true });
    await sleep(5000);
  } catch (e) {
    TEST_RESULTS.errors.push({ step: 6, error: String(e) });
    throw e;
  }

  // Step 7: Screenshot 3 - Help page
  console.log("\n--- Step 7: Screenshot (Help Page) ---");
  try {
    const screenshotResult = await initialized.execute({
      action: "screenshot",
      profile: "hive9",
      fullPage: false,
    }, mockContext as any);
    console.log("Screenshot saved:", screenshotResult.metadata?.path);
    TEST_RESULTS.screenshots.push({ step: 7, page: "help", path: screenshotResult.metadata?.path, success: true });
    TEST_RESULTS.steps.push({ step: 7, action: "screenshot", success: true });
  } catch (e) {
    TEST_RESULTS.errors.push({ step: 7, error: String(e) });
  }

  // Step 8: Get page content from help page
  console.log("\n--- Step 8: Get Page Content (Help Page) ---");
  try {
    const contentResult = await initialized.execute({
      action: "content",
      profile: "hive9",
    }, mockContext as any);
    const content = contentResult.output || "";
    const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
    const h1Matches = content.match(/<h1[^>]*>([^<]+)<\/h1>/gi);
    const h2Matches = content.match(/<h2[^>]*>([^<]+)<\/h2>/gi);
    
    TEST_RESULTS.pageContent = {
      length: content.length,
      title: titleMatch?.[1]?.trim() || "N/A",
      h1s: h1Matches?.map((h: string) => h.replace(/<[^>]+>/g, "").trim()).slice(0, 5) || [],
      h2s: h2Matches?.map((h: string) => h.replace(/<[^>]+>/g, "").trim()).slice(0, 10) || [],
      excerpt: content.substring(0, 1000).replace(/\s+/g, " ").trim(),
    };
    console.log("Content extracted:", TEST_RESULTS.pageContent.title);
    TEST_RESULTS.steps.push({ step: 8, action: "content", success: true, length: content.length });
  } catch (e) {
    TEST_RESULTS.errors.push({ step: 8, error: String(e) });
  }

  // Step 9: List tabs
  console.log("\n--- Step 9: List Tabs ---");
  try {
    const tabsResult = await initialized.execute({
      action: "tabs",
      profile: "hive9",
    }, mockContext as any);
    TEST_RESULTS.tabs = tabsResult.metadata?.tabs || [];
    console.log(`Found ${TEST_RESULTS.tabs.length} tabs`);
    TEST_RESULTS.tabs.forEach((t: any, i: number) => {
      console.log(`  ${i + 1}. ${t.title} - ${t.url.substring(0, 60)}...`);
    });
    TEST_RESULTS.steps.push({ step: 9, action: "tabs", success: true, count: TEST_RESULTS.tabs.length });
  } catch (e) {
    TEST_RESULTS.errors.push({ step: 9, error: String(e) });
  }

  // Step 10: Check final status
  console.log("\n--- Step 10: Check Final Browser Status ---");
  try {
    const statusResult = await initialized.execute({
      action: "status",
      profile: "hive9",
    }, mockContext as any);
    TEST_RESULTS.finalStatus = statusResult;
    console.log("Status:", JSON.stringify(statusResult.metadata, null, 2));
    TEST_RESULTS.steps.push({ step: 10, action: "status", success: true });
  } catch (e) {
    TEST_RESULTS.errors.push({ step: 10, error: String(e) });
  }

  // Cleanup: Stop browser
  console.log("\n--- Cleanup: Stop Browser ---");
  try {
    const stopResult = await initialized.execute({
      action: "stop",
      profile: "hive9",
    }, mockContext as any);
    console.log("Browser stopped");
    TEST_RESULTS.steps.push({ step: 11, action: "stop", success: true });
  } catch (e) {
    TEST_RESULTS.errors.push({ step: 11, error: String(e) });
  }

  TEST_RESULTS.endTime = new Date().toISOString();
  TEST_RESULTS.duration = new Date(TEST_RESULTS.endTime).getTime() - new Date(TEST_RESULTS.startTime).getTime();

  // Print final report
  printReport();
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function printReport() {
  console.log("\n" + "=".repeat(70));
  console.log("              HIVE DRONE 9 - DETAILED TEST REPORT v2");
  console.log("=".repeat(70));
  
  console.log(`\n[TEST CONFIGURATION]`);
  console.log(`  Profile: ${TEST_RESULTS.profile}`);
  console.log(`  Start: ${TEST_RESULTS.startTime}`);
  console.log(`  End: ${TEST_RESULTS.endTime}`);
  console.log(`  Duration: ${TEST_RESULTS.duration}ms (${(TEST_RESULTS.duration/1000).toFixed(1)}s)`);
  
  console.log("\n[SCREENSHOTS CAPTURED]");
  TEST_RESULTS.screenshots.forEach((s: any) => {
    const status = s.success ? "✓" : "✗";
    console.log(`  ${status} ${s.page}: ${s.path}`);
  });

  console.log("\n[PAGE CONTENT - HELP PAGE]");
  if (TEST_RESULTS.pageContent) {
    console.log(`  Title: ${TEST_RESULTS.pageContent.title}`);
    console.log(`  Content Length: ${TEST_RESULTS.pageContent.length} chars`);
    console.log(`  H1 Elements: ${TEST_RESULTS.pageContent.h1s.length}`);
    TEST_RESULTS.pageContent.h1s.forEach((h: string, i: number) => console.log(`    ${i + 1}. ${h}`));
    console.log(`  H2 Elements: ${TEST_RESULTS.pageContent.h2s.length}`);
    TEST_RESULTS.pageContent.h2s.slice(0, 5).forEach((h: string, i: number) => console.log(`    ${i + 1}. ${h}`));
  }

  console.log("\n[TABS OPEN]");
  if (TEST_RESULTS.tabs.length === 0) {
    console.log("  (No tabs found)");
  } else {
    TEST_RESULTS.tabs.forEach((t: any, i: number) => {
      console.log(`  ${i + 1}. ${t.title}`);
      console.log(`     URL: ${t.url}`);
    });
  }

  console.log("\n[FINAL BROWSER STATUS]");
  if (TEST_RESULTS.finalStatus?.metadata) {
    const m = TEST_RESULTS.finalStatus.metadata;
    console.log(`  Running: ${m.running ? "Yes" : "No"}`);
    console.log(`  PID: ${m.pid}`);
    console.log(`  CDP Port: ${m.cdpPort}`);
    console.log(`  Tab Count: ${m.tabCount}`);
    console.log(`  Launched: ${m.launchedAt}`);
  }

  console.log("\n[TEST STEPS SUMMARY]");
  const successCount = TEST_RESULTS.steps.filter((s: any) => s.success).length;
  console.log(`  Passed: ${successCount}/${TEST_RESULTS.steps.length}`);
  TEST_RESULTS.steps.forEach((s: any) => {
    const status = s.success ? "✓" : "✗";
    console.log(`  ${status} Step ${s.step}: ${s.action}`);
  });

  if (TEST_RESULTS.errors.length > 0) {
    console.log("\n[ERRORS]");
    TEST_RESULTS.errors.forEach((e: any) => {
      console.log(`  Step ${e.step}: ${e.error}`);
    });
  }

  console.log("\n[STABILITY ASSESSMENT]");
  const crashDetected = TEST_RESULTS.errors.some((e: any) => e.error.includes("No tabs available"));
  if (crashDetected) {
    console.log("  ⚠ Browser instability detected - process may have crashed/restarted");
  } else {
    console.log("  ✓ Browser remained stable throughout test");
  }

  console.log("\n" + "=".repeat(70));
  
  // Save report
  const fs = require("fs");
  const reportPath = "/home/artur/.local/src/agent-core/.agent-core/hive9-test-report-v2.json";
  fs.writeFileSync(reportPath, JSON.stringify(TEST_RESULTS, null, 2));
  console.log(`\nFull report saved to: ${reportPath}`);
}

runTest().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
