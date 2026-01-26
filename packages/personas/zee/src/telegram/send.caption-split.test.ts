import { beforeEach, describe, expect, it, vi } from "vitest";

const { botApi, botCtorSpy, loadConfig, mockLoadWebMedia } = vi.hoisted(() => ({
  botApi: {
    sendMessage: vi.fn(),
    sendPhoto: vi.fn(),
  },
  botCtorSpy: vi.fn(),
  loadConfig: vi.fn(() => ({})),
  mockLoadWebMedia: vi.fn(),
}));

// Mock fetch to prevent actual HTTP requests to example.com
// Create a minimal JPEG buffer (1x1 pixel)
const minimalJpeg = Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
  0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
  0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
  0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
  0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
  0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
  0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
  0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
  0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
  0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
  0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
  0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
  0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
  0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
  0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
  0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
  0x00, 0x00, 0x3F, 0x00, 0xFB, 0xD1, 0xFF, 0xD9,
]);

const originalFetch = global.fetch;
global.fetch = vi.fn(async (url: string | Request, init) => {
  const urlString = typeof url === "string" ? url : url.url;
  if (urlString.includes("example.com/")) {
    // Return valid JPEG data
    return new Response(minimalJpeg, {
      status: 200,
      headers: { "content-type": "image/jpeg" },
    });
  }
  // For other URLs (like Telegram API), pass through to the original fetch
  if (originalFetch instanceof Function) {
    return originalFetch(url, init);
  }
  // Fallback - this shouldn't happen in normal tests
  throw new Error(`Unmocked fetch for ${urlString}`);
}) as unknown as typeof fetch;

vi.mock("grammy", () => ({
  Bot: class {
    api = botApi;
    constructor(
      token: string,
      options?: {
        client?: { fetch?: typeof fetch; timeoutSeconds?: number };
      },
    ) {
      botCtorSpy(token, options);
    }
  },
  InputFile: class {
    constructor(public buffer: Buffer, public name: string) {}
  },
}));

vi.mock("../config/config.js", () => ({
  loadConfig,
}));

vi.mock("../infra/channel-activity.js", () => ({
  recordChannelActivity: vi.fn(),
}));

vi.mock("./sent-message-cache.js", () => ({
  recordSentMessage: vi.fn(),
}));

vi.mock("./format.js", () => ({
  renderTelegramHtmlText: vi.fn((text) => text.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>").replace(/_(.*?)_/g, "<i>$1</i>")),
}));

vi.mock("./caption.js", () => ({
  splitTelegramCaption: vi.fn((text) => {
    // Split if text is longer than 1024 chars
    if (text.length > 1024) {
      return { caption: undefined, followUpText: text };
    }
    return { caption: text, followUpText: undefined };
  }),
}));

vi.mock("../media/constants.js", () => ({
  mediaKindFromMime: vi.fn((mime) => {
    if (!mime) return undefined;
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    return undefined;
  }),
}));

vi.mock("../media/mime.js", () => ({
  isGifMedia: vi.fn((obj) => obj.fileName?.toLowerCase().endsWith(".gif")),
}));

vi.mock("./accounts.js", () => ({
  resolveTelegramAccount: vi.fn(() => ({
    config: {},
    accountId: "default",
    token: "mock-token"
  })),
}));

vi.mock("../infra/retry-policy.js", () => ({
  createTelegramRetryRunner: vi.fn((opts) => async (fn) => fn()),
}));

vi.mock("./voice.js", () => ({
  resolveTelegramVoiceSend: vi.fn(() => ({ useVoice: false })),
}));

vi.mock("./bot/helpers.js", () => ({
  buildTelegramThreadParams: vi.fn((id) => id ? { message_thread_id: id } : undefined),
}));

vi.mock("../config/markdown-tables.js", () => ({
  resolveMarkdownTableMode: vi.fn(() => "standard"),
}));

vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: vi.fn(() => ({ warn: vi.fn() })),
}));

vi.mock("../infra/diagnostic-flags.js", () => ({
  isDiagnosticFlagEnabled: vi.fn(() => false),
}));

vi.mock("../logging/redact.js", () => ({
  redactSensitiveText: vi.fn((text) => text),
}));

vi.mock("../infra/errors.js", () => ({
  formatErrorMessage: vi.fn((err) => String(err?.message || err)),
  formatUncaughtError: vi.fn((err) => String(err?.message || err)),
}));

vi.mock("../globals.js", () => ({
  logVerbose: vi.fn(),
}));

vi.mock("./targets.js", () => ({
  parseTelegramTarget: vi.fn((to) => {
    if (to.includes(":topic:")) {
      const parts = to.split(":topic:");
      return { chatId: parts[0], messageThreadId: Number.parseInt(parts[1], 10) };
    }
    return { chatId: to, messageThreadId: undefined };
  }),
  stripTelegramInternalPrefixes: vi.fn((to) => to.replace(/^telegram:/, "")),
}));

import { sendMessageTelegram } from "./send.js";

describe("sendMessageTelegram caption splitting", () => {
  beforeEach(() => {
    loadConfig.mockReturnValue({});
    mockLoadWebMedia.mockReset();
    botApi.sendMessage.mockReset();
    botApi.sendPhoto.mockReset();
    botCtorSpy.mockReset();
  });

  it("splits long captions into media + text messages when text exceeds 1024 chars", async () => {
    const chatId = "123";
    // Generate text longer than 1024 characters
    const longText = "A".repeat(1100);

    const sendPhoto = vi.fn().mockResolvedValue({
      message_id: 70,
      chat: { id: chatId },
    });
    const sendMessage = vi.fn().mockResolvedValue({
      message_id: 71,
      chat: { id: chatId },
    });
    const api = { sendPhoto, sendMessage } as unknown as {
      sendPhoto: typeof sendPhoto;
      sendMessage: typeof sendMessage;
    };

    mockLoadWebMedia.mockResolvedValueOnce({
      buffer: Buffer.from("fake-image"),
      contentType: "image/jpeg",
      fileName: "photo.jpg",
    });

    const res = await sendMessageTelegram(chatId, longText, {
      token: "tok",
      api,
      mediaUrl: "https://example.com/photo.jpg",
    });

    // Media should be sent first without caption
    expect(sendPhoto).toHaveBeenCalledWith(chatId, expect.anything(), {
      caption: undefined,
    });
    // Then text sent as separate message (HTML formatting)
    expect(sendMessage).toHaveBeenCalledWith(chatId, longText, {
      parse_mode: "HTML",
    });
    // Returns the text message ID (the "main" content)
    expect(res.messageId).toBe("71");
  });

  it("uses caption when text is within 1024 char limit", async () => {
    const chatId = "123";
    // Text exactly at 1024 characters should still use caption
    const shortText = "B".repeat(1024);

    const sendPhoto = vi.fn().mockResolvedValue({
      message_id: 72,
      chat: { id: chatId },
    });
    const sendMessage = vi.fn();
    const api = { sendPhoto, sendMessage } as unknown as {
      sendPhoto: typeof sendPhoto;
      sendMessage: typeof sendMessage;
    };

    mockLoadWebMedia.mockResolvedValueOnce({
      buffer: Buffer.from("fake-image"),
      contentType: "image/jpeg",
      fileName: "photo.jpg",
    });

    const res = await sendMessageTelegram(chatId, shortText, {
      token: "tok",
      api,
      mediaUrl: "https://example.com/photo.jpg",
    });

    // Caption should be included with media
    expect(sendPhoto).toHaveBeenCalledWith(chatId, expect.anything(), {
      caption: shortText,
      parse_mode: "HTML",
    });
    // No separate text message needed
    expect(sendMessage).not.toHaveBeenCalled();
    expect(res.messageId).toBe("72");
  });

  it("renders markdown in media captions", async () => {
    const chatId = "123";
    const caption = "hi **boss**";

    const sendPhoto = vi.fn().mockResolvedValue({
      message_id: 90,
      chat: { id: chatId },
    });
    const api = { sendPhoto } as unknown as {
      sendPhoto: typeof sendPhoto;
    };

    mockLoadWebMedia.mockResolvedValueOnce({
      buffer: Buffer.from("fake-image"),
      contentType: "image/jpeg",
      fileName: "photo.jpg",
    });

    await sendMessageTelegram(chatId, caption, {
      token: "tok",
      api,
      mediaUrl: "https://example.com/photo.jpg",
    });

    expect(sendPhoto).toHaveBeenCalledWith(chatId, expect.anything(), {
      caption: "hi <b>boss</b>",
      parse_mode: "HTML",
    });
  });

  it("preserves thread params when splitting long captions", async () => {
    const chatId = "-1001234567890";
    const longText = "C".repeat(1100);

    const sendPhoto = vi.fn().mockResolvedValue({
      message_id: 73,
      chat: { id: chatId },
    });
    const sendMessage = vi.fn().mockResolvedValue({
      message_id: 74,
      chat: { id: chatId },
    });
    const api = { sendPhoto, sendMessage } as unknown as {
      sendPhoto: typeof sendPhoto;
      sendMessage: typeof sendMessage;
    };

    mockLoadWebMedia.mockResolvedValueOnce({
      buffer: Buffer.from("fake-image"),
      contentType: "image/jpeg",
      fileName: "photo.jpg",
    });

    await sendMessageTelegram(chatId, longText, {
      token: "tok",
      api,
      mediaUrl: "https://example.com/photo.jpg",
      messageThreadId: 271,
      replyToMessageId: 500,
    });

    // Media sent with thread params but no caption
    expect(sendPhoto).toHaveBeenCalledWith(chatId, expect.anything(), {
      caption: undefined,
      message_thread_id: 271,
      reply_to_message_id: 500,
    });
    // Text message also includes thread params (HTML formatting)
    expect(sendMessage).toHaveBeenCalledWith(chatId, longText, {
      parse_mode: "HTML",
      message_thread_id: 271,
      reply_to_message_id: 500,
    });
  });

  it("puts reply_markup only on follow-up text when splitting", async () => {
    const chatId = "123";
    const longText = "D".repeat(1100);

    const sendPhoto = vi.fn().mockResolvedValue({
      message_id: 75,
      chat: { id: chatId },
    });
    const sendMessage = vi.fn().mockResolvedValue({
      message_id: 76,
      chat: { id: chatId },
    });
    const api = { sendPhoto, sendMessage } as unknown as {
      sendPhoto: typeof sendPhoto;
      sendMessage: typeof sendMessage;
    };

    mockLoadWebMedia.mockResolvedValueOnce({
      buffer: Buffer.from("fake-image"),
      contentType: "image/jpeg",
      fileName: "photo.jpg",
    });

    await sendMessageTelegram(chatId, longText, {
      token: "tok",
      api,
      mediaUrl: "https://example.com/photo.jpg",
      buttons: [[{ text: "Click me", callback_data: "action:click" }]],
    });

    // Media sent WITHOUT reply_markup
    expect(sendPhoto).toHaveBeenCalledWith(chatId, expect.anything(), {
      caption: undefined,
    });
    // Follow-up text has the reply_markup
    expect(sendMessage).toHaveBeenCalledWith(chatId, longText, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "Click me", callback_data: "action:click" }]],
      },
    });
  });

  it("includes thread params and reply_markup on follow-up text when splitting", async () => {
    const chatId = "-1001234567890";
    const longText = "F".repeat(1100);

    const sendPhoto = vi.fn().mockResolvedValue({
      message_id: 78,
      chat: { id: chatId },
    });
    const sendMessage = vi.fn().mockResolvedValue({
      message_id: 79,
      chat: { id: chatId },
    });
    const api = { sendPhoto, sendMessage } as unknown as {
      sendPhoto: typeof sendPhoto;
      sendMessage: typeof sendMessage;
    };

    mockLoadWebMedia.mockResolvedValueOnce({
      buffer: Buffer.from("fake-image"),
      contentType: "image/jpeg",
      fileName: "photo.jpg",
    });

    await sendMessageTelegram(chatId, longText, {
      token: "tok",
      api,
      mediaUrl: "https://example.com/photo.jpg",
      messageThreadId: 271,
      replyToMessageId: 500,
      buttons: [[{ text: "Click me", callback_data: "action:click" }]],
    });

    expect(sendPhoto).toHaveBeenCalledWith(chatId, expect.anything(), {
      caption: undefined,
      message_thread_id: 271,
      reply_to_message_id: 500,
    });
    expect(sendMessage).toHaveBeenCalledWith(chatId, longText, {
      parse_mode: "HTML",
      message_thread_id: 271,
      reply_to_message_id: 500,
      reply_markup: {
        inline_keyboard: [[{ text: "Click me", callback_data: "action:click" }]],
      },
    });
  });

  it("wraps chat-not-found errors from follow-up message", async () => {
    const chatId = "123";
    const longText = "G".repeat(1100);

    const sendPhoto = vi.fn().mockResolvedValue({
      message_id: 80,
      chat: { id: chatId },
    });
    const sendMessage = vi.fn().mockRejectedValue(new Error("400: Bad Request: chat not found"));
    const api = { sendPhoto, sendMessage } as unknown as {
      sendPhoto: typeof sendPhoto;
      sendMessage: typeof sendMessage;
    };

    mockLoadWebMedia.mockResolvedValueOnce({
      buffer: Buffer.from("fake-image"),
      contentType: "image/jpeg",
      fileName: "photo.jpg",
    });

    await expect(
      sendMessageTelegram(chatId, longText, {
        token: "tok",
        api,
        mediaUrl: "https://example.com/photo.jpg",
      }),
    ).rejects.toThrow(/Telegram send failed: chat not found \(chat_id=123\)\./);
  });

  it("does not send follow-up text when caption is empty", async () => {
    const chatId = "123";
    const emptyText = "   ";

    const sendPhoto = vi.fn().mockResolvedValue({
      message_id: 81,
      chat: { id: chatId },
    });
    const sendMessage = vi.fn();
    const api = { sendPhoto, sendMessage } as unknown as {
      sendPhoto: typeof sendPhoto;
      sendMessage: typeof sendMessage;
    };

    mockLoadWebMedia.mockResolvedValueOnce({
      buffer: Buffer.from("fake-image"),
      contentType: "image/jpeg",
      fileName: "photo.jpg",
    });

    const res = await sendMessageTelegram(chatId, emptyText, {
      token: "tok",
      api,
      mediaUrl: "https://example.com/photo.jpg",
    });

    expect(sendPhoto).toHaveBeenCalledWith(chatId, expect.anything(), {
      caption: undefined,
    });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(res.messageId).toBe("81");
  });

  it("keeps reply_markup on media when not splitting", async () => {
    const chatId = "123";
    const shortText = "E".repeat(100);

    const sendPhoto = vi.fn().mockResolvedValue({
      message_id: 77,
      chat: { id: chatId },
    });
    const sendMessage = vi.fn();
    const api = { sendPhoto, sendMessage } as unknown as {
      sendPhoto: typeof sendPhoto;
      sendMessage: typeof sendMessage;
    };

    mockLoadWebMedia.mockResolvedValueOnce({
      buffer: Buffer.from("fake-image"),
      contentType: "image/jpeg",
      fileName: "photo.jpg",
    });

    await sendMessageTelegram(chatId, shortText, {
      token: "tok",
      api,
      mediaUrl: "https://example.com/photo.jpg",
      buttons: [[{ text: "Click me", callback_data: "action:click" }]],
    });

    // Media sent WITH reply_markup when not splitting
    expect(sendPhoto).toHaveBeenCalledWith(chatId, expect.anything(), {
      caption: shortText,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "Click me", callback_data: "action:click" }]],
      },
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
