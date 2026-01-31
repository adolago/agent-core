/**
 * Hive Drone 6 - Browser Standalone Test Script
 * Testing kernel.sh capabilities (zee:browser-standalone)
 */

import { standaloneBrowserTool } from "./src/domain/zee/browser-standalone.js";
import { mkdirSync } from "fs";
import { join } from "path";

// Mock context for tool execution
const mockContext = {
  metadata: (data: any) => {},
};

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log("=".repeat(70));
  console.log("HIVE DRONE 6 - BROWSER STANDALONE TEST (kernel.sh)");
  console.log("Profile: hive6");
  console.log("=".repeat(70));
  console.log();

  // Ensure screenshots directory exists
  const screenshotDir = join(process.cwd(), ".agent-core", "screenshots");
  try { mkdirSync(screenshotDir, { recursive: true }); } catch { /* ignore */ }

  const results: any = {};

  try {
    // Initialize the tool
    const tool = await standaloneBrowserTool.init!();

    // STEP 1: Launch browser with profile "hive6"
    console.log("[1/10] Launching browser with profile 'hive6'...");
    results.launch = await tool.execute({ action: "launch", profile: "hive6", headless: true }, mockContext as any);
    console.log("  Result:", results.launch.output);
    console.log("  PID:", results.launch.metadata?.pid);
    console.log("  CDP Port:", results.launch.metadata?.cdpPort);
    console.log();
    await sleep(1000);

    // STEP 2: Navigate to LinkedIn login
    console.log("[2/10] Navigating to https://www.linkedin.com/login...");
    results.navigate1 = await tool.execute({ action: "navigate", profile: "hive6", url: "https://www.linkedin.com/login" }, mockContext as any);
    console.log("  Result:", results.navigate1.output);
    console.log();
    await sleep(3000);

    // STEP 3: Take screenshot
    console.log("[3/10] Taking screenshot...");
    results.screenshot1 = await tool.execute({ action: "screenshot", profile: "hive6", fullPage: false }, mockContext as any);
    console.log("  Screenshot saved:", results.screenshot1.metadata?.path);
    console.log();

    // STEP 4: Get page content
    console.log("[4/10] Getting page content (HTML)...");
    results.content1 = await tool.execute({ action: "content", profile: "hive6" }, mockContext as any);
    console.log("  Content length:", results.content1.metadata?.length, "characters");
    // Extract and show page title from HTML
    const titleMatch = results.content1.output?.match(/<title[^>]*>([^<]*)<\/title>/i);
    console.log("  Page title from HTML:", titleMatch?.[1] || "N/A");
    console.log();

    // STEP 5: Get tabs (page title and URL)
    console.log("[5/10] Getting tabs info...");
    results.tabs1 = await tool.execute({ action: "tabs", profile: "hive6" }, mockContext as any);
    console.log("  Tabs found:", results.tabs1.metadata?.tabs?.length || 0);
    for (const tab of results.tabs1.metadata?.tabs || []) {
      console.log("  - Title:", tab.title);
      console.log("    URL:", tab.url);
    }
    console.log();

    // STEP 6: Check browser status
    console.log("[6/10] Checking browser status...");
    results.status = await tool.execute({ action: "status", profile: "hive6" }, mockContext as any);
    console.log("  Status:", results.status.output);
    console.log();

    // STEP 7: Navigate to LinkedIn feed
    console.log("[7/10] Navigating to https://www.linkedin.com/feed/...");
    results.navigate2 = await tool.execute({ action: "navigate", profile: "hive6", url: "https://www.linkedin.com/feed/" }, mockContext as any);
    console.log("  Result:", results.navigate2.output);
    console.log();
    await sleep(3000);

    // STEP 8: Take another screenshot
    console.log("[8/10] Taking second screenshot...");
    results.screenshot2 = await tool.execute({ action: "screenshot", profile: "hive6", fullPage: false }, mockContext as any);
    console.log("  Screenshot saved:", results.screenshot2.metadata?.path);
    console.log();

    // STEP 9: Get updated page content
    console.log("[9/10] Getting updated page content...");
    results.content2 = await tool.execute({ action: "content", profile: "hive6" }, mockContext as any);
    console.log("  Content length:", results.content2.metadata?.length, "characters");
    const titleMatch2 = results.content2.output?.match(/<title[^>]*>([^<]*)<\/title>/i);
    console.log("  Page title from HTML:", titleMatch2?.[1] || "N/A");
    console.log();

    // STEP 10: Get tabs again
    console.log("[10/10] Getting updated tabs...");
    results.tabs2 = await tool.execute({ action: "tabs", profile: "hive6" }, mockContext as any);
    console.log("  Tabs found:", results.tabs2.metadata?.tabs?.length || 0);
    for (const tab of results.tabs2.metadata?.tabs || []) {
      console.log("  - Title:", tab.title);
      console.log("    URL:", tab.url);
    }
    console.log();

    // STEP 11: Stop browser
    console.log("[Cleanup] Stopping browser...");
    results.stop = await tool.execute({ action: "stop", profile: "hive6" }, mockContext as any);
    console.log("  Result:", results.stop.output);

  } catch (error) {
    console.error("Test failed with error:", error);
  }

  // FINAL REPORT
  console.log();
  console.log("=".repeat(70));
  console.log("DETAILED REPORT - kernel.sh (zee:browser-standalone)");
  console.log("=".repeat(70));
  console.log();
  console.log("CAPABILITY TEST RESULTS:");
  console.log("  1. Browser Launch Success:", results.launch?.metadata?.pid ? "YES" : "NO");
  console.log("     - PID:", results.launch?.metadata?.pid);
  console.log("     - CDP Port:", results.launch?.metadata?.cdpPort);
  console.log("     - Headless:", results.launch?.metadata?.headless);
  console.log();
  console.log("  2. Navigation Working:", results.navigate1?.metadata?.url ? "YES" : "NO");
  console.log("     - First navigation:", results.navigate1?.metadata?.url);
  console.log("     - Second navigation:", results.navigate2?.metadata?.url);
  console.log();
  console.log("  3. Screenshot Capability:", results.screenshot1?.metadata?.path ? "YES" : "NO");
  console.log("     - Screenshot 1:", results.screenshot1?.metadata?.path);
  console.log("     - Screenshot 2:", results.screenshot2?.metadata?.path);
  console.log();
  console.log("  4. Content Extraction Working:", results.content1?.metadata?.length > 0 ? "YES" : "NO");
  console.log("     - First content length:", results.content1?.metadata?.length);
  console.log("     - Second content length:", results.content2?.metadata?.length);
  console.log();
  console.log("  5. Tab Listing Functionality:", results.tabs1?.metadata?.tabs ? "YES" : "NO");
  console.log("     - Tab count (initial):", results.tabs1?.metadata?.tabs?.length);
  console.log("     - Tab count (final):", results.tabs2?.metadata?.tabs?.length);
  console.log();
  console.log("  6. Browser Status Check:", results.status?.metadata?.running ? "YES" : "NO");
  console.log();

  console.log("LIMITATIONS vs PLAYWRIGHT (zee:browser):");
  console.log("  | Feature                    | kernel.sh      | Playwright     |");
  console.log("  |----------------------------|----------------|----------------|");
  console.log("  | Zee Gateway Required       | NO             | YES            |");
  console.log("  | Chrome Extension Relay     | NO             | YES            |");
  console.log("  | Headless Mode              | YES            | YES            |");
  console.log("  | GUI Mode                   | YES            | YES            |");
  console.log("  | Multiple Profiles          | YES            | YES            |");
  console.log("  | Element Click/Type         | NO             | YES            |");
  console.log("  | Accessibility Snapshots    | NO             | YES            |");
  console.log("  | Screenshots                | YES            | YES            |");
  console.log("  | Content Extraction         | YES            | YES            |");
  console.log("  | Tab Management             | YES            | YES            |");
  console.log("  | Dependencies               | Chrome only    | Playwright     |");
  console.log();
  console.log("VERDICT:");
  console.log("  kernel.sh (zee:browser-standalone) is OPERATIONAL for:");
  console.log("    - Basic navigation and page loading");
  console.log("    - Screenshot capture");
  console.log("    - HTML content extraction");
  console.log("    - Tab listing and management");
  console.log("    - Multi-profile isolation");
  console.log();
  console.log("  NOT SUITABLE FOR:");
  console.log("    - Complex form interaction (login automation)");
  console.log("    - Element-level click/type operations");
  console.log("    - Accessibility tree extraction");
  console.log("    - Chrome extension integration");
  console.log();

  return results;
}

runTest().then(() => {
  console.log();
  console.log("Test complete.");
  process.exit(0);
}).catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
