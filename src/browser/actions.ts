/**
 * Browser Actions - High-level actions for AI agents
 *
 * Pre-built action chains that combine multiple browser operations
 * for common agent tasks.
 */

import { AgentBrowser, createBrowser, quickBrowse } from "./browser.js";
import type {
  BrowserConfig,
  AIActionResult,
  PageContent,
  NavigationResult,
} from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Action Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface FormFillData {
  [selector: string]: string;
}

export interface ScrapedData<T = unknown> {
  url: string;
  timestamp: number;
  data: T;
  screenshot?: string; // base64
}

export interface AuthenticationResult {
  success: boolean;
  message: string;
  cookies?: Array<{ name: string; value: string; domain: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Search Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Perform a web search and extract results.
 */
export async function webSearch(
  query: string,
  options?: {
    engine?: "google" | "duckduckgo" | "bing";
    maxResults?: number;
    config?: Partial<BrowserConfig>;
  },
): Promise<SearchResult[]> {
  const browser = createBrowser({
    enableAI: true,
    ...options?.config,
  });

  const session = await browser.createSession();

  try {
    const engine = options?.engine ?? "duckduckgo";
    const searchUrls = {
      google: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      duckduckgo: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
      bing: `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
    };

    await browser.goto(session.id, searchUrls[engine]);

    // Use AI to extract search results
    const extraction = await browser.extract<SearchResult[]>(
      session.id,
      `Extract the top ${options?.maxResults ?? 10} search results. For each result, get the title, URL, and snippet/description.`,
    );

    return extraction.data ?? [];
  } finally {
    await browser.closeAll();
  }
}

/**
 * Search and summarize the first result page.
 */
export async function searchAndSummarize(
  query: string,
  options?: { config?: Partial<BrowserConfig> },
): Promise<{ query: string; results: SearchResult[]; summary?: string }> {
  const browser = createBrowser({
    enableAI: true,
    ...options?.config,
  });

  const session = await browser.createSession();

  try {
    // Search
    await browser.goto(
      session.id,
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
    );

    // Extract results
    const extraction = await browser.extract<SearchResult[]>(
      session.id,
      "Extract the top 5 search results with title, URL, and snippet.",
    );

    // Get the first result and navigate
    const results = extraction.data ?? [];
    let summary: string | undefined;

    if (results.length > 0 && results[0].url) {
      await browser.goto(session.id, results[0].url);
      const observe = await browser.observe(
        session.id,
        "Summarize the main content of this page in 2-3 sentences.",
      );
      summary =
        typeof observe.data === "string"
          ? observe.data
          : JSON.stringify(observe.data);
    }

    return { query, results, summary };
  } finally {
    await browser.closeAll();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scraping Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scrape a single page and extract structured data.
 */
export async function scrapePage<T = unknown>(
  url: string,
  instruction: string,
  options?: {
    screenshot?: boolean;
    config?: Partial<BrowserConfig>;
  },
): Promise<ScrapedData<T>> {
  const browser = createBrowser({
    enableAI: true,
    ...options?.config,
  });

  const session = await browser.createSession();

  try {
    await browser.goto(session.id, url);

    const extraction = await browser.extract<T>(session.id, instruction);

    let screenshot: string | undefined;
    if (options?.screenshot) {
      const buffer = await browser.screenshot(session.id, { fullPage: true });
      screenshot = buffer.toString("base64");
    }

    return {
      url,
      timestamp: Date.now(),
      data: extraction.data as T,
      screenshot,
    };
  } finally {
    await browser.closeAll();
  }
}

/**
 * Scrape multiple pages in sequence.
 */
export async function scrapePages<T = unknown>(
  urls: string[],
  instruction: string,
  options?: {
    screenshot?: boolean;
    config?: Partial<BrowserConfig>;
  },
): Promise<ScrapedData<T>[]> {
  const browser = createBrowser({
    enableAI: true,
    ...options?.config,
  });

  const session = await browser.createSession();
  const results: ScrapedData<T>[] = [];

  try {
    for (const url of urls) {
      await browser.goto(session.id, url);
      const extraction = await browser.extract<T>(session.id, instruction);

      let screenshot: string | undefined;
      if (options?.screenshot) {
        const buffer = await browser.screenshot(session.id);
        screenshot = buffer.toString("base64");
      }

      results.push({
        url,
        timestamp: Date.now(),
        data: extraction.data as T,
        screenshot,
      });
    }

    return results;
  } finally {
    await browser.closeAll();
  }
}

/**
 * Follow links and scrape multiple pages.
 */
export async function crawlAndScrape<T = unknown>(
  startUrl: string,
  options: {
    linkSelector?: string;
    maxPages?: number;
    instruction: string;
    config?: Partial<BrowserConfig>;
  },
): Promise<ScrapedData<T>[]> {
  const browser = createBrowser({
    enableAI: true,
    ...options.config,
  });

  const session = await browser.createSession();
  const visited = new Set<string>();
  const results: ScrapedData<T>[] = [];
  const maxPages = options.maxPages ?? 5;

  try {
    await browser.goto(session.id, startUrl);

    // Scrape start page
    const firstExtraction = await browser.extract<T>(
      session.id,
      options.instruction,
    );
    results.push({
      url: startUrl,
      timestamp: Date.now(),
      data: firstExtraction.data as T,
    });
    visited.add(startUrl);

    // Get links
    const content = await browser.getContent(session.id);
    const links =
      content.links
        ?.filter(
          (l) =>
            l.href.startsWith("http") &&
            !visited.has(l.href) &&
            new URL(l.href).hostname === new URL(startUrl).hostname,
        )
        .slice(0, maxPages - 1) ?? [];

    // Crawl links
    for (const link of links) {
      if (results.length >= maxPages) break;
      if (visited.has(link.href)) continue;

      visited.add(link.href);
      await browser.goto(session.id, link.href);

      const extraction = await browser.extract<T>(
        session.id,
        options.instruction,
      );
      results.push({
        url: link.href,
        timestamp: Date.now(),
        data: extraction.data as T,
      });
    }

    return results;
  } finally {
    await browser.closeAll();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Form Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fill a form using AI to identify fields.
 */
export async function fillForm(
  url: string,
  data: Record<string, string>,
  options?: {
    submit?: boolean;
    submitSelector?: string;
    config?: Partial<BrowserConfig>;
  },
): Promise<AIActionResult> {
  const browser = createBrowser({
    enableAI: true,
    ...options?.config,
  });

  const session = await browser.createSession();

  try {
    await browser.goto(session.id, url);

    // Fill each field using AI
    for (const [field, value] of Object.entries(data)) {
      await browser.act(
        session.id,
        `Fill the "${field}" field with "${value}"`,
      );
    }

    // Submit if requested
    if (options?.submit) {
      if (options.submitSelector) {
        await browser.click(session.id, options.submitSelector);
      } else {
        await browser.act(session.id, "Click the submit button");
      }
    }

    return {
      success: true,
      action: "fillForm",
      message: `Filled form with ${Object.keys(data).length} fields`,
      durationMs: 0,
    };
  } catch (err) {
    return {
      success: false,
      action: "fillForm",
      message: err instanceof Error ? err.message : String(err),
      durationMs: 0,
    };
  } finally {
    await browser.closeAll();
  }
}

/**
 * Fill a login form.
 */
export async function login(
  url: string,
  credentials: { username: string; password: string },
  options?: {
    usernameField?: string;
    passwordField?: string;
    submitButton?: string;
    config?: Partial<BrowserConfig>;
  },
): Promise<AuthenticationResult> {
  const browser = createBrowser({
    enableAI: true,
    ...options?.config,
  });

  const session = await browser.createSession();

  try {
    await browser.goto(session.id, url);

    // Fill credentials
    if (options?.usernameField && options?.passwordField) {
      await browser.fill(session.id, options.usernameField, credentials.username);
      await browser.fill(session.id, options.passwordField, credentials.password);
    } else {
      await browser.act(
        session.id,
        `Fill the username/email field with "${credentials.username}"`,
      );
      await browser.act(
        session.id,
        `Fill the password field with "${credentials.password}"`,
      );
    }

    // Submit
    if (options?.submitButton) {
      await browser.click(session.id, options.submitButton);
    } else {
      await browser.act(session.id, "Click the login/submit button");
    }

    // Wait for navigation
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check if login succeeded
    const observe = await browser.observe(
      session.id,
      "Did the login succeed? Look for error messages or signs of being logged in.",
    );

    const success =
      typeof observe.data === "string"
        ? !observe.data.toLowerCase().includes("error") &&
          !observe.data.toLowerCase().includes("failed")
        : true;

    // Get cookies if successful
    const cookies = success
      ? await session.context.cookies()
      : undefined;

    return {
      success,
      message: success ? "Login successful" : "Login may have failed",
      cookies: cookies?.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
      })),
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await browser.closeAll();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Navigate through a multi-step process.
 */
export async function navigateSteps(
  startUrl: string,
  steps: string[],
  options?: { config?: Partial<BrowserConfig> },
): Promise<{ success: boolean; finalUrl: string; results: AIActionResult[] }> {
  const browser = createBrowser({
    enableAI: true,
    ...options?.config,
  });

  const session = await browser.createSession();
  const results: AIActionResult[] = [];

  try {
    await browser.goto(session.id, startUrl);

    for (const step of steps) {
      const result = await browser.act(session.id, step);
      results.push(result);

      if (!result.success) {
        return {
          success: false,
          finalUrl: session.page.url(),
          results,
        };
      }

      // Small delay between steps
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return {
      success: true,
      finalUrl: session.page.url(),
      results,
    };
  } finally {
    await browser.closeAll();
  }
}

/**
 * Download a file from a URL.
 */
export async function downloadFile(
  url: string,
  options?: {
    clickSelector?: string;
    config?: Partial<BrowserConfig>;
  },
): Promise<{ success: boolean; filename?: string; error?: string }> {
  const browser = createBrowser({
    enableAI: false,
    ...options?.config,
  });

  const session = await browser.createSession();

  try {
    // Set up download handling
    const [download] = await Promise.all([
      session.page.waitForEvent("download"),
      options?.clickSelector
        ? session.page.click(options.clickSelector)
        : session.page.goto(url),
    ]);

    const filename = download.suggestedFilename();
    await download.saveAs(`/tmp/${filename}`);

    return { success: true, filename };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await browser.closeAll();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Monitoring Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Monitor a page for changes.
 */
export async function monitorPage(
  url: string,
  options: {
    selector?: string;
    instruction?: string;
    interval?: number;
    maxChecks?: number;
    onChange?: (data: { previous?: string; current: string }) => void;
    config?: Partial<BrowserConfig>;
  },
): Promise<{ changed: boolean; finalContent: string }> {
  const browser = createBrowser({
    enableAI: !!options.instruction,
    ...options?.config,
  });

  const session = await browser.createSession();
  let previousContent: string | undefined;
  let changed = false;

  try {
    const checks = options.maxChecks ?? 10;
    const interval = options.interval ?? 5000;

    for (let i = 0; i < checks; i++) {
      await browser.goto(session.id, url);

      let currentContent: string;

      if (options.selector) {
        currentContent = await session.page
          .locator(options.selector)
          .innerText();
      } else if (options.instruction) {
        const extraction = await browser.extract<string>(
          session.id,
          options.instruction,
        );
        currentContent = JSON.stringify(extraction.data);
      } else {
        const content = await browser.getContent(session.id);
        currentContent = content.text.slice(0, 1000);
      }

      if (previousContent !== undefined && previousContent !== currentContent) {
        changed = true;
        options.onChange?.({ previous: previousContent, current: currentContent });
        return { changed: true, finalContent: currentContent };
      }

      previousContent = currentContent;

      if (i < checks - 1) {
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }

    return { changed: false, finalContent: previousContent ?? "" };
  } finally {
    await browser.closeAll();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Exports
// ─────────────────────────────────────────────────────────────────────────────

export { createBrowser, quickBrowse, AgentBrowser };
