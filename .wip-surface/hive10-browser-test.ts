#!/usr/bin/env bun
/**
 * Hive Drone 10 - Comprehensive Browser Standalone Test
 * Testing zee:browser-standalone tool on LinkedIn
 */

import { standaloneBrowserTool } from "../src/domain/zee/browser-standalone";

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function runTest() {
  const profile = "hive10";
  const results: any[] = [];
  
  console.log("=" .repeat(70));
  console.log("HIVE DRONE 10 - BROWSER STANDALONE COMPREHENSIVE TEST");
  console.log("Profile:", profile);
  console.log("Target: LinkedIn Company Pages");
  console.log("=" .repeat(70));
  console.log();

  const mockCtx = {
    metadata: (data: any) => console.log("[CTX]", JSON.stringify(data)),
  };

  // Initialize the tool
  const tool = await standaloneBrowserTool.init!();

  // STEP 1: Launch browser
  console.log("\n--- STEP 1: Launch Browser ---");
  const launchResult = await tool.execute!(
    { action: "launch", profile, headless: true },
    mockCtx as any
  );
  console.log("Result:", JSON.stringify(launchResult, null, 2));
  results.push({ step: 1, action: "launch", result: launchResult });
  await delay(2000);

  // STEP 2: Navigate to LinkedIn login
  console.log("\n--- STEP 2: Navigate to LinkedIn Login ---");
  const navLoginResult = await tool.execute!(
    { action: "navigate", profile, url: "https://www.linkedin.com/login" },
    mockCtx as any
  );
  console.log("Result:", JSON.stringify(navLoginResult, null, 2));
  results.push({ step: 2, action: "navigate-login", result: navLoginResult });
  await delay(3000);

  // STEP 3: Screenshot of login page
  console.log("\n--- STEP 3: Screenshot (Login Page) ---");
  const screenshot1Result = await tool.execute!(
    { action: "screenshot", profile },
    mockCtx as any
  );
  console.log("Result:", JSON.stringify(screenshot1Result, null, 2));
  results.push({ step: 3, action: "screenshot-login", result: screenshot1Result });

  // STEP 4: Get page content and extract title
  console.log("\n--- STEP 4: Get Page Content (Login Page) ---");
  const content1Result = await tool.execute!(
    { action: "content", profile },
    mockCtx as any
  );
  const titleMatch = content1Result.output?.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1] : "Not found";
  console.log("Title tag:", title);
  console.log("Content length:", content1Result.metadata?.length);
  results.push({ step: 4, action: "content-login", title, result: content1Result });

  // STEP 5: Navigate to LinkedIn company page
  console.log("\n--- STEP 5: Navigate to LinkedIn Company Page ---");
  const navCompanyResult = await tool.execute!(
    { action: "navigate", profile, url: "https://www.linkedin.com/company/linkedin/" },
    mockCtx as any
  );
  console.log("Result:", JSON.stringify(navCompanyResult, null, 2));
  results.push({ step: 5, action: "navigate-company", result: navCompanyResult });
  await delay(3000);

  // STEP 6: Screenshot of company page
  console.log("\n--- STEP 6: Screenshot (Company Page) ---");
  const screenshot2Result = await tool.execute!(
    { action: "screenshot", profile },
    mockCtx as any
  );
  console.log("Result:", JSON.stringify(screenshot2Result, null, 2));
  results.push({ step: 6, action: "screenshot-company", result: screenshot2Result });

  // STEP 7: Get page content and extract company info
  console.log("\n--- STEP 7: Get Page Content (Company Page) ---");
  const content2Result = await tool.execute!(
    { action: "content", profile },
    mockCtx as any
  );
  
  // Extract company info
  const companyNameMatch = content2Result.output?.match(/<title>([^<]+)<\/title>/i);
  const companyName = companyNameMatch ? companyNameMatch[1] : "Not found";
  
  // Look for meta descriptions or company info
  const metaDescMatch = content2Result.output?.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  const metaDescription = metaDescMatch ? metaDescMatch[1] : "Not found";
  
  console.log("Company Page Title:", companyName);
  console.log("Meta Description:", metaDescription.substring(0, 200) + "...");
  console.log("Content length:", content2Result.metadata?.length);
  results.push({ step: 7, action: "content-company", companyName, metaDescription, result: content2Result });

  // STEP 8: List tabs with full details
  console.log("\n--- STEP 8: List Tabs ---");
  const tabsResult = await tool.execute!(
    { action: "tabs", profile },
    mockCtx as any
  );
  console.log("Result:", JSON.stringify(tabsResult, null, 2));
  results.push({ step: 8, action: "tabs", result: tabsResult });

  // STEP 9: Check browser status
  console.log("\n--- STEP 9: Browser Status ---");
  const statusResult = await tool.execute!(
    { action: "status", profile },
    mockCtx as any
  );
  console.log("Result:", JSON.stringify(statusResult, null, 2));
  results.push({ step: 9, action: "status", result: statusResult });

  // STEP 10: Navigate to LinkedIn about page
  console.log("\n--- STEP 10: Navigate to LinkedIn About Page ---");
  const navAboutResult = await tool.execute!(
    { action: "navigate", profile, url: "https://www.linkedin.com/about/" },
    mockCtx as any
  );
  console.log("Result:", JSON.stringify(navAboutResult, null, 2));
  results.push({ step: 10, action: "navigate-about", result: navAboutResult });
  await delay(3000);

  // STEP 11: Final screenshot
  console.log("\n--- STEP 11: Final Screenshot (About Page) ---");
  const screenshot3Result = await tool.execute!(
    { action: "screenshot", profile },
    mockCtx as any
  );
  console.log("Result:", JSON.stringify(screenshot3Result, null, 2));
  results.push({ step: 11, action: "screenshot-about", result: screenshot3Result });

  // FINAL REPORT
  console.log("\n" + "=".repeat(70));
  console.log("TEST COMPLETE - FINAL REPORT");
  console.log("=".repeat(70));
  
  console.log("\n--- Screenshots Taken ---");
  results
    .filter(r => r.action.includes("screenshot"))
    .forEach(r => {
      console.log(`Step ${r.step}: ${r.result.metadata?.path || "N/A"}`);
    });

  console.log("\n--- Browser Instance Details ---");
  const statusRes = results.find(r => r.action === "status")?.result;
  if (statusRes?.metadata) {
    console.log(`Profile: ${statusRes.metadata.profile}`);
    console.log(`Running: ${statusRes.metadata.running}`);
    console.log(`PID: ${statusRes.metadata.pid}`);
    console.log(`CDP Port: ${statusRes.metadata.cdpPort}`);
    console.log(`Tab Count: ${statusRes.metadata.tabCount}`);
    console.log(`Launched: ${statusRes.metadata.launchedAt}`);
  }

  console.log("\n--- Content Extraction Results ---");
  const loginContent = results.find(r => r.action === "content-login");
  const companyContent = results.find(r => r.action === "content-company");
  console.log(`Login Page Title: ${loginContent?.title}`);
  console.log(`Company Page Title: ${companyContent?.companyName}`);
  console.log(`Company Description: ${companyContent?.metaDescription?.substring(0, 150)}...`);

  // Stop browser
  console.log("\n--- Stopping Browser ---");
  const stopResult = await tool.execute!(
    { action: "stop", profile },
    mockCtx as any
  );
  console.log("Result:", JSON.stringify(stopResult, null, 2));

  console.log("\n" + "=".repeat(70));
  console.log("ALL TESTS COMPLETED SUCCESSFULLY");
  console.log("=".repeat(70));

  return results;
}

runTest().catch(console.error);
