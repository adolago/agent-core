import { describe, expect, it, vi } from "vitest";

describe("pw-session getPageForTargetId", () => {
  it("falls back to /json/list URL matching when CDP session attachment is blocked", async () => {
    vi.resetModules();

    const pageOn = vi.fn();
    const contextOn = vi.fn();
    const browserOn = vi.fn();
    const browserClose = vi.fn(async () => {});

    const context = {
      pages: () => [],
      on: contextOn,
      newCDPSession: vi.fn(async () => {
        throw new Error("Not allowed");
      }),
    } as unknown as import("playwright-core").BrowserContext;

    const pageA = {
      on: pageOn,
      context: () => context,
      url: () => "https://example.com/a",
    } as unknown as import("playwright-core").Page;

    const pageB = {
      on: pageOn,
      context: () => context,
      url: () => "https://example.com/b",
    } as unknown as import("playwright-core").Page;

    // Fill pages() after pages exist.
    (context as unknown as { pages: () => unknown[] }).pages = () => [pageA, pageB];

    const browser = {
      contexts: () => [context],
      on: browserOn,
      close: browserClose,
    } as unknown as import("playwright-core").Browser;

    vi.doMock("playwright-core", () => ({
      chromium: {
        connectOverCDP: vi.fn(async () => browser),
      },
    }));

    vi.doMock("./chrome.js", () => ({
      getChromeWebSocketUrl: vi.fn(async () => null),
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (!String(url).includes("/json/list")) {
          throw new Error(`unexpected fetch url: ${url}`);
        }
        return {
          ok: true,
          json: async () => [{ id: "TAB_B", url: "https://example.com/b" }],
        } as unknown as Response;
      }),
    );

    const mod = await import("./pw-session.js");
    const resolved = await mod.getPageForTargetId({
      cdpUrl: "http://127.0.0.1:18792",
      targetId: "TAB_B",
    });
    expect(resolved).toBe(pageB);

    await mod.closePlaywrightBrowserConnection();
    expect(browserClose).toHaveBeenCalled();
  });
});

