/**
 * Telegram Platform Handler
 *
 * Telegraf-based Telegram integration for the messaging surface.
 * Implements the MessagingPlatformHandler interface.
 */

import type {
  MessagingPlatformHandler,
  PlatformMessage,
} from '../messaging.js';
import type { SurfaceMedia } from '../types.js';
import { Log } from '../../util/log';

const log = Log.create({ service: 'telegram-platform' });

// =============================================================================
// Configuration
// =============================================================================

export type TelegramConfig = {
  /** Bot token from @BotFather */
  botToken: string;
  /** User IDs allowed to message (empty = all) */
  allowedUsers?: number[];
  /** Group/chat IDs allowed (empty = all) */
  allowedGroups?: number[];
  /** Require mention/bot command in groups */
  requireMention?: boolean;
  /** Bot username (for mention detection) */
  botUsername?: string;
};

// =============================================================================
// Telegraf Integration
// =============================================================================

/**
 * Telegram platform handler using Telegraf.
 *
 * Note: Telegraf is an external dependency. This handler gracefully degrades
 * if Telegraf is not installed.
 */
export class TelegramHandler implements MessagingPlatformHandler {
  readonly platform = 'telegram' as const;

  private config: TelegramConfig;
  private bot: any = null;
  private messageHandlers = new Set<(message: PlatformMessage) => void>();
  private state: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';

  constructor(config: TelegramConfig) {
    this.config = {
      botToken: config.botToken,
      allowedUsers: config.allowedUsers || [],
      allowedGroups: config.allowedGroups || [],
      requireMention: config.requireMention ?? true,
      botUsername: config.botUsername,
    };
  }

  async connect(): Promise<void> {
    if (this.state === 'connected') {
      return;
    }

    this.state = 'connecting';

    try {
      // Dynamic import of Telegraf
      const telegrafModule = await this.loadTelegraf();
      if (!telegrafModule) {
        throw new Error(
          'Telegraf not available. Install with: npm install telegraf'
        );
      }

      const { Telegraf } = telegrafModule;
      this.bot = new Telegraf(this.config.botToken);

      // Get bot info if username not provided
      if (!this.config.botUsername) {
        try {
          const botInfo = await this.bot.telegram.getMe();
          this.config.botUsername = botInfo.username;
          log.info('Telegram bot info retrieved', {
            username: botInfo.username,
            id: botInfo.id,
          });
        } catch (error) {
          log.warn('Could not get bot info', { error });
        }
      }

      // Set up message handler
      this.bot.on('message', (ctx: any) => {
        this.handleMessage(ctx);
      });

      // Handle errors
      this.bot.catch((err: any, ctx: any) => {
        log.error('Telegraf error', {
          error: err instanceof Error ? err.message : String(err),
          updateType: ctx?.updateType,
        });
      });

      // Start bot
      await this.bot.launch();

      this.state = 'connected';
      log.info('Telegram bot connected');

      // Enable graceful stop
      process.once('SIGINT', () => this.disconnect());
      process.once('SIGTERM', () => this.disconnect());
    } catch (error) {
      this.state = 'error';
      log.error('Failed to connect Telegram', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.bot) {
      await this.bot.stop();
      this.bot = null;
    }
    this.state = 'disconnected';
    log.info('Telegram disconnected');
  }

  async sendMessage(
    target: string,
    text: string,
    options?: {
      replyToId?: string;
      media?: SurfaceMedia[];
    }
  ): Promise<void> {
    if (!this.bot || this.state !== 'connected') {
      throw new Error('Telegram not connected');
    }

    try {
      const chatId = target;

      if (options?.media && options.media.length > 0) {
        // Send media with caption
        for (const media of options.media) {
          const mimeType = media.mimeType || 'application/octet-stream';
          const sendOptions: any = {
            caption: text,
            reply_to_message_id: options.replyToId ? parseInt(options.replyToId) : undefined,
          };

          if (mimeType.startsWith('image/')) {
            await this.bot.telegram.sendPhoto(chatId, { source: media.path }, sendOptions);
          } else if (mimeType.startsWith('video/')) {
            await this.bot.telegram.sendVideo(chatId, { source: media.path }, sendOptions);
          } else if (mimeType.startsWith('audio/')) {
            await this.bot.telegram.sendAudio(chatId, { source: media.path }, sendOptions);
          } else {
            await this.bot.telegram.sendDocument(chatId, { source: media.path }, sendOptions);
          }

          // Only include text with first media item
          text = '';
        }
      } else {
        // Send text message
        // Split long messages
        const MAX_LENGTH = 4096;
        let remainingText = text;

        while (remainingText.length > 0) {
          const chunk = remainingText.slice(0, MAX_LENGTH);
          remainingText = remainingText.slice(MAX_LENGTH);

          await this.bot.telegram.sendMessage(chatId, chunk, {
            reply_to_message_id: options?.replyToId ? parseInt(options.replyToId) : undefined,
            parse_mode: 'Markdown',
          });
        }
      }
    } catch (error) {
      log.error('Failed to send Telegram message', {
        target,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async sendTyping(target: string): Promise<void> {
    if (!this.bot || this.state !== 'connected') {
      return;
    }

    try {
      await this.bot.telegram.sendChatAction(target, 'typing');
    } catch (error) {
      log.debug('Failed to send typing action', { error });
    }
  }

  onMessage(handler: (message: PlatformMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  private async loadTelegraf(): Promise<any | null> {
    try {
      // @ts-expect-error - telegraf is an optional dependency
      const module = await import('telegraf');
      return module;
    } catch {
      return null;
    }
  }

  private handleMessage(ctx: any): void {
    try {
      const msg = ctx.message || ctx.update?.message;
      if (!msg) return;

      const platformMsg = this.convertToPlatformMessage(msg, ctx);
      if (!platformMsg) return;

      // Check filters
      if (!this.shouldProcessMessage(platformMsg)) {
        return;
      }

      // Notify handlers
      for (const handler of this.messageHandlers) {
        try {
          handler(platformMsg);
        } catch (error) {
          log.error('Message handler error', { error });
        }
      }
    } catch (error) {
      log.error('Error handling Telegram message', { error });
    }
  }

  private convertToPlatformMessage(
    msg: any,
    ctx: any
  ): PlatformMessage | null {
    try {
      const chat = msg.chat;
      const from = msg.from;

      if (!chat || !from) return null;

      const isGroup = chat.type === 'group' || chat.type === 'supergroup';

      // Extract text
      let body = msg.text || msg.caption || '';

      // If no text and not media, skip
      if (!body && !msg.photo && !msg.video && !msg.document && !msg.audio) {
        return null;
      }

      // Check if bot was mentioned
      const wasMentioned = this.checkMention(msg, isGroup, body);

      // Remove bot mention from text for cleaner processing
      if (wasMentioned && this.config.botUsername) {
        const mentionPattern = new RegExp(`@${this.config.botUsername}\\s*`, 'gi');
        body = body.replace(mentionPattern, '').trim();
      }

      // Handle bot commands (they start with /)
      if (body.startsWith('/')) {
        // Keep commands as-is, they serve as explicit mentions
      }

      return {
        id: String(msg.message_id),
        senderId: String(from.id),
        senderName: from.username || from.first_name || String(from.id),
        body,
        timestamp: msg.date * 1000,
        isGroup,
        groupId: isGroup ? String(chat.id) : undefined,
        groupName: isGroup ? chat.title : undefined,
        replyToId: msg.reply_to_message ? String(msg.reply_to_message.message_id) : undefined,
        wasMentioned,
        platform: 'telegram',
      };
    } catch (error) {
      log.error('Failed to convert Telegram message', { error });
      return null;
    }
  }

  private checkMention(msg: any, isGroup: boolean, text: string): boolean {
    if (!isGroup) return true; // Always process DMs

    // Check for bot command (starts with /)
    if (text.startsWith('/')) return true;

    // Check for mention in entities
    if (msg.entities) {
      for (const entity of msg.entities) {
        if (entity.type === 'mention') {
          const mention = text.slice(entity.offset, entity.offset + entity.length);
          if (this.config.botUsername && mention === `@${this.config.botUsername}`) {
            return true;
          }
        }
      }
    }

    // Check for text mention (for users without username)
    if (msg.entities) {
      for (const entity of msg.entities) {
        if (entity.type === 'text_mention') {
          // text_mention has user info in the entity itself
          if (entity.user?.is_bot && entity.user?.username === this.config.botUsername) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private shouldProcessMessage(msg: PlatformMessage): boolean {
    // Check allowed users
    if (this.config.allowedUsers && this.config.allowedUsers.length > 0) {
      const userId = parseInt(msg.senderId);
      if (!this.config.allowedUsers.includes(userId)) {
        return false;
      }
    }

    // Check allowed groups
    if (msg.isGroup && this.config.allowedGroups && this.config.allowedGroups.length > 0) {
      const groupId = parseInt(msg.groupId || '0');
      if (!this.config.allowedGroups.includes(groupId)) {
        return false;
      }
    }

    // Check mention requirement for groups
    if (msg.isGroup && this.config.requireMention && !msg.wasMentioned) {
      return false;
    }

    return true;
  }
}

/**
 * Create a Telegram handler.
 */
export function createTelegramHandler(config: TelegramConfig): TelegramHandler {
  return new TelegramHandler(config);
}
