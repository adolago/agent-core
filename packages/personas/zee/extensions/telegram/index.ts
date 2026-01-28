// Telegram channel plugin - registers the built-in telegram implementation
import { monitorTelegramProvider } from "../../src/telegram/monitor.js";
import { probeTelegram } from "../../src/telegram/probe.js";
import { resolveTelegramToken } from "../../src/telegram/token.js";
import { listTelegramAccountIds } from "../../src/telegram/accounts.js";
import { telegramOutbound } from "../../src/channels/plugins/outbound/telegram.js";
import { telegramMessageActions } from "../../src/channels/plugins/actions/telegram.js";
import type { ChannelPlugin } from "../../src/channels/plugins/types.js";
import type { ZeePluginApi } from "../../src/plugins/types.js";

const telegramPlugin: ChannelPlugin = {
  id: "telegram",
  meta: {
    id: "telegram",
    label: "Telegram",
    selectionLabel: "Telegram",
    docsPath: "/channels/telegram",
    blurb: "Telegram Bot API channel with grammY.",
  },
  capabilities: { chatTypes: ["direct", "group"], media: true },
  config: {
    listAccountIds: (cfg) => {
      return listTelegramAccountIds(cfg);
    },
    resolveAccount: () => ({}),
    isConfigured: async (account, cfg) => {
      const { token } = resolveTelegramToken(cfg, { accountId: account.accountId });
      return !!token;
    },
  },
  status: {
    probeAccount: async (params) => {
      const { token } = resolveTelegramToken(params.cfg, { accountId: params.accountId });
      if (!token) {
        return { ok: false, error: "No token configured" };
      }
      return probeTelegram(token, params.timeoutMs);
    },
    collectStatusIssues: (accounts) =>
      accounts.flatMap((account) => {
        const lastError = typeof account.lastError === "string" ? account.lastError.trim() : "";
        if (!lastError) return [];
        return [
          {
            channel: "telegram",
            accountId: account.accountId,
            kind: "runtime" as const,
            message: `Channel error: ${lastError}`,
          },
        ];
      }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const { token } = resolveTelegramToken(ctx.cfg, { accountId: ctx.accountId });
      if (!token) {
        ctx.setStatus({ running: false, lastError: `No bot token for account ${ctx.accountId}` });
        return;
      }
      ctx.setStatus({ running: true, connected: true });
      try {
        await monitorTelegramProvider({
          token,
          accountId: ctx.accountId,
          config: ctx.cfg,
          runtime: ctx.runtime,
          abortSignal: ctx.abortSignal,
        });
      } catch (err) {
        ctx.setStatus({ running: false, lastError: String(err) });
        throw err;
      }
    },
  },
  outbound: telegramOutbound,
  actions: telegramMessageActions,
  messaging: {
    targetResolver: {
      looksLikeId: (raw) => {
        const trimmed = raw.trim().toLowerCase();
        if (!trimmed) return false;
        if (/^telegram:/i.test(trimmed)) return true;
        if (/^@[a-z0-9_]+$/i.test(trimmed)) return true;
        if (/^-?\d+$/.test(trimmed)) return true;
        return false;
      },
      hint: "<@username|chat_id>",
    },
    normalizeTarget: (raw) => {
      const trimmed = raw.trim().replace(/^telegram:/i, "");
      if (!trimmed) return undefined;
      return trimmed;
    },
  },
};

export default {
  id: "telegram",
  register(api: ZeePluginApi) {
    api.registerChannel(telegramPlugin);
  },
};
