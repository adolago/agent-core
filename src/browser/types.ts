/**
 * Browser Types for Agent-Core
 */

import type { Page, Browser, BrowserContext } from "playwright";

// ─────────────────────────────────────────────────────────────────────────────
// Browser Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface BrowserConfig {
  /** Run in headless mode (default: true) */
  headless?: boolean;
  /** Browser type: chromium, firefox, webkit */
  browserType?: "chromium" | "firefox" | "webkit";
  /** Viewport size */
  viewport?: { width: number; height: number };
  /** User agent string */
  userAgent?: string;
  /** Proxy configuration */
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
  /** Enable Stagehand AI capabilities */
  enableAI?: boolean;
  /** Anthropic API key for Stagehand (uses env if not provided) */
  anthropicApiKey?: string;
  /** Timeout for operations in ms */
  timeout?: number;
  /** Enable request interception */
  interceptRequests?: boolean;
  /** Block resource types (images, fonts, etc.) */
  blockResources?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser Session
// ─────────────────────────────────────────────────────────────────────────────

export interface BrowserSession {
  /** Unique session ID */
  id: string;
  /** Playwright browser instance */
  browser: Browser;
  /** Browser context */
  context: BrowserContext;
  /** Current page */
  page: Page;
  /** Session configuration */
  config: BrowserConfig;
  /** Session start time */
  startedAt: number;
  /** Current URL */
  currentUrl?: string;
  /** Navigation history */
  history: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Actions (Stagehand)
// ─────────────────────────────────────────────────────────────────────────────

export interface AIActionResult {
  /** Whether the action succeeded */
  success: boolean;
  /** Action that was performed */
  action: string;
  /** Result message */
  message?: string;
  /** Extracted data (if extraction action) */
  data?: unknown;
  /** Screenshot after action (base64) */
  screenshot?: string;
  /** Duration in ms */
  durationMs: number;
}

export interface ExtractionSchema {
  /** Field name */
  name: string;
  /** Description for AI */
  description: string;
  /** Expected type */
  type: "string" | "number" | "boolean" | "array" | "object";
  /** Whether field is required */
  required?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation & Interaction
// ─────────────────────────────────────────────────────────────────────────────

export interface NavigationResult {
  /** Whether navigation succeeded */
  success: boolean;
  /** Final URL after navigation */
  url: string;
  /** Page title */
  title?: string;
  /** HTTP status code */
  status?: number;
  /** Duration in ms */
  durationMs: number;
  /** Error message if failed */
  error?: string;
}

export interface ScreenshotOptions {
  /** Full page screenshot */
  fullPage?: boolean;
  /** Output format */
  type?: "png" | "jpeg";
  /** JPEG quality (0-100) */
  quality?: number;
  /** Element selector to screenshot */
  selector?: string;
}

export interface PDFOptions {
  /** Page format */
  format?: "A4" | "Letter" | "Legal";
  /** Print background graphics */
  printBackground?: boolean;
  /** Page margins */
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Content Extraction
// ─────────────────────────────────────────────────────────────────────────────

export interface PageContent {
  /** Page URL */
  url: string;
  /** Page title */
  title: string;
  /** Main text content (cleaned) */
  text: string;
  /** HTML content */
  html?: string;
  /** Markdown content */
  markdown?: string;
  /** Extracted links */
  links?: Array<{ text: string; href: string }>;
  /** Extracted images */
  images?: Array<{ alt: string; src: string }>;
  /** Metadata */
  metadata?: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────

export type BrowserEventType =
  | "navigation"
  | "action"
  | "extraction"
  | "error"
  | "console"
  | "request"
  | "response";

export interface BrowserEvent {
  type: BrowserEventType;
  timestamp: number;
  sessionId: string;
  data: unknown;
}

export type BrowserEventHandler = (event: BrowserEvent) => void;
