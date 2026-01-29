import { describe, expect, it } from "vitest";

import type { ZeeConfig } from "../../config/config.js";
import type { TemplateContext } from "../templating.js";
import { buildThreadingToolContext } from "./agent-runner-utils.js";

describe("buildThreadingToolContext", () => {
  const cfg = {} as ZeeConfig;

  it("uses conversation id for WhatsApp", () => {
    const sessionCtx = {
      Provider: "whatsapp",
      From: "123@g.us",
      To: "+15550001",
    } as TemplateContext;

    const result = buildThreadingToolContext({
      sessionCtx,
      config: cfg,
      hasRepliedRef: undefined,
    });

    expect(result.currentChannelId).toBe("123@g.us");
  });

  it("falls back to To for WhatsApp when From is missing", () => {
    const sessionCtx = {
      Provider: "whatsapp",
      To: "+15550001",
    } as TemplateContext;

    const result = buildThreadingToolContext({
      sessionCtx,
      config: cfg,
      hasRepliedRef: undefined,
    });

    expect(result.currentChannelId).toBe("+15550001");
  });

  it("uses the recipient id for other channels", () => {
    const sessionCtx = {
      Provider: "telegram",
      From: "user:42",
      To: "chat:99",
    } as TemplateContext;

    const result = buildThreadingToolContext({
      sessionCtx,
      config: cfg,
      hasRepliedRef: undefined,
    });

    expect(result.currentChannelId).toBe("chat:99");
  });

  it("prefers MessageThreadId for Slack tool threading", () => {
    const sessionCtx = {
      Provider: "slack",
      To: "channel:C1",
      MessageThreadId: "123.456",
    } as TemplateContext;

    const result = buildThreadingToolContext({
      sessionCtx,
      config: { channels: { slack: { replyToMode: "all" } } } as ZeeConfig,
      hasRepliedRef: undefined,
    });

    expect(result.currentChannelId).toBe("C1");
    expect(result.currentThreadTs).toBe("123.456");
  });
});
