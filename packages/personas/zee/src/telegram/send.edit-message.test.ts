import { beforeEach, describe, expect, it, vi } from "vitest";

const botApi = {
  editMessageText: vi.fn(),
};

vi.mock("./accounts.js", () => ({
  resolveTelegramAccount: vi.fn(() => ({
    accountId: "default",
    config: {},
    enabled: true,
    token: "",
    tokenSource: "none",
  })),
}));

vi.mock("../infra/retry-policy.js", () => ({
  createTelegramRetryRunner: vi.fn(() => async (fn: () => Promise<unknown>) => fn()),
}));

import { editMessageTelegram } from "./send.js";

describe("editMessageTelegram", () => {
  beforeEach(() => {
    botApi.editMessageText.mockReset();
  });

  it("keeps existing buttons when buttons is undefined (no reply_markup)", async () => {
    botApi.editMessageText.mockResolvedValue({ message_id: 1, chat: { id: "123" } });

    await editMessageTelegram("123", 1, "hi", {
      token: "tok",
      cfg: {},
      api: botApi,
    });

    expect(botApi.editMessageText).toHaveBeenCalledTimes(1);
    const call = botApi.editMessageText.mock.calls[0] ?? [];
    const params = call[3] as Record<string, unknown>;
    expect(params).toEqual(expect.objectContaining({ parse_mode: "HTML" }));
    expect(params).not.toHaveProperty("reply_markup");
  });

  it("removes buttons when buttons is empty (reply_markup.inline_keyboard = [])", async () => {
    botApi.editMessageText.mockResolvedValue({ message_id: 1, chat: { id: "123" } });

    await editMessageTelegram("123", 1, "hi", {
      token: "tok",
      cfg: {},
      buttons: [],
      api: botApi,
    });

    expect(botApi.editMessageText).toHaveBeenCalledTimes(1);
    const params = (botApi.editMessageText.mock.calls[0] ?? [])[3] as Record<string, unknown>;
    expect(params).toEqual(
      expect.objectContaining({
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [] },
      }),
    );
  });

  it("falls back to plain text when Telegram HTML parse fails (and preserves reply_markup)", async () => {
    botApi.editMessageText
      .mockRejectedValueOnce(new Error("400: Bad Request: can't parse entities"))
      .mockResolvedValueOnce({ message_id: 1, chat: { id: "123" } });

    await editMessageTelegram("123", 1, "<bad> html", {
      token: "tok",
      cfg: {},
      buttons: [],
      api: botApi,
    });

    expect(botApi.editMessageText).toHaveBeenCalledTimes(2);

    const firstParams = (botApi.editMessageText.mock.calls[0] ?? [])[3] as Record<string, unknown>;
    expect(firstParams).toEqual(
      expect.objectContaining({
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [] },
      }),
    );

    const secondParams = (botApi.editMessageText.mock.calls[1] ?? [])[3] as Record<string, unknown>;
    expect(secondParams).toEqual(
      expect.objectContaining({
        reply_markup: { inline_keyboard: [] },
      }),
    );
  });
});
