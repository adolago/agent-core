import { imessageOutbound } from "../channels/plugins/outbound/imessage.js";
import { telegramOutbound } from "../channels/plugins/outbound/telegram.js";
import { whatsappOutbound } from "../channels/plugins/outbound/whatsapp.js";
import type {
  ChannelCapabilities,
  ChannelId,
  ChannelOutboundAdapter,
  ChannelPlugin,
  ChannelStatusIssue,
} from "../channels/plugins/types.js";
import type { PluginRegistry } from "../plugins/registry.js";
import { normalizeIMessageHandle } from "../imessage/targets.js";
import type { ZeeConfig } from "../config/config.js";
import { probeTelegram } from "../telegram/probe.js";
import { resolveTelegramToken } from "../telegram/token.js";

// Simple test setup helper - applies basic channel account config
const createSimpleSetup = (channelId: string) => ({
  applyAccountConfig: (params: {
    cfg: ZeeConfig;
    accountId: string;
    input: Record<string, unknown>;
  }) => {
    const cfg = { ...params.cfg };
    if (!cfg.channels) cfg.channels = {};
    const channel = (cfg.channels[channelId as keyof typeof cfg.channels] =
      cfg.channels[channelId as keyof typeof cfg.channels] || {});
    const channelObj = channel as Record<string, unknown>;

    // Set enabled flag
    channelObj.enabled = true;

    // Check if we need to migrate base-level name to accounts structure
    const hasMultipleAccounts =
      ((channelObj.accounts as Record<string, unknown> | undefined) &&
        Object.keys(channelObj.accounts as Record<string, unknown>).length > 0) ||
      (params.accountId !== "default" && (!channelObj.accounts || Object.keys(channelObj.accounts as Record<string, unknown>).length === 0));

    // For default account, apply config at root level
    if (params.accountId === "default") {
      // If we're adding a default account and there are other accounts with a base-level name,
      // migrate the name to the accounts structure
      if (hasMultipleAccounts && typeof channelObj.name === "string") {
        if (!channelObj.accounts) channelObj.accounts = {};
        const accounts = channelObj.accounts as Record<string, unknown>;
        // Move the existing base-level name to accounts structure if it's not a new one
        if (!accounts.default) {
          accounts.default = {};
        }
        const defaultAccount = accounts.default as Record<string, unknown>;
        if (!defaultAccount.name) {
          defaultAccount.name = channelObj.name;
        }
        // Remove the base-level name
        delete channelObj.name;
      }

      const input = params.input as Record<string, unknown>;
      // For default account with a name in input, ensure it goes to accounts structure if we have multiple accounts
      if (hasMultipleAccounts && typeof input.name === "string") {
        if (!channelObj.accounts) channelObj.accounts = {};
        const accounts = channelObj.accounts as Record<string, unknown>;
        if (!accounts.default) accounts.default = {};
        const defaultAccount = accounts.default as Record<string, unknown>;
        defaultAccount.name = input.name;
        // Don't apply name at root level if we have multiple accounts
        const inputWithoutName = { ...input };
        delete inputWithoutName.name;
        for (const [key, value] of Object.entries(inputWithoutName)) {
          if (value !== undefined && value !== null) {
            channelObj[key] = value;
          }
        }
      } else {
        for (const [key, value] of Object.entries(input)) {
          if (value !== undefined && value !== null) {
            channelObj[key] = value;
          }
        }
      }
    } else {
      // For non-default accounts, create accounts object
      if (!channelObj.accounts) channelObj.accounts = {};
      const accounts = channelObj.accounts as Record<string, unknown>;

      // If there's a base-level name and we're adding a non-default account, migrate it
      if (typeof channelObj.name === "string") {
        // Move the existing name to the default account
        if (!accounts.default) {
          accounts.default = {};
        }
        const defaultAccount = accounts.default as Record<string, unknown>;
        if (!defaultAccount.name) {
          defaultAccount.name = channelObj.name;
        }
        // Remove the base-level name
        delete channelObj.name;
      }

      const account = (accounts[params.accountId] = accounts[params.accountId] || {});
      const accountObj = account as Record<string, unknown>;
      const input = params.input as Record<string, unknown>;
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined && value !== null) {
          // Signal-specific: transform signalNumber to account
          if (channelId === "signal" && key === "signalNumber") {
            accountObj.account = value;
          } else {
            accountObj[key] = value;
          }
        }
      }
    }

    return cfg;
  },
});

export const createTestRegistry = (channels: PluginRegistry["channels"] = []): PluginRegistry => ({
  plugins: [],
  tools: [],
  hooks: [],
  typedHooks: [],
  channels,
  providers: [],
  gatewayHandlers: {},
  httpHandlers: [],
  httpRoutes: [],
  cliRegistrars: [],
  services: [],
  commands: [],
  diagnostics: [],
});

export const createIMessageTestPlugin = (params?: {
  outbound?: ChannelOutboundAdapter;
}): ChannelPlugin => ({
  id: "imessage",
  meta: {
    id: "imessage",
    label: "iMessage",
    selectionLabel: "iMessage (imsg)",
    docsPath: "/channels/imessage",
    blurb: "iMessage test stub.",
    aliases: ["imsg"],
  },
  capabilities: { chatTypes: ["direct", "group"], media: true },
  config: {
    listAccountIds: () => [],
    resolveAccount: () => ({}),
  },
  setup: createSimpleSetup("imessage"),
  status: {
    collectStatusIssues: (accounts) =>
      accounts.flatMap((account) => {
        const lastError = typeof account.lastError === "string" ? account.lastError.trim() : "";
        if (!lastError) return [];
        return [
          {
            channel: "imessage",
            accountId: account.accountId,
            kind: "runtime",
            message: `Channel error: ${lastError}`,
          },
        ];
      }),
  },
  outbound: params?.outbound ?? imessageOutbound,
  messaging: {
    targetResolver: {
      looksLikeId: (raw) => {
        const trimmed = raw.trim();
        if (!trimmed) return false;
        if (/^(imessage:|sms:|auto:|chat_id:|chat_guid:|chat_identifier:)/i.test(trimmed)) {
          return true;
        }
        if (trimmed.includes("@")) return true;
        return /^\+?\d{3,}$/.test(trimmed);
      },
      hint: "<handle|chat_id:ID>",
    },
    normalizeTarget: (raw) => normalizeIMessageHandle(raw),
  },
});

export const createOutboundTestPlugin = (params: {
  id: ChannelId;
  outbound: ChannelOutboundAdapter;
  label?: string;
  docsPath?: string;
  capabilities?: ChannelCapabilities;
}): ChannelPlugin => ({
  id: params.id,
  meta: {
    id: params.id,
    label: params.label ?? String(params.id),
    selectionLabel: params.label ?? String(params.id),
    docsPath: params.docsPath ?? `/channels/${params.id}`,
    blurb: "test stub.",
  },
  capabilities: params.capabilities ?? { chatTypes: ["direct"] },
  config: {
    listAccountIds: () => [],
    resolveAccount: () => ({}),
  },
  outbound: params.outbound,
});

// Mock channel plugins for testing - use these instead of importing from extensions
const createMockOutbound = (channel: "slack" | "discord" | "signal"): ChannelOutboundAdapter => ({
  deliveryMode: "direct",
  sendText: async () => ({ channel, messageId: "mock-id" }),
  sendMedia: async () => ({ channel, messageId: "mock-id" }),
});

export const telegramPlugin: ChannelPlugin = {
  id: "telegram",
  meta: {
    id: "telegram",
    label: "Telegram",
    selectionLabel: "Telegram",
    docsPath: "/channels/telegram",
    blurb: "Telegram test stub.",
  },
  capabilities: { chatTypes: ["direct", "group"], media: true },
  config: {
    listAccountIds: (cfg) => {
      const { token } = resolveTelegramToken(cfg);
      return token ? ["default"] : [];
    },
    resolveAccount: () => ({}),
    isConfigured: async (account, cfg) => {
      const { token } = resolveTelegramToken(cfg);
      return !!token;
    },
  },
  setup: createSimpleSetup("telegram"),
  status: {
    probeAccount: async (params) => {
      const { token } = resolveTelegramToken(params.cfg);
      if (!token) {
        return { ok: false, error: "No token configured" };
      }
      return probeTelegram(token, params.timeoutMs);
    },
    collectStatusIssues: (accounts) =>
      accounts.flatMap((account) => {
        const issues: ChannelStatusIssue[] = [];
        const lastError = typeof account.lastError === "string" ? account.lastError.trim() : "";
        if (lastError) {
          issues.push({
            channel: "telegram",
            accountId: account.accountId,
            kind: "runtime",
            message: `Channel error: ${lastError}`,
          });
        }
        if (account.allowUnmentionedGroups === true) {
          issues.push({
            channel: "telegram",
            accountId: account.accountId,
            kind: "config",
            message: "Telegram Bot API privacy mode is enabled (allowUnmentionedGroups=true)",
          });
        }
        const audit = account.audit as
          | { hasWildcardUnmentionedGroups?: boolean; unresolvedGroups?: number; groups?: Array<Record<string, unknown>> }
          | undefined;
        if (audit?.hasWildcardUnmentionedGroups && (audit?.unresolvedGroups ?? 0) > 0) {
          issues.push({
            channel: "telegram",
            accountId: account.accountId,
            kind: "config",
            message: "Telegram group membership probing is not possible with wildcard allowUnmentionedGroups",
          });
          for (const group of audit.groups ?? []) {
            const chatId = typeof group.chatId === "string" || typeof group.chatId === "number" ? group.chatId : null;
            if (chatId && group.ok !== true) {
              issues.push({
                channel: "telegram",
                accountId: account.accountId,
                kind: "runtime",
                message: `Group ${chatId}: ${typeof group.error === "string" ? group.error : "unknown error"}`,
              });
            }
          }
        }
        return issues;
      }),
  },
  outbound: telegramOutbound,
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

export const whatsappPlugin: ChannelPlugin = {
  id: "whatsapp",
  meta: {
    id: "whatsapp",
    label: "WhatsApp",
    selectionLabel: "WhatsApp",
    docsPath: "/channels/whatsapp",
    blurb: "WhatsApp test stub.",
  },
  capabilities: { chatTypes: ["direct", "group"], media: true },
  config: {
    listAccountIds: () => ["default"],
    resolveAccount: () => ({}),
    resolveAllowFrom: ({ cfg }: { cfg: ZeeConfig }) =>
      cfg.channels?.whatsapp?.allowFrom ?? [],
  },
  setup: createSimpleSetup("whatsapp"),
  status: {
    collectStatusIssues: (accounts) =>
      accounts.flatMap((account) => {
        const issues: ChannelStatusIssue[] = [];
        if (account.linked === false) {
          issues.push({
            channel: "whatsapp",
            accountId: account.accountId,
            kind: "auth",
            message: "Not linked",
          });
        }
        if (account.connected === false && account.running === true) {
          issues.push({
            channel: "whatsapp",
            accountId: account.accountId,
            kind: "runtime",
            message: `WhatsApp disconnected (reconnect attempts: ${account.reconnectAttempts ?? 0})${account.lastError ? ` - ${account.lastError}` : ""}`,
          });
        }
        const lastError = typeof account.lastError === "string" ? account.lastError.trim() : "";
        if (lastError && account.running === false) {
          issues.push({
            channel: "whatsapp",
            accountId: account.accountId,
            kind: "runtime",
            message: `Channel error: ${lastError}`,
          });
        }
        return issues;
      }),
  },
  outbound: whatsappOutbound,
  messaging: {
    targetResolver: {
      looksLikeId: (raw) => {
        const trimmed = raw.trim();
        if (!trimmed) return false;
        // WhatsApp group IDs: 123456789@g.us
        if (/@g\.us$/i.test(trimmed)) return true;
        // WhatsApp individual IDs: 123456789@s.whatsapp.net
        if (/@s\.whatsapp\.net$/i.test(trimmed)) return true;
        // Phone numbers
        if (/^\+?\d{6,}$/.test(trimmed)) return true;
        // Explicit prefixes
        if (/^(whatsapp:|group:|user:)/i.test(trimmed)) return true;
        return false;
      },
      hint: "<phone|jid@g.us>",
    },
    normalizeTarget: (raw) => raw.trim(),
  },
};

export const slackPlugin: ChannelPlugin = {
  id: "slack",
  meta: {
    id: "slack",
    label: "Slack",
    selectionLabel: "Slack",
    docsPath: "/channels/slack",
    blurb: "Slack test stub.",
  },
  capabilities: { chatTypes: ["direct", "group"], media: true },
  config: {
    listAccountIds: () => ["default"],
    resolveAccount: () => ({}),
  },
  setup: createSimpleSetup("slack"),
  status: {
    collectStatusIssues: (accounts) =>
      accounts.flatMap((account) => {
        const lastError = typeof account.lastError === "string" ? account.lastError.trim() : "";
        if (!lastError) return [];
        return [
          {
            channel: "slack",
            accountId: account.accountId,
            kind: "runtime",
            message: `Channel error: ${lastError}`,
          },
        ];
      }),
  },
  outbound: createMockOutbound("slack"),
  messaging: {
    targetResolver: {
      looksLikeId: (raw) => {
        const trimmed = raw.trim();
        if (!trimmed) return false;
        // Channel IDs: C12345678, #C12345678
        if (/^#?C[A-Z0-9]+$/i.test(trimmed)) return true;
        // User IDs: U12345678, @U12345678
        if (/^@?U[A-Z0-9]+$/i.test(trimmed)) return true;
        // Explicit prefixes
        if (/^(channel:|user:|slack:)/i.test(trimmed)) return true;
        // User mentions: <@U12345678>
        if (/^<@[A-Z0-9]+>$/i.test(trimmed)) return true;
        return false;
      },
      hint: "<#channel|@user>",
    },
    normalizeTarget: (raw) => raw.trim().replace(/^#/, ""),
  },
};

export const discordPlugin: ChannelPlugin = {
  id: "discord",
  meta: {
    id: "discord",
    label: "Discord",
    selectionLabel: "Discord",
    docsPath: "/channels/discord",
    blurb: "Discord test stub.",
  },
  capabilities: { chatTypes: ["direct", "group"], media: true },
  config: {
    listAccountIds: () => ["default"],
    resolveAccount: () => ({}),
  },
  setup: createSimpleSetup("discord"),
  status: {
    collectStatusIssues: (accounts) =>
      accounts.flatMap((account) => {
        const issues: ChannelStatusIssue[] = [];
        const application = account.application as
          | { intents?: { messageContent?: string } }
          | undefined;
        const messageContent = application?.intents?.messageContent;
        if (
          typeof messageContent === "string" &&
          messageContent.length > 0 &&
          messageContent !== "enabled"
        ) {
          issues.push({
            channel: "discord",
            accountId: account.accountId,
            kind: "config",
            message: "Message Content Intent is disabled",
          });
        }
        const audit = account.audit as
          | { unresolvedChannels?: number; channels?: Array<Record<string, unknown>> }
          | undefined;
        if ((audit?.unresolvedChannels ?? 0) > 0) {
          issues.push({
            channel: "discord",
            accountId: account.accountId,
            kind: "permissions",
            message: "Discord permission audit detected missing permissions",
          });
          for (const channel of audit?.channels ?? []) {
            const channelId = typeof channel.channelId === "string" ? channel.channelId : null;
            if (channelId && channel.ok !== true) {
              const missing = Array.isArray(channel.missing) ? channel.missing : [];
              issues.push({
                channel: "discord",
                accountId: account.accountId,
                kind: "permissions",
                message: `Channel ${channelId}: missing permissions [${missing.join(", ")}]`,
              });
            }
          }
        }
        return issues;
      }),
  },
  outbound: createMockOutbound("discord"),
  messaging: {
    targetResolver: {
      looksLikeId: (raw) => {
        const trimmed = raw.trim();
        if (!trimmed) return false;
        // Discord numeric IDs (snowflakes): 123456789012345678
        if (/^\d{17,19}$/.test(trimmed)) return true;
        // Explicit prefixes
        if (/^(channel:|user:|discord:)/i.test(trimmed)) return true;
        // User mentions: <@123456789012345678>
        if (/^<@!?\d{17,19}>$/.test(trimmed)) return true;
        // Channel mentions: <#123456789012345678>
        if (/^<#\d{17,19}>$/.test(trimmed)) return true;
        return false;
      },
      hint: "<@user|#channel|id>",
    },
    normalizeTarget: (raw) => raw.trim(),
  },
};

export const signalPlugin: ChannelPlugin = {
  id: "signal",
  meta: {
    id: "signal",
    label: "Signal",
    selectionLabel: "Signal",
    docsPath: "/channels/signal",
    blurb: "Signal test stub.",
  },
  capabilities: { chatTypes: ["direct", "group"], media: true },
  config: {
    listAccountIds: () => ["default"],
    resolveAccount: () => ({}),
  },
  setup: createSimpleSetup("signal"),
  status: {
    collectStatusIssues: (accounts) =>
      accounts.flatMap((account) => {
        const lastError = typeof account.lastError === "string" ? account.lastError.trim() : "";
        if (!lastError) return [];
        return [
          {
            channel: "signal",
            accountId: account.accountId,
            kind: "runtime",
            message: `Channel error: ${lastError}`,
          },
        ];
      }),
  },
  outbound: createMockOutbound("signal"),
};
