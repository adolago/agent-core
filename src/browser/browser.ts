/**
 * AgentBrowser - AI-native web browser for Agent-Core
 *
 * Combines Playwright for browser control with Stagehand for AI actions.
 */

import { chromium, firefox, webkit } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";
import { Stagehand } from "@browserbasehq/stagehand";

import type {
  BrowserConfig,
  BrowserSession,
  AIActionResult,
  ExtractionSchema,
  NavigationResult,
  ScreenshotOptions,
  PDFOptions,
  PageContent,
  BrowserEvent,
  BrowserEventHandler,
} from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Default Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: BrowserConfig = {
  headless: true,
  browserType: "chromium",
  viewport: { width: 1280, height: 720 },
  enableAI: true,
  timeout: 30000,
  interceptRequests: false,
  blockResources: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// AgentBrowser Class
// ─────────────────────────────────────────────────────────────────────────────

export class AgentBrowser {
  private sessions: Map<string, BrowserSession> = new Map();
  private stagehand: Stagehand | null = null;
  private eventHandlers: BrowserEventHandler[] = [];
  private config: BrowserConfig;

  constructor(config?: Partial<BrowserConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Session Management
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Create a new browser session.
   */
  async createSession(
    sessionConfig?: Partial<BrowserConfig>,
  ): Promise<BrowserSession> {
    const config = { ...this.config, ...sessionConfig };
    const sessionId = `browser-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    // Launch browser
    const browserLauncher =
      config.browserType === "firefox"
        ? firefox
        : config.browserType === "webkit"
          ? webkit
          : chromium;

    const browser = await browserLauncher.launch({
      headless: config.headless,
      proxy: config.proxy,
    });

    // Create context
    const context = await browser.newContext({
      viewport: config.viewport,
      userAgent: config.userAgent,
    });

    // Create page
    const page = await context.newPage();

    // Set timeout
    page.setDefaultTimeout(config.timeout ?? 30000);

    // Setup request interception if enabled
    if (config.interceptRequests || (config.blockResources?.length ?? 0) > 0) {
      await this.setupRequestInterception(page, config);
    }

    // Initialize Stagehand if AI enabled
    if (config.enableAI) {
      await this.initStagehand(page, config);
    }

    const session: BrowserSession = {
      id: sessionId,
      browser,
      context,
      page,
      config,
      startedAt: Date.now(),
      history: [],
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Get an existing session.
   */
  getSession(sessionId: string): BrowserSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Close a session.
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.browser.close();
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Close all sessions.
   */
  async closeAll(): Promise<void> {
    for (const session of this.sessions.values()) {
      await session.browser.close();
    }
    this.sessions.clear();
    if (this.stagehand) {
      await this.stagehand.close();
      this.stagehand = null;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Navigation
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Navigate to a URL.
   */
  async goto(
    sessionId: string,
    url: string,
    options?: { waitUntil?: "load" | "domcontentloaded" | "networkidle" },
  ): Promise<NavigationResult> {
    const session = this.getSessionOrThrow(sessionId);
    const startTime = Date.now();

    try {
      const response = await session.page.goto(url, {
        waitUntil: options?.waitUntil ?? "domcontentloaded",
      });

      session.currentUrl = session.page.url();
      session.history.push(session.currentUrl);

      this.emitEvent({
        type: "navigation",
        timestamp: Date.now(),
        sessionId,
        data: { url: session.currentUrl },
      });

      return {
        success: true,
        url: session.currentUrl,
        title: await session.page.title(),
        status: response?.status(),
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        url,
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Go back in history.
   */
  async goBack(sessionId: string): Promise<NavigationResult> {
    const session = this.getSessionOrThrow(sessionId);
    const startTime = Date.now();

    try {
      await session.page.goBack();
      session.currentUrl = session.page.url();

      return {
        success: true,
        url: session.currentUrl,
        title: await session.page.title(),
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        url: session.currentUrl ?? "",
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Reload the current page.
   */
  async reload(sessionId: string): Promise<NavigationResult> {
    const session = this.getSessionOrThrow(sessionId);
    const startTime = Date.now();

    try {
      await session.page.reload();

      return {
        success: true,
        url: session.page.url(),
        title: await session.page.title(),
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        url: session.currentUrl ?? "",
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // AI Actions (Stagehand)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Perform an AI-driven action on the page.
   * Examples: "click the login button", "fill the search box with 'query'"
   */
  async act(sessionId: string, action: string): Promise<AIActionResult> {
    const session = this.getSessionOrThrow(sessionId);
    const startTime = Date.now();

    if (!this.stagehand) {
      return {
        success: false,
        action,
        message: "Stagehand not initialized. Enable AI in config.",
        durationMs: Date.now() - startTime,
      };
    }

    try {
      await this.stagehand.act({ action });

      this.emitEvent({
        type: "action",
        timestamp: Date.now(),
        sessionId,
        data: { action },
      });

      return {
        success: true,
        action,
        message: `Performed: ${action}`,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        action,
        message: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Extract structured data from the page using AI.
   */
  async extract<T = unknown>(
    sessionId: string,
    instruction: string,
    schema?: ExtractionSchema[],
  ): Promise<AIActionResult & { data?: T }> {
    const session = this.getSessionOrThrow(sessionId);
    const startTime = Date.now();

    if (!this.stagehand) {
      return {
        success: false,
        action: "extract",
        message: "Stagehand not initialized. Enable AI in config.",
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const data = await this.stagehand.extract({
        instruction,
        schema: schema as any,
      });

      this.emitEvent({
        type: "extraction",
        timestamp: Date.now(),
        sessionId,
        data: { instruction, result: data },
      });

      return {
        success: true,
        action: "extract",
        message: `Extracted: ${instruction}`,
        data: data as T,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        action: "extract",
        message: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Observe the page and get AI description.
   */
  async observe(sessionId: string, instruction?: string): Promise<AIActionResult> {
    const session = this.getSessionOrThrow(sessionId);
    const startTime = Date.now();

    if (!this.stagehand) {
      return {
        success: false,
        action: "observe",
        message: "Stagehand not initialized. Enable AI in config.",
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const observations = await this.stagehand.observe({
        instruction: instruction ?? "Describe what you see on this page",
      });

      return {
        success: true,
        action: "observe",
        data: observations,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        action: "observe",
        message: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
      };
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Direct Playwright Actions
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Click an element by selector.
   */
  async click(sessionId: string, selector: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    await session.page.click(selector);
  }

  /**
   * Fill an input field.
   */
  async fill(sessionId: string, selector: string, value: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    await session.page.fill(selector, value);
  }

  /**
   * Type text with keyboard simulation.
   */
  async type(
    sessionId: string,
    selector: string,
    text: string,
    options?: { delay?: number },
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    await session.page.type(selector, text, { delay: options?.delay });
  }

  /**
   * Press a key.
   */
  async press(sessionId: string, key: string): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    await session.page.keyboard.press(key);
  }

  /**
   * Select from dropdown.
   */
  async select(
    sessionId: string,
    selector: string,
    value: string | string[],
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    await session.page.selectOption(selector, value);
  }

  /**
   * Wait for an element.
   */
  async waitFor(
    sessionId: string,
    selector: string,
    options?: { timeout?: number; state?: "attached" | "visible" | "hidden" },
  ): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    await session.page.waitForSelector(selector, options);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Content Extraction
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get page content as structured data.
   */
  async getContent(
    sessionId: string,
    options?: { includeHtml?: boolean; includeMarkdown?: boolean },
  ): Promise<PageContent> {
    const session = this.getSessionOrThrow(sessionId);
    const page = session.page;

    const [title, text, html] = await Promise.all([
      page.title(),
      page.innerText("body").catch(() => ""),
      options?.includeHtml ? page.content() : Promise.resolve(undefined),
    ]);

    // Extract links
    const links = await page.$$eval("a[href]", (anchors) =>
      anchors
        .map((a) => ({
          text: a.textContent?.trim() ?? "",
          href: a.getAttribute("href") ?? "",
        }))
        .filter((l) => l.href && !l.href.startsWith("javascript:")),
    );

    // Extract images
    const images = await page.$$eval("img[src]", (imgs) =>
      imgs.map((img) => ({
        alt: img.getAttribute("alt") ?? "",
        src: img.getAttribute("src") ?? "",
      })),
    );

    // Extract metadata
    const metadata = await page.$$eval("meta", (metas) => {
      const result: Record<string, string> = {};
      metas.forEach((meta) => {
        const name =
          meta.getAttribute("name") ??
          meta.getAttribute("property") ??
          meta.getAttribute("itemprop");
        const content = meta.getAttribute("content");
        if (name && content) {
          result[name] = content;
        }
      });
      return result;
    });

    return {
      url: page.url(),
      title,
      text: text.replace(/\s+/g, " ").trim(),
      html,
      links,
      images,
      metadata,
    };
  }

  /**
   * Take a screenshot.
   */
  async screenshot(
    sessionId: string,
    options?: ScreenshotOptions,
  ): Promise<Buffer> {
    const session = this.getSessionOrThrow(sessionId);

    if (options?.selector) {
      const element = await session.page.$(options.selector);
      if (!element) {
        throw new Error(`Element not found: ${options.selector}`);
      }
      return element.screenshot({
        type: options.type ?? "png",
        quality: options.quality,
      });
    }

    return session.page.screenshot({
      fullPage: options?.fullPage ?? false,
      type: options.type ?? "png",
      quality: options.quality,
    });
  }

  /**
   * Generate PDF of the page.
   */
  async pdf(sessionId: string, options?: PDFOptions): Promise<Buffer> {
    const session = this.getSessionOrThrow(sessionId);
    return session.page.pdf({
      format: options?.format ?? "A4",
      printBackground: options?.printBackground ?? true,
      margin: options?.margin,
    });
  }

  /**
   * Evaluate JavaScript in page context.
   */
  async evaluate<T>(sessionId: string, fn: () => T): Promise<T> {
    const session = this.getSessionOrThrow(sessionId);
    return session.page.evaluate(fn);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Events
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Subscribe to browser events.
   */
  onEvent(handler: BrowserEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index >= 0) {
        this.eventHandlers.splice(index, 1);
      }
    };
  }

  private emitEvent(event: BrowserEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ───────────────────────────────────────────────────────────────────────────

  private getSessionOrThrow(sessionId: string): BrowserSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Browser session not found: ${sessionId}`);
    }
    return session;
  }

  private async initStagehand(
    page: Page,
    config: BrowserConfig,
  ): Promise<void> {
    try {
      this.stagehand = new Stagehand({
        env: "LOCAL",
        enableCaching: true,
        modelName: "claude-3-5-sonnet-latest",
        modelClientOptions: {
          apiKey: config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY,
        },
      });

      await this.stagehand.init({ page });
    } catch (err) {
      console.warn("Failed to initialize Stagehand:", err);
      this.stagehand = null;
    }
  }

  private async setupRequestInterception(
    page: Page,
    config: BrowserConfig,
  ): Promise<void> {
    await page.route("**/*", (route) => {
      const resourceType = route.request().resourceType();

      if (config.blockResources?.includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new AgentBrowser instance.
 */
export function createBrowser(config?: Partial<BrowserConfig>): AgentBrowser {
  return new AgentBrowser(config);
}

/**
 * Quick browse - create session, navigate, get content, close.
 */
export async function quickBrowse(
  url: string,
  options?: { extractText?: boolean; screenshot?: boolean },
): Promise<{
  content: PageContent;
  screenshot?: Buffer;
}> {
  const browser = createBrowser({ enableAI: false });
  const session = await browser.createSession();

  try {
    await browser.goto(session.id, url);
    const content = await browser.getContent(session.id);

    let screenshot: Buffer | undefined;
    if (options?.screenshot) {
      screenshot = await browser.screenshot(session.id, { fullPage: true });
    }

    return { content, screenshot };
  } finally {
    await browser.closeAll();
  }
}
