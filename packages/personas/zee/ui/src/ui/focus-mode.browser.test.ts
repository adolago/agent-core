import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ZeebotApp } from "./app";

const originalConnect = ZeebotApp.prototype.connect;

function mountApp(pathname: string) {
  window.history.replaceState({}, "", pathname);
  const app = document.createElement("zeebot-app") as ZeebotApp;
  document.body.append(app);
  return app;
}

beforeEach(() => {
  ZeebotApp.prototype.connect = () => {
    // no-op: avoid real gateway WS connections in browser tests
  };
  window.__ZEEBOT_CONTROL_UI_BASE_PATH__ = undefined;
  localStorage.clear();
  document.body.innerHTML = "";
});

afterEach(() => {
  ZeebotApp.prototype.connect = originalConnect;
  window.__ZEEBOT_CONTROL_UI_BASE_PATH__ = undefined;
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("chat focus mode", () => {
  it("collapses header + sidebar on chat tab only", async () => {
    const app = mountApp("/chat");
    await app.updateComplete;

    const shell = app.querySelector(".shell");
    expect(shell).not.toBeNull();
    expect(shell?.classList.contains("shell--chat-focus")).toBe(false);

    const toggle = app.querySelector<HTMLButtonElement>(
      'button[title^="Toggle focus mode"]',
    );
    expect(toggle).not.toBeNull();
    toggle?.click();

    await app.updateComplete;
    expect(shell?.classList.contains("shell--chat-focus")).toBe(true);

    const link = app.querySelector<HTMLAnchorElement>('a.nav-item[href="/channels"]');
    expect(link).not.toBeNull();
    link?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
    );

    await app.updateComplete;
    expect(app.tab).toBe("channels");
    expect(shell?.classList.contains("shell--chat-focus")).toBe(false);

    const chatLink = app.querySelector<HTMLAnchorElement>('a.nav-item[href="/chat"]');
    chatLink?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
    );

    await app.updateComplete;
    expect(app.tab).toBe("chat");
    expect(shell?.classList.contains("shell--chat-focus")).toBe(true);
  });
});
