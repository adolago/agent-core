/**
 * Surface Platform Handlers
 *
 * Platform-specific implementations for messaging surfaces.
 */

// WhatsApp (Baileys)
export type { WhatsAppConfig } from './whatsapp.js';
export { WhatsAppHandler, createWhatsAppHandler } from './whatsapp.js';

// Telegram (Telegraf)
export type { TelegramConfig } from './telegram.js';
export { TelegramHandler, createTelegramHandler } from './telegram.js';
