import { describe, expect, it, vi } from "vitest";

import type { MessageActionRunResult } from "../../infra/outbound/message-action-runner.js";
import { createMessageTool } from "./message-tool.js";

const mocks = vi.hoisted(() => ({
  runMessageAction: vi.fn(),
}));

vi.mock("../../infra/outbound/message-action-runner.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../infra/outbound/message-action-runner.js")
  >("../../infra/outbound/message-action-runner.js");
  return {
    ...actual,
    runMessageAction: mocks.runMessageAction,
  };
});

describe("message tool agent routing", () => {
  it("derives agentId from the session key", async () => {
    mocks.runMessageAction.mockClear();
    mocks.runMessageAction.mockResolvedValue({
      kind: "send",
      action: "send",
      channel: "telegram",
      handledBy: "plugin",
      payload: {},
      dryRun: true,
    } satisfies MessageActionRunResult);

    const tool = createMessageTool({
      agentSessionKey: "agent:alpha:main",
      config: {} as never,
    });

    await tool.execute("1", {
      action: "send",
      target: "telegram:123",
      message: "hi",
    });

    const call = mocks.runMessageAction.mock.calls[0]?.[0];
    expect(call?.agentId).toBe("alpha");
    expect(call?.sessionKey).toBeUndefined();
  });
});

describe("message tool path passthrough", () => {
  it("does not convert path to media for send", async () => {
    mocks.runMessageAction.mockClear();
    mocks.runMessageAction.mockResolvedValue({
      kind: "send",
      action: "send",
      channel: "telegram",
      to: "telegram:123",
      handledBy: "plugin",
      payload: {},
      dryRun: true,
    } satisfies MessageActionRunResult);

    const tool = createMessageTool({
      config: {} as never,
    });

    await tool.execute("1", {
      action: "send",
      target: "telegram:123",
      path: "~/Downloads/voice.ogg",
      message: "",
    });

    const call = mocks.runMessageAction.mock.calls[0]?.[0];
    expect(call?.params?.path).toBe("~/Downloads/voice.ogg");
    expect(call?.params?.media).toBeUndefined();
  });

  it("does not convert filePath to media for send", async () => {
    mocks.runMessageAction.mockClear();
    mocks.runMessageAction.mockResolvedValue({
      kind: "send",
      action: "send",
      channel: "telegram",
      to: "telegram:123",
      handledBy: "plugin",
      payload: {},
      dryRun: true,
    } satisfies MessageActionRunResult);

    const tool = createMessageTool({
      config: {} as never,
    });

    await tool.execute("1", {
      action: "send",
      target: "telegram:123",
      filePath: "./tmp/note.m4a",
      message: "",
    });

    const call = mocks.runMessageAction.mock.calls[0]?.[0];
    expect(call?.params?.filePath).toBe("./tmp/note.m4a");
    expect(call?.params?.media).toBeUndefined();
  });
});
