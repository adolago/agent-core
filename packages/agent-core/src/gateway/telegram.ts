/**
 * Telegram Gateway for Always-On Personas
 *
 * Provides bi-directional communication with Telegram, routing messages
 * to the appropriate persona (Zee/Stanley/Johny) and sending responses back.
 *
 * Architecture:
 * - Long polling for incoming messages (no webhook server required)
 * - Zee acts as the gateway, delegating to Stanley/Johny as needed
 * - Uses the daemon's HTTP API for session management
 */

import { Log } from "../util/log"
import { Persistence } from "../session/persistence"
import { LifecycleHooks } from "../hooks/lifecycle"
import { Todo } from "../session/todo"

const log = Log.create({ service: "telegram-gateway" })

export namespace TelegramGateway {
  // Telegram API types
  export interface TelegramUser {
    id: number
    is_bot: boolean
    first_name: string
    last_name?: string
    username?: string
    language_code?: string
  }

  export interface TelegramChat {
    id: number
    type: "private" | "group" | "supergroup" | "channel"
    title?: string
    username?: string
    first_name?: string
    last_name?: string
  }

  export interface TelegramMessage {
    message_id: number
    from?: TelegramUser
    chat: TelegramChat
    date: number
    text?: string
    reply_to_message?: TelegramMessage
  }

  export interface TelegramUpdate {
    update_id: number
    message?: TelegramMessage
  }

  export interface GatewayConfig {
    botToken: string
    allowedUsers?: number[] // Telegram user IDs allowed to interact
    allowedChats?: number[] // Chat IDs (groups) allowed
    pollingInterval?: number // ms between poll requests
    directory: string // Working directory for sessions
    apiBaseUrl?: string // Internal API URL (default: http://127.0.0.1:PORT)
    apiPort?: number
  }

  interface ChatContext {
    sessionId: string | null
    chatId: number
    lastActivity: number
    persona: "zee" | "stanley" | "johny"
    pendingResponse: boolean
  }

  // Intent patterns for persona routing
  const STANLEY_PATTERNS = [
    /portfolio/i,
    /stock/i,
    /market/i,
    /invest/i,
    /trading/i,
    /finance/i,
    /ticker/i,
    /nvda|aapl|tsla|msft|goog/i,
    /buy|sell|hold/i,
    /earnings/i,
    /dividend/i,
  ]

  const JOHNY_PATTERNS = [
    /study/i,
    /learn/i,
    /quiz/i,
    /teach/i,
    /explain/i,
    /knowledge/i,
    /practice/i,
    /spaced repetition/i,
    /flashcard/i,
    /math|calculus|algebra|physics|chemistry/i,
  ]

  export class Gateway {
    private config: GatewayConfig
    private running = false
    private lastUpdateId = 0
    private chatContexts = new Map<number, ChatContext>()
    private pollTimeout: NodeJS.Timeout | null = null
    private apiBaseUrl: string

    constructor(config: GatewayConfig) {
      this.config = {
        pollingInterval: 1000,
        apiPort: 3456,
        ...config,
      }
      this.apiBaseUrl = config.apiBaseUrl || `http://127.0.0.1:${this.config.apiPort}`
    }

    async start(): Promise<void> {
      if (this.running) {
        log.warn("Gateway already running")
        return
      }

      // Validate bot token
      const me = await this.getMe()
      if (!me) {
        throw new Error("Failed to connect to Telegram - invalid bot token")
      }

      log.info("Telegram gateway started", {
        botUsername: me.username,
        botId: me.id,
      })

      this.running = true
      this.pollLoop()
    }

    async stop(): Promise<void> {
      this.running = false
      if (this.pollTimeout) {
        clearTimeout(this.pollTimeout)
        this.pollTimeout = null
      }
      log.info("Telegram gateway stopped")
    }

    // -------------------------------------------------------------------------
    // Telegram API Methods
    // -------------------------------------------------------------------------

    private async telegramApi<T>(method: string, params?: Record<string, unknown>): Promise<T | null> {
      const url = `https://api.telegram.org/bot${this.config.botToken}/${method}`

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: params ? JSON.stringify(params) : undefined,
        })

        const data = (await response.json()) as { ok: boolean; result?: T; description?: string }

        if (!data.ok) {
          log.error("Telegram API error", { method, error: data.description })
          return null
        }

        return data.result ?? null
      } catch (error) {
        log.error("Telegram API request failed", {
          method,
          error: error instanceof Error ? error.message : String(error),
        })
        return null
      }
    }

    private async getMe(): Promise<TelegramUser | null> {
      return this.telegramApi<TelegramUser>("getMe")
    }

    private async getUpdates(offset?: number): Promise<TelegramUpdate[]> {
      const result = await this.telegramApi<TelegramUpdate[]>("getUpdates", {
        offset,
        timeout: 30, // Long polling timeout
        allowed_updates: ["message"],
      })
      return result ?? []
    }

    async sendMessage(chatId: number, text: string, replyToMessageId?: number): Promise<boolean> {
      // Split long messages for Telegram's 4096 char limit
      const chunks = this.chunkMessage(text, 4000)

      for (let i = 0; i < chunks.length; i++) {
        const result = await this.telegramApi<TelegramMessage>("sendMessage", {
          chat_id: chatId,
          text: chunks[i],
          parse_mode: "Markdown",
          reply_to_message_id: i === 0 ? replyToMessageId : undefined,
        })
        if (!result) return false
      }
      return true
    }

    async sendTyping(chatId: number): Promise<void> {
      await this.telegramApi("sendChatAction", {
        chat_id: chatId,
        action: "typing",
      })
    }

    // -------------------------------------------------------------------------
    // Polling Loop
    // -------------------------------------------------------------------------

    private pollLoop(): void {
      if (!this.running) return

      this.poll()
        .catch((error) => {
          log.error("Poll error", { error: error instanceof Error ? error.message : String(error) })
        })
        .finally(() => {
          if (this.running) {
            this.pollTimeout = setTimeout(() => this.pollLoop(), this.config.pollingInterval)
          }
        })
    }

    private async poll(): Promise<void> {
      const updates = await this.getUpdates(this.lastUpdateId + 1)

      for (const update of updates) {
        this.lastUpdateId = update.update_id

        if (update.message?.text) {
          await this.handleIncomingMessage(update.message)
        }
      }
    }

    // -------------------------------------------------------------------------
    // Message Handling
    // -------------------------------------------------------------------------

    private async handleIncomingMessage(message: TelegramMessage): Promise<void> {
      const chatId = message.chat.id
      const userId = message.from?.id
      const text = message.text || ""

      // Authorization check
      if (!this.isAuthorized(chatId, userId)) {
        log.warn("Unauthorized message", { chatId, userId, username: message.from?.username })
        await this.sendMessage(chatId, "Sorry, you're not authorized to use this bot.")
        return
      }

      log.info("Received message", {
        chatId,
        userId,
        username: message.from?.username,
        text: text.substring(0, 50),
      })

      // Handle special commands
      if (text.startsWith("/")) {
        await this.handleCommand(chatId, text, message.message_id)
        return
      }

      // Send typing indicator
      await this.sendTyping(chatId)

      // Determine which persona should handle this
      const persona = this.detectPersona(text)

      // Get or create context for this chat
      const context = await this.getOrCreateContext(chatId, persona)

      try {
        // Send message via internal API
        const response = await this.sendToAgent(context, text, persona)

        if (response) {
          await this.sendMessage(chatId, response, message.message_id)
        } else {
          await this.sendMessage(chatId, "Sorry, I couldn't process your request. Please try again.")
        }
      } catch (error) {
        log.error("Failed to process message", {
          chatId,
          error: error instanceof Error ? error.message : String(error),
        })
        await this.sendMessage(chatId, "Sorry, I encountered an error processing your message.")
      }
    }

    private async handleCommand(chatId: number, command: string, messageId: number): Promise<void> {
      const [cmd, ...args] = command.split(" ")

      switch (cmd.toLowerCase()) {
        case "/start":
          await this.sendMessage(
            chatId,
            `Welcome to Agent-Core!

I'm your gateway to the Personas:
• *Zee* - Personal assistant (default)
• *Stanley* - Finance & investing
• *Johny* - Learning & study

Just send me a message and I'll route it to the right persona.

Commands:
/status - Check system status
/new - Start a new conversation
/help - Show this help`,
            messageId
          )
          break

        case "/status":
          const status = await this.getAgentStatus()
          await this.sendMessage(chatId, status, messageId)
          break

        case "/new":
          this.chatContexts.delete(chatId)
          await this.sendMessage(chatId, "Started a new conversation. How can I help?", messageId)
          break

        case "/zee":
        case "/stanley":
        case "/johny":
          const persona = cmd.substring(1) as "zee" | "stanley" | "johny"
          const context = await this.getOrCreateContext(chatId, persona)
          context.persona = persona
          context.sessionId = null // Force new session
          await this.sendMessage(chatId, `Switched to ${persona.charAt(0).toUpperCase() + persona.slice(1)}. How can I help?`, messageId)
          break

        case "/help":
        default:
          await this.sendMessage(
            chatId,
            `Available commands:
/start - Welcome message
/status - Check system status
/new - Start new conversation
/zee - Switch to Zee
/stanley - Switch to Stanley
/johny - Switch to Johny`,
            messageId
          )
      }
    }

    private isAuthorized(chatId: number, userId?: number): boolean {
      // If no restrictions configured, allow all
      if (!this.config.allowedUsers?.length && !this.config.allowedChats?.length) {
        return true
      }

      // Check chat allowlist
      if (this.config.allowedChats?.includes(chatId)) {
        return true
      }

      // Check user allowlist
      if (userId && this.config.allowedUsers?.includes(userId)) {
        return true
      }

      return false
    }

    private detectPersona(text: string): "zee" | "stanley" | "johny" {
      // Check for explicit persona mentions
      const lowerText = text.toLowerCase()

      if (lowerText.includes("@stanley") || lowerText.startsWith("stanley,") || lowerText.startsWith("stanley:")) {
        return "stanley"
      }
      if (lowerText.includes("@johny") || lowerText.startsWith("johny,") || lowerText.startsWith("johny:")) {
        return "johny"
      }
      if (lowerText.includes("@zee") || lowerText.startsWith("zee,") || lowerText.startsWith("zee:")) {
        return "zee"
      }

      // Check intent patterns for Stanley
      for (const pattern of STANLEY_PATTERNS) {
        if (pattern.test(text)) {
          return "stanley"
        }
      }

      // Check intent patterns for Johny
      for (const pattern of JOHNY_PATTERNS) {
        if (pattern.test(text)) {
          return "johny"
        }
      }

      // Default to Zee for general requests
      return "zee"
    }

    private async getOrCreateContext(chatId: number, persona: "zee" | "stanley" | "johny"): Promise<ChatContext> {
      let context = this.chatContexts.get(chatId)

      // If persona changed, create new context
      if (!context || context.persona !== persona) {
        // Try to restore last active session for this persona
        let restoredSessionId: string | null = null
        let hasTodos = false
        let incompleteTodos = 0

        try {
          const lastActive = await Persistence.getLastActive(persona)
          if (lastActive && lastActive.chatId === chatId) {
            restoredSessionId = lastActive.sessionId
            log.info("Restored last active session", { persona, sessionId: restoredSessionId, chatId })

            // Check for incomplete todos
            try {
              const todos = await Todo.get(restoredSessionId)
              hasTodos = todos.length > 0
              incompleteTodos = todos.filter(
                (t) => t.status !== "completed" && t.status !== "cancelled"
              ).length
            } catch (e) {
              log.debug("Could not check todos for restored session", { error: String(e) })
            }

            // Emit session restore hook
            await LifecycleHooks.emitSessionRestore({
              sessionId: restoredSessionId,
              persona,
              source: "telegram",
              chatId,
              hasTodos,
              incompleteTodos,
              triggerContinuation: incompleteTodos > 0,
            })
          }
        } catch (e) {
          // Persistence may not be initialized (e.g., if Instance context not available)
          log.debug("Could not restore last active session", { error: String(e) })
        }

        context = {
          sessionId: restoredSessionId,
          chatId,
          lastActivity: Date.now(),
          persona,
          pendingResponse: false,
        }
        this.chatContexts.set(chatId, context)
      } else {
        context.lastActivity = Date.now()
      }

      return context
    }

    // -------------------------------------------------------------------------
    // Agent API Integration
    // -------------------------------------------------------------------------

    private async sendToAgent(context: ChatContext, text: string, persona: "zee" | "stanley" | "johny"): Promise<string | null> {
      // Add persona context to the message
      const personaContext = this.getPersonaContext(persona)
      const fullMessage = personaContext ? `${personaContext}\n\nUser message: ${text}` : text

      try {
        // Create a new session if needed
        if (!context.sessionId) {
          const session = await this.createSession(persona)
          if (!session) {
            return null
          }
          context.sessionId = session.id

          // Emit session-start hook for new session
          await LifecycleHooks.emitSessionStart({
            sessionId: session.id,
            persona,
            source: "telegram",
            chatId: context.chatId,
            directory: this.config.directory,
          })
        }

        // Track last active session for this persona
        try {
          await Persistence.setLastActive(persona, context.sessionId, context.chatId)
        } catch (e) {
          // Persistence may not be initialized
          log.debug("Could not save last active session", { error: String(e) })
        }

        // Send message and get response (use persona as agent name)
        const response = await this.sendMessageToSession(context.sessionId, fullMessage, persona)
        return response
      } catch (error) {
        log.error("Agent API error", {
          error: error instanceof Error ? error.message : String(error),
        })
        return null
      }
    }

    private async createSession(persona: string): Promise<{ id: string } | null> {
      try {
        const response = await fetch(`${this.apiBaseUrl}/session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-opencode-directory": this.config.directory,
          },
          body: JSON.stringify({
            title: `Telegram (${persona})`,
          }),
        })

        if (!response.ok) {
          log.error("Failed to create session", { status: response.status })
          return null
        }

        return (await response.json()) as { id: string }
      } catch (error) {
        log.error("Create session error", {
          error: error instanceof Error ? error.message : String(error),
        })
        return null
      }
    }

    private async sendMessageToSession(sessionId: string, message: string, agent: string = "zee"): Promise<string | null> {
      try {
        // Use the message endpoint with correct parts format
        const response = await fetch(`${this.apiBaseUrl}/session/${sessionId}/message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-opencode-directory": this.config.directory,
          },
          body: JSON.stringify({
            parts: [{ type: "text", text: message }],
            agent, // Use the persona as the agent
          }),
        })

        if (!response.ok) {
          log.error("Failed to send message", { status: response.status })
          return null
        }

        // The response contains the assistant's reply
        const data = (await response.json()) as {
          parts?: Array<{ type: string; text?: string }>
        }

        // Extract text from response parts
        const textParts = data.parts?.filter((p) => p.type === "text" && p.text).map((p) => p.text!) || []

        return textParts.join("\n") || null
      } catch (error) {
        log.error("Send message error", {
          error: error instanceof Error ? error.message : String(error),
        })
        return null
      }
    }

    private async getAgentStatus(): Promise<string> {
      try {
        const response = await fetch(`${this.apiBaseUrl}/global/health`)
        if (!response.ok) {
          return "Status: Offline"
        }

        const health = (await response.json()) as { status: string }
        return `Status: ${health.status}\nActive chats: ${this.chatContexts.size}`
      } catch {
        return "Status: Unable to connect to agent"
      }
    }

    private getPersonaContext(persona: "zee" | "stanley" | "johny"): string {
      switch (persona) {
        case "stanley":
          return "[System: You are Stanley, the investing and financial research assistant. Focus on market analysis, portfolio management, and financial strategies. Be concise for mobile messaging.]"
        case "johny":
          return "[System: You are Johny, the study and learning assistant. Focus on teaching, quizzing, and knowledge management. Be concise for mobile messaging.]"
        case "zee":
        default:
          return "[System: You are Zee, the personal assistant. Help with life admin, messaging, calendar, and general tasks. Be concise for mobile messaging. You can suggest delegating to Stanley for finance or Johny for learning.]"
      }
    }

    private chunkMessage(text: string, maxLength: number): string[] {
      if (text.length <= maxLength) {
        return [text]
      }

      const chunks: string[] = []
      let remaining = text

      while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
          chunks.push(remaining)
          break
        }

        // Try to break at newline
        let breakPoint = remaining.lastIndexOf("\n", maxLength)
        if (breakPoint < maxLength * 0.5) {
          // Try to break at space
          breakPoint = remaining.lastIndexOf(" ", maxLength)
        }
        if (breakPoint < maxLength * 0.5) {
          breakPoint = maxLength
        }

        chunks.push(remaining.slice(0, breakPoint))
        remaining = remaining.slice(breakPoint).trimStart()
      }

      return chunks
    }

    // -------------------------------------------------------------------------
    // Outbound Notifications
    // -------------------------------------------------------------------------

    /**
     * Send a notification to a specific chat
     */
    async notify(chatId: number, message: string): Promise<boolean> {
      return this.sendMessage(chatId, message)
    }

    /**
     * Broadcast a notification to all active chats
     */
    async broadcast(message: string): Promise<void> {
      for (const [chatId] of this.chatContexts) {
        await this.sendMessage(chatId, message)
      }
    }
  }

  // Singleton instance management
  let instance: Gateway | null = null

  export function getInstance(): Gateway | null {
    return instance
  }

  export async function start(config: GatewayConfig): Promise<Gateway> {
    if (instance) {
      await instance.stop()
    }
    instance = new Gateway(config)
    await instance.start()
    return instance
  }

  export async function stop(): Promise<void> {
    if (instance) {
      await instance.stop()
      instance = null
    }
  }
}
