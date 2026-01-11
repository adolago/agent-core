/**
 * Mock Telegram API for testing
 *
 * Provides mock responses for Telegram Bot API calls to enable testing
 * without real bot tokens or network access.
 */

export interface MockTelegramUser {
  id: number
  is_bot: boolean
  first_name: string
  last_name?: string
  username?: string
}

export interface MockTelegramChat {
  id: number
  type: "private" | "group" | "supergroup" | "channel"
  title?: string
  username?: string
  first_name?: string
  last_name?: string
}

export interface MockTelegramMessage {
  message_id: number
  from?: MockTelegramUser
  chat: MockTelegramChat
  date: number
  text?: string
  reply_to_message?: MockTelegramMessage
  entities?: Array<{
    type: string
    offset: number
    length: number
  }>
}

export interface MockTelegramUpdate {
  update_id: number
  message?: MockTelegramMessage
  callback_query?: {
    id: string
    from: MockTelegramUser
    message?: MockTelegramMessage
    data?: string
  }
}

export interface MockTelegramApiOptions {
  /** Bot info returned by getMe */
  botInfo?: MockTelegramUser
  /** Pre-configured updates to return from getUpdates */
  updates?: MockTelegramUpdate[]
  /** Simulate errors on specific methods */
  errorMethods?: Set<string>
  /** Network delay simulation */
  delay?: number
}

const DEFAULT_BOT: MockTelegramUser = {
  id: 123456789,
  is_bot: true,
  first_name: "TestBot",
  username: "test_bot",
}

export function createMockTelegramApi(options: MockTelegramApiOptions = {}) {
  const { botInfo = DEFAULT_BOT, updates = [], errorMethods = new Set(), delay = 0 } = options

  let updateOffset = 0
  let messageIdCounter = 1
  const sentMessages: Array<{
    chatId: number
    text: string
    parseMode?: string
    replyTo?: number
    timestamp: number
  }> = []

  const pendingUpdates = [...updates]

  async function simulateDelay() {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  function shouldError(method: string): boolean {
    return errorMethods.has(method)
  }

  return {
    /**
     * Mock fetch function that intercepts Telegram API calls
     */
    async fetch(url: string, init?: RequestInit): Promise<Response> {
      await simulateDelay()

      const urlObj = new URL(url)
      const pathParts = urlObj.pathname.split("/")
      const method = pathParts[pathParts.length - 1]

      if (shouldError(method)) {
        return new Response(
          JSON.stringify({
            ok: false,
            error_code: 500,
            description: `Mock error for ${method}`,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      }

      let body: Record<string, unknown> = {}
      if (init?.body) {
        try {
          body = JSON.parse(init.body as string)
        } catch {
          // URLSearchParams
          const params = new URLSearchParams(init.body as string)
          for (const [key, value] of params) {
            body[key] = value
          }
        }
      }

      let result: unknown

      switch (method) {
        case "getMe":
          result = botInfo
          break

        case "getUpdates":
          const offset = Number(body.offset) || 0
          const limit = Number(body.limit) || 100
          const relevantUpdates = pendingUpdates.filter((u) => u.update_id >= offset).slice(0, limit)
          if (relevantUpdates.length > 0) {
            updateOffset = relevantUpdates[relevantUpdates.length - 1].update_id + 1
          }
          result = relevantUpdates
          break

        case "sendMessage":
          const sentMsg = {
            chatId: Number(body.chat_id),
            text: String(body.text),
            parseMode: body.parse_mode as string | undefined,
            replyTo: body.reply_to_message_id ? Number(body.reply_to_message_id) : undefined,
            timestamp: Date.now(),
          }
          sentMessages.push(sentMsg)
          result = {
            message_id: messageIdCounter++,
            chat: { id: sentMsg.chatId, type: "private" },
            date: Math.floor(Date.now() / 1000),
            text: sentMsg.text,
          }
          break

        case "editMessageText":
          result = {
            message_id: Number(body.message_id) || messageIdCounter,
            chat: { id: Number(body.chat_id), type: "private" },
            date: Math.floor(Date.now() / 1000),
            text: String(body.text),
          }
          break

        case "deleteMessage":
          result = true
          break

        case "setMessageReaction":
          result = true
          break

        case "getFile":
          result = {
            file_id: String(body.file_id),
            file_unique_id: "unique_" + body.file_id,
            file_size: 1024,
            file_path: `files/${body.file_id}.bin`,
          }
          break

        default:
          result = true
      }

      return new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    },

    /**
     * Add an update to be returned by getUpdates
     */
    addUpdate(update: Omit<MockTelegramUpdate, "update_id">) {
      pendingUpdates.push({
        ...update,
        update_id: updateOffset + pendingUpdates.length,
      })
    },

    /**
     * Add a text message update
     */
    addTextMessage(
      chatId: number,
      text: string,
      from: Partial<MockTelegramUser> = {}
    ) {
      this.addUpdate({
        message: {
          message_id: messageIdCounter++,
          from: {
            id: from.id ?? 111111,
            is_bot: from.is_bot ?? false,
            first_name: from.first_name ?? "TestUser",
            username: from.username,
          },
          chat: {
            id: chatId,
            type: "private",
            first_name: from.first_name ?? "TestUser",
          },
          date: Math.floor(Date.now() / 1000),
          text,
        },
      })
    },

    /**
     * Get all messages sent by the bot
     */
    getSentMessages() {
      return [...sentMessages]
    },

    /**
     * Get the last message sent by the bot
     */
    getLastSentMessage() {
      return sentMessages[sentMessages.length - 1]
    },

    /**
     * Clear sent messages history
     */
    clearSentMessages() {
      sentMessages.length = 0
    },

    /**
     * Clear pending updates
     */
    clearUpdates() {
      pendingUpdates.length = 0
    },
  }
}
