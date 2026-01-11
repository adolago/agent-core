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

import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import * as crypto from "node:crypto"
import { spawn } from "node:child_process"
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

  export interface TelegramVoice {
    file_id: string
    file_unique_id: string
    duration: number
    mime_type?: string
    file_size?: number
  }

  export interface TelegramAudio {
    file_id: string
    file_unique_id: string
    duration: number
    performer?: string
    title?: string
    mime_type?: string
    file_size?: number
  }

  export interface TelegramFile {
    file_id: string
    file_unique_id: string
    file_size?: number
    file_path?: string
  }

  export interface TelegramMessage {
    message_id: number
    from?: TelegramUser
    chat: TelegramChat
    date: number
    text?: string
    voice?: TelegramVoice
    audio?: TelegramAudio
    reply_to_message?: TelegramMessage
  }

  export interface TelegramUpdate {
    update_id: number
    message?: TelegramMessage
  }

  export interface TranscriptionConfig {
    command: string[] // CLI command with {{MediaPath}} template
    timeoutSeconds?: number // Default: 45
  }

  export interface TTSConfig {
    command: string[] // CLI command with {{Text}} and {{OutputPath}} templates
    timeoutSeconds?: number // Default: 30
    maxTextLength?: number // Max chars to synthesize (default: 4000)
    voice?: string // Voice ID for services that support it
  }

  export interface GatewayConfig {
    botToken: string
    persona: "zee" | "stanley" | "johny" // Each bot is tied to a specific persona
    allowedUsers?: number[] // Telegram user IDs allowed to interact
    allowedChats?: number[] // Chat IDs (groups) allowed
    pollingInterval?: number // ms between poll requests
    directory: string // Working directory for sessions
    apiBaseUrl?: string // Internal API URL (default: http://127.0.0.1:PORT)
    apiPort?: number
    transcribeAudio?: TranscriptionConfig // Voice note transcription
    tts?: TTSConfig // Text-to-speech for voice responses
  }

  interface ChatContext {
    sessionId: string | null
    chatId: number
    lastActivity: number
    pendingResponse: boolean
  }

  // Multi-bot support: each bot instance is tied to a specific persona
  // Stanley bot: @triad_stanley_bot - investing/trading
  // Johny bot: @triad_johny_bot - learning/study

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

    private async getFile(fileId: string): Promise<TelegramFile | null> {
      return this.telegramApi<TelegramFile>("getFile", { file_id: fileId })
    }

    private async downloadFile(filePath: string): Promise<Buffer | null> {
      const url = `https://api.telegram.org/file/bot${this.config.botToken}/${filePath}`
      try {
        const response = await fetch(url)
        if (!response.ok) {
          log.error("Failed to download file", { status: response.status })
          return null
        }
        return Buffer.from(await response.arrayBuffer())
      } catch (error) {
        log.error("File download error", {
          error: error instanceof Error ? error.message : String(error),
        })
        return null
      }
    }

    private async transcribeAudio(audioBuffer: Buffer): Promise<string | null> {
      const transcriber = this.config.transcribeAudio
      if (!transcriber?.command?.length) {
        log.debug("No transcription command configured")
        return null
      }

      const timeoutMs = Math.max((transcriber.timeoutSeconds ?? 45) * 1000, 1000)
      const tmpPath = path.join(os.tmpdir(), `telegram-voice-${crypto.randomUUID()}.ogg`)

      try {
        // Write audio to temp file
        await fs.writeFile(tmpPath, audioBuffer)
        log.debug("Saved voice note to temp file", { path: tmpPath, size: audioBuffer.length })

        // Apply {{MediaPath}} template to command
        const argv = transcriber.command.map((part) =>
          part.replace(/\{\{MediaPath\}\}/g, tmpPath)
        )

        // Run transcription command
        const result = await this.runCommand(argv, timeoutMs)
        if (result.exitCode !== 0) {
          log.error("Transcription command failed", { exitCode: result.exitCode, stderr: result.stderr })
          return null
        }

        const transcript = result.stdout.trim()
        if (!transcript) {
          log.warn("Transcription returned empty result")
          return null
        }

        log.info("Voice note transcribed", { length: transcript.length })
        return transcript
      } catch (error) {
        log.error("Transcription error", {
          error: error instanceof Error ? error.message : String(error),
        })
        return null
      } finally {
        // Clean up temp file
        await fs.unlink(tmpPath).catch(() => {})
      }
    }

    private runCommand(argv: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string; exitCode: number }> {
      return new Promise((resolve) => {
        const [cmd, ...args] = argv
        const proc = spawn(cmd, args, { timeout: timeoutMs })

        let stdout = ""
        let stderr = ""

        proc.stdout?.on("data", (data) => {
          stdout += data.toString()
        })

        proc.stderr?.on("data", (data) => {
          stderr += data.toString()
        })

        proc.on("close", (code) => {
          resolve({ stdout, stderr, exitCode: code ?? 1 })
        })

        proc.on("error", (error) => {
          stderr += error.message
          resolve({ stdout, stderr, exitCode: 1 })
        })
      })
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

    /**
     * Send a voice message using TTS
     */
    async sendVoice(chatId: number, text: string, replyToMessageId?: number): Promise<boolean> {
      const ttsConfig = this.config.tts
      if (!ttsConfig?.command?.length) {
        log.debug("No TTS command configured, falling back to text")
        return this.sendMessage(chatId, text, replyToMessageId)
      }

      // Truncate text if too long
      const maxLen = ttsConfig.maxTextLength ?? 4000
      const textToSpeak = text.length > maxLen ? text.slice(0, maxLen) + "..." : text

      try {
        const audioBuffer = await this.synthesizeText(textToSpeak)
        if (!audioBuffer) {
          log.warn("TTS synthesis failed, falling back to text")
          return this.sendMessage(chatId, text, replyToMessageId)
        }

        // Send voice message via Telegram API
        const formData = new FormData()
        formData.append("chat_id", chatId.toString())
        formData.append("voice", new Blob([new Uint8Array(audioBuffer)], { type: "audio/ogg" }), "voice.ogg")
        if (replyToMessageId) {
          formData.append("reply_to_message_id", replyToMessageId.toString())
        }

        const response = await fetch(
          `https://api.telegram.org/bot${this.config.botToken}/sendVoice`,
          { method: "POST", body: formData }
        )

        if (!response.ok) {
          log.error("Failed to send voice message", { status: response.status })
          return this.sendMessage(chatId, text, replyToMessageId)
        }

        log.info("Voice message sent", { chatId, textLength: textToSpeak.length })
        return true
      } catch (error) {
        log.error("Voice send error", { error: error instanceof Error ? error.message : String(error) })
        return this.sendMessage(chatId, text, replyToMessageId)
      }
    }

    /**
     * Synthesize text to speech using configured TTS command
     */
    private async synthesizeText(text: string): Promise<Buffer | null> {
      const ttsConfig = this.config.tts
      if (!ttsConfig?.command?.length) {
        log.debug("No TTS command configured")
        return null
      }

      const timeoutMs = Math.max((ttsConfig.timeoutSeconds ?? 30) * 1000, 1000)
      const tmpPath = path.join(os.tmpdir(), `telegram-tts-${crypto.randomUUID()}.ogg`)

      try {
        // Apply templates to command
        // {{Text}} - the text to synthesize (as shell-escaped string)
        // {{OutputPath}} - where to write the audio file
        // {{Voice}} - optional voice ID
        const escapedText = text.replace(/'/g, "'\\''") // Shell escape single quotes
        const argv = ttsConfig.command.map((part) =>
          part
            .replace(/\{\{Text\}\}/g, escapedText)
            .replace(/\{\{OutputPath\}\}/g, tmpPath)
            .replace(/\{\{Voice\}\}/g, ttsConfig.voice ?? "")
        )

        log.debug("Running TTS command", { textLength: text.length, outputPath: tmpPath })

        // Run TTS command
        const result = await this.runCommand(argv, timeoutMs)
        if (result.exitCode !== 0) {
          log.error("TTS command failed", { exitCode: result.exitCode, stderr: result.stderr })
          return null
        }

        // Read generated audio file
        const audioBuffer = await fs.readFile(tmpPath)
        if (audioBuffer.length === 0) {
          log.warn("TTS produced empty audio file")
          return null
        }

        log.info("Text synthesized to audio", { audioSize: audioBuffer.length })
        return audioBuffer
      } catch (error) {
        log.error("TTS error", {
          error: error instanceof Error ? error.message : String(error),
        })
        return null
      } finally {
        // Clean up temp file
        await fs.unlink(tmpPath).catch(() => {})
      }
    }

    /**
     * Send recording action to show voice message is being prepared
     */
    async sendRecordingVoice(chatId: number): Promise<void> {
      await this.telegramApi("sendChatAction", {
        chat_id: chatId,
        action: "record_voice",
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

        if (update.message) {
          const message = update.message

          // Handle text messages
          if (message.text) {
            await this.handleIncomingMessage(message)
          }
          // Handle voice notes and audio files
          else if (message.voice || message.audio) {
            await this.handleVoiceMessage(message)
          }
        }
      }
    }

    private async handleVoiceMessage(message: TelegramMessage): Promise<void> {
      const chatId = message.chat.id
      const userId = message.from?.id

      // Authorization check
      if (!this.isAuthorized(chatId, userId)) {
        log.warn("Unauthorized voice message", { chatId, userId, username: message.from?.username })
        await this.sendMessage(chatId, "Sorry, you're not authorized to use this bot.")
        return
      }

      // Get file info
      const fileId = message.voice?.file_id || message.audio?.file_id
      if (!fileId) {
        log.error("Voice message without file_id")
        return
      }

      log.info("Received voice message", {
        chatId,
        userId,
        username: message.from?.username,
        duration: message.voice?.duration || message.audio?.duration,
        fileSize: message.voice?.file_size || message.audio?.file_size,
      })

      // Check if transcription is configured
      if (!this.config.transcribeAudio?.command?.length) {
        await this.sendMessage(
          chatId,
          "Voice messages are not supported. Please send a text message instead.",
          message.message_id
        )
        return
      }

      // Send typing indicator
      await this.sendTyping(chatId)

      // Download the voice file
      const file = await this.getFile(fileId)
      if (!file?.file_path) {
        log.error("Failed to get file path", { fileId })
        await this.sendMessage(chatId, "Sorry, I couldn't process your voice message.", message.message_id)
        return
      }

      const audioBuffer = await this.downloadFile(file.file_path)
      if (!audioBuffer) {
        await this.sendMessage(chatId, "Sorry, I couldn't download your voice message.", message.message_id)
        return
      }

      // Transcribe the audio
      const transcript = await this.transcribeAudio(audioBuffer)
      if (!transcript) {
        await this.sendMessage(
          chatId,
          "Sorry, I couldn't transcribe your voice message. Please try again or send a text message.",
          message.message_id
        )
        return
      }

      log.info("Voice message transcribed", {
        chatId,
        transcript: transcript.substring(0, 50),
      })

      // Process as a text message with the transcript
      const textMessage: TelegramMessage = {
        ...message,
        text: transcript,
      }
      await this.handleIncomingMessage(textMessage)
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

      // Use the bot's configured persona (no detection needed)
      const persona = this.config.persona

      // Get or create context for this chat
      const context = await this.getOrCreateContext(chatId)

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
            `Welcome! I'm ${this.getPersonaName()}, your ${this.getPersonaDescription()}.

${this.getPersonaWelcome()}

Commands:
/status - Check system status
/new - Start a new conversation
/help - Show available commands`,
            messageId
          )
          break

        case "/status":
          const status = await this.getAgentStatus()
          await this.sendMessage(chatId, status, messageId)
          break

        case "/new":
          this.chatContexts.delete(chatId)
          await this.sendMessage(chatId, `Started a new conversation with ${this.getPersonaName()}. How can I help?`, messageId)
          break

        case "/help":
        default:
          await this.sendMessage(
            chatId,
            `${this.getPersonaName()} - ${this.getPersonaDescription()}

Available commands:
/start - Welcome message
/status - Check system status
/new - Start new conversation
/help - Show this help`,
            messageId
          )
      }
    }

    private getPersonaName(): string {
      return this.config.persona.charAt(0).toUpperCase() + this.config.persona.slice(1)
    }

    private getPersonaDescription(): string {
      switch (this.config.persona) {
        case "stanley":
          return "Investing & Trading Assistant"
        case "johny":
          return "Learning & Study Assistant"
        default:
          return "AI Assistant"
      }
    }

    private getPersonaWelcome(): string {
      switch (this.config.persona) {
        case "stanley":
          return "I can help with market analysis, portfolio management, stock research, and trading strategies. Ask me about stocks, crypto, earnings, SEC filings, or backtesting strategies."
        case "johny":
          return "I can help you learn efficiently with spaced repetition, knowledge graphs, and deliberate practice. Ask me about any topic you want to master."
        default:
          return "How can I help you today?"
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

    private async getOrCreateContext(chatId: number): Promise<ChatContext> {
      let context = this.chatContexts.get(chatId)
      const persona = this.config.persona

      if (!context) {
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
    async broadcast(message: string): Promise<{ sent: number; failed: number }> {
      let sent = 0
      let failed = 0
      for (const [chatId] of this.chatContexts) {
        const success = await this.sendMessage(chatId, message)
        if (success) sent++
        else failed++
      }
      return { sent, failed }
    }

    /**
     * Get all known chat IDs (users who have messaged this bot)
     */
    getKnownChatIds(): number[] {
      return Array.from(this.chatContexts.keys())
    }
  }

  // Multi-instance management - one gateway per persona
  const instances = new Map<string, Gateway>()

  export function getInstance(persona: "stanley" | "johny"): Gateway | null {
    return instances.get(persona) || null
  }

  export function getAllInstances(): Map<string, Gateway> {
    return instances
  }

  export async function start(config: GatewayConfig): Promise<Gateway> {
    const existing = instances.get(config.persona)
    if (existing) {
      await existing.stop()
    }
    const gateway = new Gateway(config)
    await gateway.start()
    instances.set(config.persona, gateway)
    log.info("Started Telegram bot", { persona: config.persona })
    return gateway
  }

  export async function stop(persona?: "stanley" | "johny"): Promise<void> {
    if (persona) {
      const instance = instances.get(persona)
      if (instance) {
        await instance.stop()
        instances.delete(persona)
      }
    } else {
      // Stop all instances
      for (const [p, instance] of instances) {
        await instance.stop()
        instances.delete(p)
      }
    }
  }

  export async function stopAll(): Promise<void> {
    return stop()
  }

  // Send a message via a specific persona's bot
  export async function sendMessage(
    persona: "stanley" | "johny",
    chatId: number,
    text: string
  ): Promise<boolean> {
    const instance = instances.get(persona)
    if (!instance) {
      log.error("Cannot send message - bot not running", { persona })
      return false
    }
    return instance.sendMessage(chatId, text)
  }

  // Broadcast a message to all known chats for a persona
  export async function broadcast(
    persona: "stanley" | "johny",
    text: string
  ): Promise<{ sent: number; failed: number }> {
    const instance = instances.get(persona)
    if (!instance) {
      log.error("Cannot broadcast - bot not running", { persona })
      return { sent: 0, failed: 0 }
    }
    return instance.broadcast(text)
  }

  // Get known chat IDs for a persona (users who have messaged this bot)
  export function getKnownChats(persona: "stanley" | "johny"): number[] {
    const instance = instances.get(persona)
    if (!instance) return []
    return instance.getKnownChatIds()
  }
}
