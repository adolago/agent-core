/**
 * WhatsApp Gateway for Always-On Personas
 *
 * Provides bi-directional communication with WhatsApp, routing messages
 * to the appropriate persona (Zee/Stanley/Johny) and sending responses back.
 *
 * Architecture:
 * - Uses whatsapp-web.js to connect via WhatsApp Web
 * - Requires scanning QR code on first connection
 * - Session persists across restarts
 * - Zee acts as the gateway, delegating to Stanley/Johny as needed
 */

import { Log } from "../util/log"
import { Persistence } from "../session/persistence"
import { LifecycleHooks } from "../hooks/lifecycle"
import { Todo } from "../session/todo"
import { Global } from "../global"
import path from "path"
import fs from "fs/promises"
import * as os from "node:os"
import * as crypto from "node:crypto"
import { spawn } from "node:child_process"
import {
  DEFAULT_API_PORT,
  MESSAGE_CHUNK_SIZE,
  TTS_TIMEOUT_SECONDS,
  HEADER_DIRECTORY,
} from "./constants"

const log = Log.create({ service: "whatsapp-gateway" })

// Default fetch timeout for API calls (10 seconds)
const DEFAULT_FETCH_TIMEOUT_MS = 10000

// Valid persona identifiers
const VALID_PERSONAS = ["zee", "stanley", "johny"] as const
type PersonaId = (typeof VALID_PERSONAS)[number]

// Type guard for persona validation
function isValidPersona(value: string): value is PersonaId {
  return VALID_PERSONAS.includes(value as PersonaId)
}

// WhatsApp message type constants
const MESSAGE_TYPES = {
  CHAT: "chat",
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
  DOCUMENT: "document",
  STICKER: "sticker",
} as const

// Type for WhatsApp chat from whatsapp-web.js
interface WhatsAppChat {
  isGroup: boolean
  sendStateTyping(): Promise<void>
}

// Type for WhatsApp message from whatsapp-web.js
interface WhatsAppMessage {
  type: string
  body: string
  from: string
  getChat(): Promise<WhatsAppChat>
  getContact(): Promise<{ number: string; name?: string; pushname?: string }>
  reply(text: string): Promise<void>
}

// Type guard for chat messages
function isChatMessage(message: unknown): message is WhatsAppMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    "body" in message &&
    "from" in message &&
    typeof (message as WhatsAppMessage).getChat === "function" &&
    typeof (message as WhatsAppMessage).getContact === "function" &&
    typeof (message as WhatsAppMessage).reply === "function"
  )
}

export namespace WhatsAppGateway {
  export interface TTSConfig {
    command: string[] // CLI command with {{Text}} and {{OutputPath}} templates
    timeoutSeconds?: number // Default: 30
    maxTextLength?: number // Max chars to synthesize (default: 4000)
    voice?: string // Voice ID for services that support it
  }

  export interface GatewayConfig {
    allowedNumbers?: string[] // Phone numbers allowed to interact (with country code, no +)
    directory: string // Working directory for sessions
    apiBaseUrl?: string // Internal API URL
    apiPort?: number
    sessionDir?: string // Directory to store WhatsApp session
    tts?: TTSConfig // Text-to-speech for voice responses
  }

  interface ChatContext {
    sessionId: string | null
    chatId: string // WhatsApp chat ID
    lastActivity: number
    persona: "zee" | "stanley" | "johny"
    pendingResponse: boolean
  }

  // WhatsApp is exclusively Zee's channel using GLM 4.7 via Z.ai (cerebras)
  // Stanley and Johny use Telegram bots instead

  export class Gateway {
    private config: GatewayConfig
    private client: any // whatsapp-web.js Client
    private running = false
    private chatContexts = new Map<string, ChatContext>()
    private apiBaseUrl: string
    private ready = false
    private currentQR: string | null = null // Store current QR for browser display
    private eventListenerCleanup: Array<() => void> = [] // Track event listeners for cleanup

    constructor(config: GatewayConfig) {
      this.config = {
        apiPort: DEFAULT_API_PORT,
        ...config,
      }
      this.apiBaseUrl = config.apiBaseUrl || `http://127.0.0.1:${this.config.apiPort}`
    }

    async start(): Promise<void> {
      if (this.running) {
        log.warn("Gateway already running")
        return
      }

      try {
        // Dynamic import to avoid issues if library not installed
        // @ts-ignore - whatsapp-web.js is an optional dependency
        const { Client, LocalAuth } = await import("whatsapp-web.js")
        // @ts-ignore - qrcode-terminal is an optional dependency
        const qrcode = await import("qrcode-terminal")

        const sessionDir = this.config.sessionDir || path.join(Global.Path.state, "whatsapp-session")
        await fs.mkdir(sessionDir, { recursive: true })

        this.client = new Client({
          authStrategy: new LocalAuth({
            dataPath: sessionDir,
          }),
          puppeteer: {
            headless: true,
            args: [
              "--no-sandbox",
              "--disable-setuid-sandbox",
              "--disable-dev-shm-usage",
              "--disable-accelerated-2d-canvas",
              "--no-first-run",
              "--no-zygote",
              "--disable-gpu",
            ],
          },
        })

        // Helper to register event handlers with cleanup tracking
        const registerListener = (event: string, handler: (...args: any[]) => void) => {
          this.client.on(event, handler)
          this.eventListenerCleanup.push(() => {
            try {
              this.client?.removeListener(event, handler)
            } catch {
              // Client may be destroyed
            }
          })
        }

        // QR Code event - user needs to scan (with error handling)
        const qrHandler = async (qr: string) => {
          try {
            log.info("WhatsApp QR code received - scan with phone")
            this.currentQR = qr // Store for browser access

            // Save QR code as PNG file for proper scanning
            const qrImagePath = path.join(sessionDir, "whatsapp-qr.png")
            const daemonPort = this.config.apiPort || DEFAULT_API_PORT
            try {
              // @ts-ignore - qrcode is an optional dependency
              const QRCodeModule = await import("qrcode")
              // Handle both ESM default export and CommonJS
              const QRCode = QRCodeModule.default || QRCodeModule
              await QRCode.toFile(qrImagePath, qr, {
                type: "png",
                width: 400,
                margin: 2,
                color: { dark: "#000000", light: "#ffffff" },
              })
              // User-facing messages for QR code
              console.log("\n=== SCAN THIS QR CODE WITH WHATSAPP ===")
              console.log(`\nOpen in browser: http://localhost:${daemonPort}/gateway/whatsapp/qr`)
              console.log(`\nOr open file: ${qrImagePath}`)
              console.log("\n========================================\n")
            } catch (e) {
              // Fallback to terminal output
              log.debug("PNG QR generation failed, using terminal", { error: String(e) })
              console.log("\n=== SCAN THIS QR CODE WITH WHATSAPP ===\n")
              console.log(`Open in browser: http://localhost:${daemonPort}/gateway/whatsapp/qr`)
              console.log("(Terminal QR may be distorted - try zooming out or use a smaller font)\n")
              qrcode.default.generate(qr, { small: true })
              console.log("\n========================================\n")
            }
          } catch (error) {
            log.error("Error in QR handler", { error: error instanceof Error ? error.message : String(error) })
          }
        }
        registerListener("qr", qrHandler)

        // Ready event
        const readyHandler = () => {
          this.ready = true
          this.currentQR = null // Clear QR once connected
          log.info("WhatsApp client is ready")
          // User-facing message to confirm connection in terminal
          console.log("\n✓ WhatsApp: Connected and ready\n")
        }
        registerListener("ready", readyHandler)

        // Authentication event
        const authHandler = () => {
          this.currentQR = null // Clear QR once authenticated
          log.info("WhatsApp authenticated successfully")
        }
        registerListener("authenticated", authHandler)

        // Authentication failure
        const authFailHandler = (msg: string) => {
          log.error("WhatsApp authentication failed", { message: msg })
        }
        registerListener("auth_failure", authFailHandler)

        // Disconnected
        const disconnectHandler = (reason: string) => {
          log.warn("WhatsApp disconnected", { reason })
          this.ready = false
        }
        registerListener("disconnected", disconnectHandler)

        // Message handler (with error handling)
        const messageHandler = async (message: any) => {
          try {
            await this.handleIncomingMessage(message)
          } catch (error) {
            log.error("Error handling WhatsApp message", {
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            })
          }
        }
        registerListener("message", messageHandler)

        // Initialize client - only set running=true AFTER successful init
        await this.client.initialize()
        this.running = true

        log.info("WhatsApp gateway started")
      } catch (error) {
        // Clean up if init fails
        this.running = false
        this.ready = false
        log.error("Failed to start WhatsApp gateway", {
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    }

    async stop(): Promise<void> {
      this.running = false
      this.ready = false

      // Clean up event listeners
      for (const cleanup of this.eventListenerCleanup) {
        cleanup()
      }
      this.eventListenerCleanup = []

      if (this.client) {
        try {
          await this.client.destroy()
        } catch (e) {
          log.debug("Error destroying WhatsApp client", { error: String(e) })
        }
        this.client = null
      }
      log.info("WhatsApp gateway stopped")
    }

    isReady(): boolean {
      return this.ready
    }

    /**
     * Get the current QR code string for browser display
     * Returns null if already authenticated or no QR available
     */
    getCurrentQR(): string | null {
      return this.currentQR
    }

    // -------------------------------------------------------------------------
    // Message Handling
    // -------------------------------------------------------------------------

    private async handleIncomingMessage(rawMessage: unknown): Promise<void> {
      // Validate message structure
      if (!isChatMessage(rawMessage)) {
        log.debug("Received non-standard message, skipping", {
          hasType: typeof rawMessage === "object" && rawMessage !== null && "type" in rawMessage,
        })
        return
      }

      const message = rawMessage

      // Skip non-text messages
      if (message.type !== MESSAGE_TYPES.CHAT) return

      // Skip group messages for now (can be enabled later)
      let chat
      try {
        chat = await message.getChat()
      } catch (error) {
        log.error("Failed to get chat for message", {
          error: error instanceof Error ? error.message : String(error),
        })
        return
      }
      if (chat.isGroup) return

      const chatId = message.from
      const text = message.body || ""
      const contact = await message.getContact()
      const phoneNumber = contact.number

      // Authorization check
      if (!this.isAuthorized(phoneNumber)) {
        log.warn("Unauthorized message", { chatId, phoneNumber })
        await message.reply("Sorry, you're not authorized to use this service.")
        return
      }

      log.info("Received WhatsApp message", {
        chatId,
        phoneNumber,
        name: contact.pushname || contact.name,
        text: text.substring(0, 50),
      })

      // Handle special commands
      if (text.startsWith("/")) {
        await this.handleCommand(message, text)
        return
      }

      // Send typing indicator
      const chatInstance = await message.getChat()
      await chatInstance.sendStateTyping()

      // Determine which persona should handle this
      const persona = this.detectPersona(text)

      // Get or create context for this chat
      const context = await this.getOrCreateContext(chatId, persona)

      try {
        // Send message via internal API
        const response = await this.sendToAgent(context, text, persona)

        if (response) {
          await message.reply(response)
        } else {
          await message.reply("Sorry, I couldn't process your request. Please try again.")
        }
      } catch (error) {
        log.error("Failed to process message", {
          chatId,
          error: error instanceof Error ? error.message : String(error),
        })
        await message.reply("Sorry, I encountered an error processing your message.")
      }
    }

    private async handleCommand(message: any, command: string): Promise<void> {
      const [cmd, ...args] = command.split(" ")

      switch (cmd.toLowerCase()) {
        case "/start":
        case "/help":
          await message.reply(
            `Welcome to Agent-Core!

I'm your gateway to the Personas:
- *Zee* - Personal assistant (default)
- *Stanley* - Finance & investing
- *Johny* - Learning & study

Just send me a message and I'll route it to the right persona.

Commands:
/status - Check system status
/new - Start a new conversation
/zee - Switch to Zee
/stanley - Switch to Stanley
/johny - Switch to Johny`
          )
          break

        case "/status":
          const status = await this.getAgentStatus()
          await message.reply(status)
          break

        case "/new":
          this.chatContexts.delete(message.from)
          await message.reply("Started a new conversation. How can I help?")
          break

        case "/zee":
        case "/stanley":
        case "/johny": {
          const extractedPersona = cmd.substring(1)
          if (!isValidPersona(extractedPersona)) {
            // Should never happen given switch cases, but TypeScript doesn't narrow here
            log.error("Invalid persona extracted from command", { cmd, extractedPersona })
            break
          }
          const context = await this.getOrCreateContext(message.from, extractedPersona)
          context.persona = extractedPersona
          context.sessionId = null // Force new session
          await message.reply(
            `Switched to ${extractedPersona.charAt(0).toUpperCase() + extractedPersona.slice(1)}. How can I help?`
          )
          break
        }

        default:
          await message.reply(
            `Available commands:
/start - Welcome message
/status - Check system status
/new - Start new conversation
/zee - Switch to Zee
/stanley - Switch to Stanley
/johny - Switch to Johny`
          )
      }
    }

    private isAuthorized(phoneNumber?: string): boolean {
      // If no restrictions configured, allow all
      if (!this.config.allowedNumbers?.length) {
        return true
      }

      // Check phone number allowlist
      if (phoneNumber && this.config.allowedNumbers.includes(phoneNumber)) {
        return true
      }

      return false
    }

    private detectPersona(_text: string): "zee" {
      // WhatsApp is exclusively Zee's channel
      // Stanley and Johny are accessible via Telegram bots
      return "zee"
    }

    private async getOrCreateContext(
      chatId: string,
      persona: "zee" | "stanley" | "johny"
    ): Promise<ChatContext> {
      let context = this.chatContexts.get(chatId)

      // If persona changed, create new context
      if (!context || context.persona !== persona) {
        // Try to restore last active session for this persona
        let restoredSessionId: string | null = null
        let hasTodos = false
        let incompleteTodos = 0

        try {
          const lastActive = await Persistence.getLastActive(persona)
          if (lastActive && lastActive.chatId?.toString() === chatId) {
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
              source: "whatsapp",
              chatId: parseInt(chatId) || 0,
              hasTodos,
              incompleteTodos,
              triggerContinuation: incompleteTodos > 0,
            })
          }
        } catch (e) {
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

    private async sendToAgent(
      context: ChatContext,
      text: string,
      persona: "zee" | "stanley" | "johny"
    ): Promise<string | null> {
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
            source: "whatsapp",
            chatId: parseInt(context.chatId) || 0,
            directory: this.config.directory,
          })
        }

        // Track last active session for this persona
        try {
          await Persistence.setLastActive(persona, context.sessionId, parseInt(context.chatId) || 0)
        } catch (e) {
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
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_FETCH_TIMEOUT_MS)

      try {
        const response = await fetch(`${this.apiBaseUrl}/session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [HEADER_DIRECTORY]: this.config.directory,
          },
          body: JSON.stringify({
            title: `WhatsApp (${persona})`,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          log.error("Failed to create session", { status: response.status })
          return null
        }

        const data = await response.json()
        // Validate response has required field
        if (!data || typeof data.id !== "string") {
          log.error("Invalid session response - missing id field")
          return null
        }

        return data as { id: string }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          log.error("Create session timed out")
        } else {
          log.error("Create session error", {
            error: error instanceof Error ? error.message : String(error),
          })
        }
        return null
      } finally {
        clearTimeout(timeoutId)
      }
    }

    private async sendMessageToSession(sessionId: string, message: string, agent: string = "zee"): Promise<string | null> {
      const controller = new AbortController()
      // Use longer timeout for message processing (60 seconds - LLM responses can take time)
      const timeoutId = setTimeout(() => controller.abort(), 60000)

      try {
        const response = await fetch(`${this.apiBaseUrl}/session/${sessionId}/message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [HEADER_DIRECTORY]: this.config.directory,
          },
          body: JSON.stringify({
            parts: [{ type: "text", text: message }],
            agent, // Use the persona as the agent
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          log.error("Failed to send message", { status: response.status })
          return null
        }

        const data = (await response.json()) as {
          parts?: Array<{ type: string; text?: string }>
        }

        const textParts =
          data.parts?.filter((p) => p.type === "text" && p.text).map((p) => p.text!) || []

        return textParts.join("\n") || null
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          log.error("Send message timed out", { sessionId })
        } else {
          log.error("Send message error", {
            error: error instanceof Error ? error.message : String(error),
          })
        }
        return null
      } finally {
        clearTimeout(timeoutId)
      }
    }

    private async getAgentStatus(): Promise<string> {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_FETCH_TIMEOUT_MS)

      try {
        const response = await fetch(`${this.apiBaseUrl}/global/health`, {
          signal: controller.signal,
        })
        if (!response.ok) {
          return "Status: Offline"
        }

        const health = (await response.json()) as { status: string }
        return `Status: ${health.status}\nActive chats: ${this.chatContexts.size}`
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return "Status: Connection timed out"
        }
        return "Status: Unable to connect to agent"
      } finally {
        clearTimeout(timeoutId)
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

    // -------------------------------------------------------------------------
    // Outbound Notifications
    // -------------------------------------------------------------------------

    async sendMessage(chatId: string, text: string): Promise<boolean> {
      if (!this.ready || !this.client) {
        log.warn("WhatsApp client not ready")
        return false
      }

      try {
        await this.client.sendMessage(chatId, text)
        return true
      } catch (error) {
        log.error("Failed to send WhatsApp message", {
          chatId,
          error: error instanceof Error ? error.message : String(error),
        })
        return false
      }
    }

    /**
     * Send a voice message using TTS
     */
    async sendVoice(chatId: string, text: string): Promise<boolean> {
      const ttsConfig = this.config.tts
      if (!ttsConfig?.command?.length) {
        log.debug("No TTS command configured, falling back to text")
        return this.sendMessage(chatId, text)
      }

      if (!this.ready || !this.client) {
        log.warn("WhatsApp client not ready for voice")
        return false
      }

      // Truncate text if too long
      const maxLen = ttsConfig.maxTextLength ?? MESSAGE_CHUNK_SIZE
      const textToSpeak = text.length > maxLen ? text.slice(0, maxLen) + "..." : text

      try {
        const audioBuffer = await this.synthesizeText(textToSpeak)
        if (!audioBuffer) {
          log.warn("TTS synthesis failed, falling back to text")
          return this.sendMessage(chatId, text)
        }

        // Dynamic import MessageMedia
        // @ts-ignore
        const { MessageMedia } = await import("whatsapp-web.js")

        // Create voice message from buffer
        const base64Audio = audioBuffer.toString("base64")
        const media = new MessageMedia("audio/ogg; codecs=opus", base64Audio, "voice.ogg")

        // Send as PTT (push-to-talk/voice note)
        await this.client.sendMessage(chatId, media, { sendAudioAsVoice: true })

        log.info("Voice message sent", { chatId, textLength: textToSpeak.length })
        return true
      } catch (error) {
        log.error("Voice send error", { error: error instanceof Error ? error.message : String(error) })
        return this.sendMessage(chatId, text)
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

      const timeoutMs = Math.max((ttsConfig.timeoutSeconds ?? TTS_TIMEOUT_SECONDS) * 1000, 1000)
      const tmpPath = path.join(os.tmpdir(), `whatsapp-tts-${crypto.randomUUID()}.ogg`)

      try {
        // Apply templates to command
        const escapedText = text.replace(/'/g, "'\\''")
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
        await fs.unlink(tmpPath).catch(() => {})
      }
    }

    private runCommand(argv: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
      return new Promise((resolve) => {
        const [cmd, ...args] = argv
        const proc = spawn(cmd, args)
        let resolved = false
        let timedOut = false

        let stdout = ""
        let stderr = ""

        // Implement actual timeout with SIGKILL
        const timeoutHandle = setTimeout(() => {
          if (!resolved) {
            timedOut = true
            log.warn("Command timed out, sending SIGKILL", { cmd, timeoutMs })
            proc.kill("SIGKILL")
          }
        }, timeoutMs)

        proc.stdout?.on("data", (data) => {
          stdout += data.toString()
        })

        proc.stderr?.on("data", (data) => {
          stderr += data.toString()
        })

        proc.on("close", (code) => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeoutHandle)
            resolve({ stdout, stderr, exitCode: code ?? 1, timedOut })
          }
        })

        proc.on("error", (error) => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeoutHandle)
            stderr += error.message
            resolve({ stdout, stderr, exitCode: 1, timedOut })
          }
        })
      })
    }

    async notify(chatId: string, message: string): Promise<boolean> {
      return this.sendMessage(chatId, message)
    }

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
     * Send a reaction to a message
     * @param chatId - Chat JID (e.g., "1234567890@c.us")
     * @param messageId - Message stanza ID to react to
     * @param emoji - Emoji character (empty string to remove reaction)
     */
    async sendReaction(chatId: string, messageId: string, emoji: string): Promise<boolean> {
      if (!this.ready || !this.client) {
        log.warn("WhatsApp client not ready for reaction")
        return false
      }

      try {
        // Get the message to react to
        const chat = await this.client.getChatById(chatId)
        if (!chat) {
          log.error("Chat not found for reaction", { chatId })
          return false
        }

        // Find the message by ID
        const messages = await chat.fetchMessages({ limit: 50 })
        const targetMessage = messages.find((m: any) => m.id._serialized === messageId || m.id.id === messageId)

        if (!targetMessage) {
          log.error("Message not found for reaction", { chatId, messageId })
          return false
        }

        // Send the reaction (empty emoji removes reaction)
        await targetMessage.react(emoji)
        log.info("Reaction sent", { chatId, messageId, emoji: emoji || "(removed)" })
        return true
      } catch (error) {
        log.error("Failed to send WhatsApp reaction", {
          chatId,
          messageId,
          emoji,
          error: error instanceof Error ? error.message : String(error),
        })
        return false
      }
    }

    /**
     * Send a reaction to a message
     * @param chatId - Chat JID (e.g., "1234567890@c.us")
     * @param messageId - Message stanza ID to react to
     * @param emoji - Emoji character (empty string to remove reaction)
     */
    async sendReaction(chatId: string, messageId: string, emoji: string): Promise<boolean> {
      if (!this.ready || !this.client) {
        log.warn("WhatsApp client not ready for reaction")
        return false
      }

      try {
        // Get the message to react to
        const chat = await this.client.getChatById(chatId)
        if (!chat) {
          log.error("Chat not found for reaction", { chatId })
          return false
        }

        // Find the message by ID
        const messages = await chat.fetchMessages({ limit: 50 })
        const targetMessage = messages.find((m: any) => m.id._serialized === messageId || m.id.id === messageId)

        if (!targetMessage) {
          log.error("Message not found for reaction", { chatId, messageId })
          return false
        }

        // Send the reaction (empty emoji removes reaction)
        await targetMessage.react(emoji)
        log.info("Reaction sent", { chatId, messageId, emoji: emoji || "(removed)" })
        return true
      } catch (error) {
        log.error("Failed to send WhatsApp reaction", {
          chatId,
          messageId,
          emoji,
          error: error instanceof Error ? error.message : String(error),
        })
        return false
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

  export function isConnected(): boolean {
    return instance?.isReady() ?? false
  }
}
