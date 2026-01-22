/**
 * Telegram User Account Monitor (MTProto via GramJS)
 *
 * Similar to monitor.ts but uses a user account instead of a bot.
 * This allows Zee to appear as a regular Telegram user.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { Api, TelegramClient } from "telegram";
import { NewMessage, type NewMessageEvent } from "telegram/events/index.js";
import { StringSession } from "telegram/sessions/index.js";
import { formatAgentEnvelope } from "../auto-reply/envelope.js";
import { getReplyFromConfig } from "../auto-reply/reply.js";
import type { ZeeConfig } from "../config/config.js";
import { loadConfig } from "../config/config.js";
import { resolveStorePath, updateLastRoute } from "../config/sessions.js";
import { getChildLogger } from "../logging.js";
import { resolveAgentRoute } from "../routing/resolve-route.js";
import type { RuntimeEnv } from "../runtime.js";

const log = getChildLogger({ module: "telegram-user" });

const SESSION_DIR = join(homedir(), ".zee", "credentials", "telegram");
const SESSION_FILE = join(SESSION_DIR, "user-session.txt");
const API_FILE = join(SESSION_DIR, "api.json");

export interface TelegramUserConfig {
  apiId: number;
  apiHash: string;
  phoneNumber: string;
  password?: string;
}

export interface MonitorTelegramUserOpts {
  accountId?: string;
  config?: ZeeConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
}

/**
 * Load API credentials from file
 */
async function loadApiCredentials(): Promise<{
  apiId: number;
  apiHash: string;
} | null> {
  try {
    const content = await readFile(API_FILE, "utf-8");
    const data = JSON.parse(content);
    if (data.apiId && data.apiHash) {
      return { apiId: Number(data.apiId), apiHash: data.apiHash };
    }
  } catch {
    // File doesn't exist or invalid
  }
  return null;
}

/**
 * Load saved session string from disk
 */
async function loadSession(): Promise<string> {
  try {
    const session = await readFile(SESSION_FILE, "utf-8");
    return session.trim();
  } catch {
    return "";
  }
}

/**
 * Save session string to disk
 */
async function saveSession(session: string): Promise<void> {
  await mkdir(SESSION_DIR, { recursive: true });
  await writeFile(SESSION_FILE, session);
  log.info("Session saved");
}

/**
 * Interactive prompt for auth code/password
 */
function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Get user config from zee config
 */
function getTelegramUserConfig(cfg: ZeeConfig): {
  enabled: boolean;
  phoneNumber: string | null;
  password: string | null;
} {
  const userConfig = cfg.telegram?.user;
  return {
    enabled: userConfig?.enabled === true,
    phoneNumber:
      userConfig?.phoneNumber || process.env.TELEGRAM_USER_PHONE || null,
    password: userConfig?.password || process.env.TELEGRAM_USER_2FA || null,
  };
}

/**
 * Check if user account is configured
 */
export async function isTelegramUserConfigured(
  cfg: ZeeConfig,
): Promise<boolean> {
  const userConfig = getTelegramUserConfig(cfg);
  if (!userConfig.enabled || !userConfig.phoneNumber) return false;

  const creds = await loadApiCredentials();
  return creds !== null;
}

/**
 * Monitor Telegram using a user account (MTProto)
 */
export async function monitorTelegramUserProvider(
  opts: MonitorTelegramUserOpts = {},
): Promise<void> {
  const cfg = opts.config ?? loadConfig();
  const userConfig = getTelegramUserConfig(cfg);

  if (!userConfig.enabled) {
    throw new Error(
      "Telegram user account not enabled (telegram.user.enabled=false)",
    );
  }

  if (!userConfig.phoneNumber) {
    throw new Error(
      "Telegram user phone number not configured (set telegram.user.phoneNumber or TELEGRAM_USER_PHONE)",
    );
  }

  const creds = await loadApiCredentials();
  if (!creds) {
    throw new Error(
      `Telegram API credentials not found at ${API_FILE}. Get them from https://my.telegram.org/apps`,
    );
  }

  const sessionString = await loadSession();
  const session = new StringSession(sessionString);

  const client = new TelegramClient(session, creds.apiId, creds.apiHash, {
    connectionRetries: 5,
    retryDelay: 1000,
    autoReconnect: true,
    // Use longer timeout for update requests
    requestRetries: 3,
  });

  // Handle abort
  const cleanup = () => {
    log.info("Stopping Telegram user client");
    client.disconnect().catch(() => {});
  };

  opts.abortSignal?.addEventListener("abort", cleanup, { once: true });

  try {
    log.info(`Starting Telegram user client for ${userConfig.phoneNumber}`);

    await client.start({
      phoneNumber: userConfig.phoneNumber,
      password: async () => {
        if (userConfig.password) return userConfig.password;
        return prompt("Enter your 2FA password: ");
      },
      phoneCode: async () => {
        return prompt("Enter the code you received from Telegram: ");
      },
      onError: (err) => {
        log.error({ err }, "Auth error");
        throw err;
      },
    });

    // Save session for future use
    const newSession = client.session.save() as unknown as string;
    if (newSession && newSession !== sessionString) {
      await saveSession(newSession);
    }

    // Get current user info
    const me = await client.getMe();
    const meEntity = me as Api.User;
    const identity =
      `${meEntity.firstName || ""} ${meEntity.lastName || ""}`.trim() ||
      meEntity.username ||
      "unknown";
    log.info(`Connected as: ${identity}`);

    // Initialize update state by fetching dialogs and syncing update state
    // This is required for GramJS to properly receive new message updates
    try {
      log.info("Fetching update state from Telegram...");
      // Get current update state to sync with Telegram
      const state = await client.invoke(new Api.updates.GetState());
      log.info(
        `Update state: pts=${state.pts}, qts=${state.qts}, date=${state.date}`,
      );

      log.info("Fetching dialogs to fully initialize...");
      const dialogs = await client.getDialogs({ limit: 10 });
      log.info(`Fetched ${dialogs.length} dialog(s)`);

      // Log client connection state for debugging
      log.info(`Client connected: ${client.connected}`);
    } catch (initErr) {
      const errMsg =
        initErr instanceof Error ? initErr.message : String(initErr);
      log.warn(`Failed to initialize update state: ${errMsg}`);
    }

    // Set up event handler for debugging (log all updates)
    log.info("Setting up debug event handler");
    client.addEventHandler((event: unknown) => {
      const eventObj = event as Record<string, unknown>;
      const eventType = eventObj?.constructor?.name || typeof event;
      // Only log non-connection state events
      if (eventType !== "UpdateConnectionState") {
        log.info(`Telegram event: ${eventType}`);
      }
    });

    // Set up message handler
    log.info("Setting up NewMessage event handler");
    client.addEventHandler(async (event: NewMessageEvent) => {
      log.info("Received NewMessage event");
      if (opts.abortSignal?.aborted) {
        log.debug("Aborted, skipping message");
        return;
      }

      const message = event.message;
      if (!message) {
        log.debug("No message in event, skipping");
        return;
      }
      if (message.out) {
        log.debug("Outgoing message, skipping");
        return;
      }

      log.info(
        `Processing incoming message: ${message.text?.substring(0, 50) || "(no text)"}`,
      );

      try {
        await handleIncomingMessage(client, event, cfg, opts.runtime);
        log.info("Message handling completed");
      } catch (err) {
        log.error({ err }, "Message handler error");
      }
    }, new NewMessage({}));

    // Keep running until aborted
    await new Promise<void>((resolve) => {
      if (opts.abortSignal?.aborted) {
        resolve();
        return;
      }
      opts.abortSignal?.addEventListener("abort", () => resolve(), {
        once: true,
      });
    });
  } finally {
    opts.abortSignal?.removeEventListener("abort", cleanup);
    await client.disconnect();
  }
}

/**
 * Handle incoming message from user account
 */
async function handleIncomingMessage(
  client: TelegramClient,
  event: NewMessageEvent,
  cfg: ZeeConfig,
  _runtime?: RuntimeEnv,
): Promise<void> {
  const message = event.message;
  const chat = await message.getChat();
  const sender = await message.getSender();

  if (!chat || !sender) return;

  // Build identifiers
  const chatId = chat.id?.toString() || "unknown";
  const senderId = sender.id?.toString() || "unknown";
  const isGroup = chat.className === "Chat" || chat.className === "Channel";
  const peerId = isGroup ? chatId : senderId;

  // Resolve agent route
  const route = resolveAgentRoute({
    cfg,
    provider: "telegram-user",
    accountId: "user",
    peer: {
      kind: isGroup ? "group" : "dm",
      id: peerId,
    },
  });

  // Get sender info
  const senderEntity = sender as Api.User;
  const senderName = senderEntity.firstName
    ? `${senderEntity.firstName || ""} ${senderEntity.lastName || ""}`.trim()
    : senderEntity.username || "Unknown";

  const messageText = message.text || "";

  log.debug(
    `[${route.sessionKey}] ${senderName}: ${messageText.substring(0, 100)}`,
  );

  // Check allowFrom
  const allowFrom = cfg.telegram?.allowFrom as string[] | undefined;
  if (allowFrom && allowFrom.length > 0) {
    const allowed = allowFrom.some(
      (id) => id === senderId || id === `+${senderId}` || id === chatId,
    );
    if (!allowed) {
      log.debug(
        `[${route.sessionKey}] Sender ${senderId} not in allowFrom, ignoring`,
      );
      return;
    }
  }

  // Check group requireMention
  if (isGroup) {
    const groupConfig =
      cfg.telegram?.groups?.[String(chatId)] || cfg.telegram?.groups?.["*"];
    const requireMention = groupConfig?.requireMention !== false;

    if (requireMention) {
      const me = await client.getMe();
      const meEntity = me as Api.User;
      const myUsername = meEntity.username?.toLowerCase();
      const mentioned =
        myUsername && messageText.toLowerCase().includes(`@${myUsername}`);

      if (!mentioned) {
        log.debug(`[${route.sessionKey}] No mention in group, ignoring`);
        return;
      }
    }
  }

  // Format envelope for agent
  const body = formatAgentEnvelope({
    provider: "Telegram-User",
    from: isGroup
      ? `group:${chatId} from ${senderName} id:${senderId}`
      : `${senderName} id:${senderId}`,
    timestamp: message.date ? message.date * 1000 : undefined,
    body: messageText,
  });

  // Build MsgContext for getReplyFromConfig
  // Use "telegram" as OriginatingChannel since it's the same underlying platform
  const ctxPayload = {
    Body: body,
    From: isGroup
      ? `telegram-user:group:${chatId}`
      : `telegram-user:${senderId}`,
    To: `telegram-user:${chatId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: isGroup ? "group" : "direct",
    SenderName: senderName,
    SenderId: senderId,
    Provider: "telegram-user",
    Surface: "telegram-user",
    MessageSid: String(message.id),
    Timestamp: message.date ? message.date * 1000 : undefined,
    CommandAuthorized: true,
    OriginatingChannel: "telegram" as const,
    OriginatingTo: `telegram-user:${chatId}`,
  };

  // Get agent reply
  const replyResult = await getReplyFromConfig(ctxPayload, undefined, cfg);

  if (!replyResult) return;

  // Send reply
  const replies = Array.isArray(replyResult) ? replyResult : [replyResult];
  for (const reply of replies) {
    if (reply.text) {
      await message.reply({ message: reply.text });
    }
  }

  // Update last route for DMs
  if (!isGroup) {
    const agentId = route.agentId;
    const storePath = resolveStorePath(cfg.session?.store, { agentId });
    await updateLastRoute({
      storePath,
      sessionKey: route.mainSessionKey,
      provider: "telegram",
      to: chatId,
      accountId: route.accountId,
    });
  }
}
