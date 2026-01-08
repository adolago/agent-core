/**
 * Agent LSP Server
 *
 * An LSP server that exposes agent-core state to editors like Neovim.
 * This allows inline visualization of drone status, code actions for
 * spawning drones, and hover info showing agent state.
 *
 * Uses a lightweight JSON-RPC implementation over stdio to avoid
 * heavy dependencies while maintaining LSP compatibility.
 */

import { createInterface } from "readline";
import type { LSPServerConfig, DroneStatus, TaskStatus } from "./types";
import { AgentCodeActionKind } from "./types";
import { requestDaemon } from "../daemon/ipc-client";

// LSP message types (minimal definitions)
interface LSPMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface Position {
  line: number;
  character: number;
}

interface Range {
  start: Position;
  end: Position;
}

interface Diagnostic {
  range: Range;
  severity?: number;
  code?: string | number;
  source?: string;
  message: string;
  data?: unknown;
}

// Severity constants
const DiagnosticSeverity = {
  Error: 1,
  Warning: 2,
  Information: 3,
  Hint: 4,
} as const;

// Code action kinds
const CodeActionKind = {
  QuickFix: "quickfix",
  Source: "source",
} as const;

/**
 * Agent LSP Server class
 *
 * Implements LSP protocol over JSON-RPC via stdio.
 */
export class AgentLSPServer {
  private config: LSPServerConfig;

  // Agent state cache
  private workers: DroneStatus[] = [];
  private tasks: TaskStatus[] = [];
  private conversationSummary = "";
  private keyFacts: string[] = [];
  private plan = "";

  // Document tracking
  private openDocuments = new Map<string, { version: number; content: string }>();

  private refreshInterval?: ReturnType<typeof setInterval>;
  private messageBuffer = "";

  // TCP mode support
  private tcpSocket?: import("net").Socket;
  private tcpMessageBuffer = "";

  constructor(config?: Partial<LSPServerConfig>) {
    this.config = {
      enableDiagnostics: config?.enableDiagnostics ?? true,
      diagnosticRefreshInterval: config?.diagnosticRefreshInterval ?? 5000,
      enableCodeActions: config?.enableCodeActions ?? true,
      enableHover: config?.enableHover ?? true,
      port: config?.port,
      personasUrl: config?.personasUrl,
    };
  }

  /**
   * Send a JSON-RPC message
   */
  private send(message: LSPMessage, socket?: import("net").Socket): void {
    const json = JSON.stringify(message);
    const content = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;
    if (socket) {
      socket.write(content);
    } else if (this.tcpSocket) {
      this.tcpSocket.write(content);
    } else {
      process.stdout.write(content);
    }
  }

  /**
   * Send a response
   */
  private respond(id: number | string, result: unknown): void {
    this.send({ jsonrpc: "2.0", id, result });
  }

  /**
   * Send an error response
   */
  private respondError(id: number | string, code: number, message: string): void {
    this.send({ jsonrpc: "2.0", id, error: { code, message } });
  }

  /**
   * Send a notification
   */
  private notify(method: string, params: unknown): void {
    this.send({ jsonrpc: "2.0", method, params });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(message: LSPMessage): void {
    const { method, id, params } = message;

    if (!method) return;

    switch (method) {
      case "initialize":
        this.handleInitialize(id!, params);
        break;
      case "initialized":
        this.handleInitialized();
        break;
      case "shutdown":
        this.respond(id!, null);
        break;
      case "exit":
        process.exit(0);
        break;
      case "textDocument/didOpen":
        this.handleDidOpen(params as { textDocument: { uri: string; version: number; text: string } });
        break;
      case "textDocument/didChange":
        this.handleDidChange(params as { textDocument: { uri: string; version: number }; contentChanges: Array<{ text: string }> });
        break;
      case "textDocument/didClose":
        this.handleDidClose(params as { textDocument: { uri: string } });
        break;
      case "textDocument/codeAction":
        this.respond(id!, this.handleCodeAction(params as { textDocument: { uri: string }; range: Range }));
        break;
      case "textDocument/hover":
        this.respond(id!, this.handleHover(params as { textDocument: { uri: string }; position: Position }));
        break;
      case "textDocument/completion":
        this.respond(id!, this.handleCompletion(params as { textDocument: { uri: string }; position: Position }));
        break;
      case "workspace/executeCommand":
        this.handleExecuteCommand(id!, params as { command: string; arguments?: unknown[] });
        break;
      case "agent/stateUpdate":
        this.handleStateUpdate(params as { workers: DroneStatus[]; tasks: TaskStatus[]; conversationSummary?: string; keyFacts?: string[]; plan?: string });
        break;
      default:
        if (id !== undefined) {
          this.respondError(id, -32601, `Method not found: ${method}`);
        }
    }
  }

  /**
   * Handle initialize request
   */
  private handleInitialize(id: number | string, _params: unknown): void {
    this.respond(id, {
      capabilities: {
        textDocumentSync: 1, // Full sync
        codeActionProvider: this.config.enableCodeActions ? { codeActionKinds: [CodeActionKind.QuickFix, CodeActionKind.Source] } : undefined,
        hoverProvider: this.config.enableHover,
        executeCommandProvider: { commands: ["agent.spawnDrone", "agent.killDrone", "agent.searchMemory", "agent.showStatus"] },
        completionProvider: {
          triggerCharacters: ["@", "/"],
          resolveProvider: false,
        },
      },
      serverInfo: { name: "agent-core-lsp", version: "1.0.0" },
    });
  }

  /**
   * Handle initialized notification
   */
  private handleInitialized(): void {
    this.log("Agent LSP server initialized");
    if (this.config.enableDiagnostics) {
      this.startDiagnosticRefresh();
    }
    
    // Start polling daemon for state
    this.startDaemonPolling();
  }

  /**
   * Poll daemon for state updates
   */
  private startDaemonPolling(): void {
    console.error("Starting daemon polling loop...");
    setInterval(async () => {
      try {
        const status = await requestDaemon<{
          workers: DroneStatus[];
          tasks: TaskStatus[];
        }>("status", {}, { timeoutMs: 500 });
        
        if (status) {
          console.error(`Polled Daemon: ${status.workers.length} workers`);
          this.updateState({
            workers: status.workers,
            tasks: status.tasks
          });
        } else {
          console.error("Polled Daemon: null status");
        }
      } catch (error) {
        // Log error to stderr for debugging
        console.error("Daemon polling error:", error);
      }
    }, 1000);
  }

  /**
   * Handle document open
   */
  private handleDidOpen(params: { textDocument: { uri: string; version: number; text: string } }): void {
    this.openDocuments.set(params.textDocument.uri, {
      version: params.textDocument.version,
      content: params.textDocument.text,
    });
    this.publishDiagnostics(params.textDocument.uri);
  }

  /**
   * Handle document change
   */
  private handleDidChange(params: { textDocument: { uri: string; version: number }; contentChanges: Array<{ text: string }> }): void {
    const doc = this.openDocuments.get(params.textDocument.uri);
    if (doc && params.contentChanges.length > 0) {
      doc.version = params.textDocument.version;
      doc.content = params.contentChanges[params.contentChanges.length - 1].text;
    }
    this.publishDiagnostics(params.textDocument.uri);
  }

  /**
   * Handle document close
   */
  private handleDidClose(params: { textDocument: { uri: string } }): void {
    this.openDocuments.delete(params.textDocument.uri);
  }

  /**
   * Handle state update notification
   */
  private handleStateUpdate(params: { workers: DroneStatus[]; tasks: TaskStatus[]; conversationSummary?: string; keyFacts?: string[]; plan?: string }): void {
    this.workers = params.workers;
    this.tasks = params.tasks;
    this.conversationSummary = params.conversationSummary ?? "";
    this.keyFacts = params.keyFacts ?? [];
    this.plan = params.plan ?? "";

    // Refresh diagnostics for all open documents
    for (const uri of this.openDocuments.keys()) {
      this.publishDiagnostics(uri);
    }
  }

  /**
   * Handle execute command
   */
  private handleExecuteCommand(id: number | string, params: { command: string; arguments?: unknown[] }): void {
    this.log(`Execute command: ${params.command}`);
    switch (params.command) {
      case "agent.spawnDrone":
        this.respond(id, { success: true, message: "Drone spawn requested" });
        break;
      case "agent.killDrone":
        this.respond(id, { success: true, message: "Drone kill requested" });
        break;
      case "agent.searchMemory":
        this.respond(id, { results: [], message: "Memory search not yet connected" });
        break;
      default:
        this.respondError(id, -32601, `Unknown command: ${params.command}`);
    }
  }

  /**
   * Log message to client
   */
  private log(message: string): void {
    this.notify("window/logMessage", { type: 3, message });
  }

  /**
   * Start periodic diagnostic refresh
   */
  private startDiagnosticRefresh(): void {
    this.refreshInterval = setInterval(() => {
      for (const uri of this.openDocuments.keys()) {
        this.publishDiagnostics(uri);
      }
    }, this.config.diagnosticRefreshInterval);
  }

  /**
   * Publish diagnostics for a document
   */
  private publishDiagnostics(uri: string): void {
    const diagnostics: Diagnostic[] = [];

    // Add drone status diagnostics
    for (const worker of this.workers) {
      // Show all workers (queens and drones) in diagnostics
      // Error -> Error
      // Working -> Information
      // Spawning/Reporting -> Hint
      // Idle -> Hint (only for Queen to show presence)
      
      let severity = DiagnosticSeverity.Hint;
      if (worker.status === "error") severity = DiagnosticSeverity.Error;
      else if (worker.status === "working") severity = DiagnosticSeverity.Information;
      else if (worker.status === "terminated") continue;
      
      // Skip idle drones (they usually disappear or are boring), but keep idle Queens
      if (worker.status === "idle" && worker.role !== "queen") continue;

      diagnostics.push({
        severity,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        message: `[${worker.persona}] ${worker.role}: ${worker.status}${worker.currentTask ? ` - ${worker.currentTask}` : ""}`,
        source: "agent-core",
        data: { type: "drone", id: worker.id, status: worker.status, persona: worker.persona },
      });
    }

    // Add pending task diagnostics
    const pendingTasks = this.tasks.filter((t) => t.status === "pending" || t.status === "running");
    for (const task of pendingTasks.slice(0, 3)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Hint,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        message: `[Task] ${task.status}: ${task.description.slice(0, 50)}`,
        source: "agent-core",
        data: { type: "task", id: task.id, status: task.status, persona: task.persona },
      });
    }

    this.notify("textDocument/publishDiagnostics", { uri, diagnostics });
  }

  /**
   * Handle code action requests
   */
  private handleCodeAction(params: { textDocument: { uri: string }; range: Range }): unknown[] {
    const actions: unknown[] = [];

    // Spawn drone actions
    for (const persona of ["zee", "stanley", "johny"] as const) {
      actions.push({
        title: `Spawn ${persona} drone for selected code`,
        kind: CodeActionKind.Source,
        command: { title: `Spawn ${persona} drone`, command: "agent.spawnDrone", arguments: [{ persona, uri: params.textDocument.uri, range: params.range }] },
      });
    }

    // Kill drone actions
    for (const drone of this.workers.filter((w) => w.status === "working" || w.status === "spawning")) {
      actions.push({
        title: `Kill ${drone.persona} drone (${drone.id.slice(-6)})`,
        kind: CodeActionKind.QuickFix,
        command: { title: "Kill drone", command: "agent.killDrone", arguments: [{ workerId: drone.id }] },
      });
    }

    actions.push({
      title: "Search agent memory",
      kind: CodeActionKind.Source,
      command: { title: "Search memory", command: "agent.searchMemory", arguments: [{ uri: params.textDocument.uri, range: params.range }] },
    });

    return actions;
  }

  /**
   * Handle hover requests
   */
  private handleHover(params: { textDocument: { uri: string }; position: Position }): unknown | null {
    if (params.position.line === 0) {
      const parts: string[] = ["## Agent Core State\n"];

      if (this.workers.length > 0) {
        parts.push("### Active Workers");
        for (const w of this.workers) {
          const icon = w.status === "working" ? "🔄" : w.status === "error" ? "❌" : w.status === "idle" ? "💤" : "⏳";
          parts.push(`- ${icon} **${w.persona}** (${w.role}): ${w.status}${w.currentTask ? ` - ${w.currentTask}` : ""}`);
        }
        parts.push("");
      }

      const activeTasks = this.tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
      if (activeTasks.length > 0) {
        parts.push("### Active Tasks");
        for (const t of activeTasks.slice(0, 5)) {
          const icon = t.status === "running" ? "▶️" : t.status === "pending" ? "⏸️" : "❓";
          parts.push(`- ${icon} [${t.persona}] ${t.description.slice(0, 40)}`);
        }
        parts.push("");
      }

      if (this.plan) {
        parts.push("### Current Plan");
        parts.push(this.plan.slice(0, 200) + (this.plan.length > 200 ? "..." : ""));
        parts.push("");
      }

      if (this.keyFacts.length > 0) {
        parts.push("### Key Facts");
        for (const fact of this.keyFacts.slice(0, 5)) {
          parts.push(`- ${fact}`);
        }
      }

      if (parts.length > 1) {
        return { contents: { kind: "markdown", value: parts.join("\n") } };
      }
    }
    return null;
  }

  /**
   * Handle completion requests
   * Provides @ mentions for personas and / commands for agent actions
   */
  private handleCompletion(params: { textDocument: { uri: string }; position: Position }): unknown {
    const doc = this.openDocuments.get(params.textDocument.uri);
    if (!doc) return { isIncomplete: false, items: [] };

    const lines = doc.content.split("\n");
    const line = lines[params.position.line] || "";
    const prefix = line.slice(0, params.position.character);

    const items: unknown[] = [];

    // @ mentions for personas
    if (prefix.endsWith("@") || /@\w*$/.test(prefix)) {
      for (const persona of ["zee", "stanley", "johny"] as const) {
        const icons: Record<string, string> = { zee: "🧠", stanley: "📈", johny: "📚" };
        const descriptions: Record<string, string> = {
          zee: "Personal assistant - memory, messaging, calendar",
          stanley: "Investing assistant - market analysis, portfolio",
          johny: "Study assistant - learning, practice, spaced repetition",
        };
        items.push({
          label: `@${persona}`,
          kind: 15, // Snippet
          detail: descriptions[persona],
          insertText: `@${persona} `,
          documentation: { kind: "markdown", value: `${icons[persona]} **${persona}**\n\n${descriptions[persona]}` },
        });
      }
    }

    // / commands for agent actions
    if (prefix.endsWith("/") || /\/\w*$/.test(prefix)) {
      const commands = [
        { cmd: "/spawn", desc: "Spawn a new drone", insert: "/spawn ${1|zee,stanley,johny|} ${2:task}" },
        { cmd: "/kill", desc: "Kill a running drone", insert: "/kill ${1:drone_id}" },
        { cmd: "/status", desc: "Show agent status", insert: "/status" },
        { cmd: "/memory", desc: "Search agent memory", insert: "/memory ${1:query}" },
        { cmd: "/plan", desc: "Set or show current plan", insert: "/plan ${1:description}" },
        { cmd: "/workers", desc: "List active workers", insert: "/workers" },
        { cmd: "/tasks", desc: "List pending tasks", insert: "/tasks" },
      ];

      for (const { cmd, desc, insert } of commands) {
        items.push({
          label: cmd,
          kind: 1, // Text
          detail: desc,
          insertText: insert,
          insertTextFormat: 2, // Snippet format
        });
      }
    }

    return { isIncomplete: false, items };
  }

  /**
   * Send progress notification to client
   * Used to show drone/task progress in the editor
   */
  sendProgress(token: string | number, value: { kind: "begin" | "report" | "end"; title?: string; message?: string; percentage?: number }): void {
    this.notify("$/progress", { token, value });
  }

  /**
   * Start a progress indicator for a task
   */
  beginTaskProgress(taskId: string, title: string): void {
    this.sendProgress(taskId, { kind: "begin", title, percentage: 0 });
  }

  /**
   * Update progress for a task
   */
  updateTaskProgress(taskId: string, message: string, percentage: number): void {
    this.sendProgress(taskId, { kind: "report", message, percentage: Math.min(100, Math.max(0, percentage)) });
  }

  /**
   * End progress for a task
   */
  endTaskProgress(taskId: string, message?: string): void {
    this.sendProgress(taskId, { kind: "end", message });
  }

  /**
   * Update agent state (called externally)
   */
  updateState(state: { workers?: DroneStatus[]; tasks?: TaskStatus[]; conversationSummary?: string; keyFacts?: string[]; plan?: string }): void {
    if (state.workers) this.workers = state.workers;
    if (state.tasks) this.tasks = state.tasks;
    if (state.conversationSummary !== undefined) this.conversationSummary = state.conversationSummary;
    if (state.keyFacts) this.keyFacts = state.keyFacts;
    if (state.plan !== undefined) this.plan = state.plan;

    for (const uri of this.openDocuments.keys()) {
      this.publishDiagnostics(uri);
    }
  }

  /**
   * Parse incoming data for LSP messages
   */
  private parseInput(data: string): void {
    this.messageBuffer += data;

    while (true) {
      const headerEnd = this.messageBuffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;

      const header = this.messageBuffer.slice(0, headerEnd);
      const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!contentLengthMatch) {
        this.messageBuffer = this.messageBuffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(contentLengthMatch[1], 10);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;

      if (this.messageBuffer.length < messageEnd) break;

      const content = this.messageBuffer.slice(messageStart, messageEnd);
      this.messageBuffer = this.messageBuffer.slice(messageEnd);

      try {
        const message = JSON.parse(content) as LSPMessage;
        this.handleMessage(message);
      } catch {
        // Invalid JSON, skip
      }
    }
  }

  /**
   * Start the LSP server
   */
  start(): void {
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (data) => this.parseInput(data.toString()));
    process.stdin.on("end", () => process.exit(0));
  }

  /**
   * Stop the LSP server
   */
  stop(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  /**
   * Handle TCP data from daemon
   * This is called by the daemon when data arrives on a TCP socket
   */
  handleTcpData(data: string, socket: import("net").Socket): void {
    this.tcpSocket = socket;
    this.tcpMessageBuffer += data;

    while (true) {
      const headerEnd = this.tcpMessageBuffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;

      const header = this.tcpMessageBuffer.slice(0, headerEnd);
      const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!contentLengthMatch) {
        this.tcpMessageBuffer = this.tcpMessageBuffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(contentLengthMatch[1], 10);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;

      if (this.tcpMessageBuffer.length < messageEnd) break;

      const content = this.tcpMessageBuffer.slice(messageStart, messageEnd);
      this.tcpMessageBuffer = this.tcpMessageBuffer.slice(messageEnd);

      try {
        const message = JSON.parse(content) as LSPMessage;
        this.handleMessage(message);
      } catch {
        // Invalid JSON, skip
      }
    }
  }
}

/**
 * Create and start the LSP server
 */
export function createAgentLSPServer(
  config?: Partial<LSPServerConfig>
): AgentLSPServer {
  return new AgentLSPServer(config);
}

// If run directly, start the server
if (require.main === module) {
  const server = createAgentLSPServer();
  server.start();
}
