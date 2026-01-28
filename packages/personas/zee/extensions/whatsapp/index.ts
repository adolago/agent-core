// WhatsApp channel plugin - registers the built-in WhatsApp Web implementation
import { monitorWebChannel } from "../../src/web/auto-reply.js";
import { webAuthExists } from "../../src/web/auth-store.js";
import { whatsappOutbound } from "../../src/channels/plugins/outbound/whatsapp.js";
import type { ChannelPlugin } from "../../src/channels/plugins/types.js";
import type { ZeePluginApi } from "../../src/plugins/types.js";

const whatsappPlugin: ChannelPlugin = {
  id: "whatsapp",
  meta: {
    id: "whatsapp",
    label: "WhatsApp",
    selectionLabel: "WhatsApp",
    docsPath: "/channels/whatsapp",
    blurb: "WhatsApp Web channel via Baileys.",
  },
  capabilities: { chatTypes: ["direct", "group"], media: true },
  config: {
    listAccountIds: () => ["default"],
    resolveAccount: () => ({}),
    resolveAllowFrom: ({ cfg }) => cfg.channels?.whatsapp?.allowFrom ?? [],
  },
  status: {
    collectStatusIssues: (accounts) =>
      accounts.flatMap((account) => {
        const issues: Array<{
          channel: "whatsapp";
          accountId: string;
          kind: "auth" | "runtime";
          message: string;
        }> = [];
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
  gateway: {
    startAccount: async (ctx) => {
      const hasAuth = await webAuthExists();
      if (!hasAuth) {
        ctx.setStatus({ running: false, linked: false, lastError: "Not linked - run 'zee login whatsapp' first" });
        return;
      }
      ctx.setStatus({ running: true, linked: true });
      try {
        await monitorWebChannel({
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

export default {
  id: "whatsapp",
  register(api: ZeePluginApi) {
    api.registerChannel(whatsappPlugin);
  },
};
