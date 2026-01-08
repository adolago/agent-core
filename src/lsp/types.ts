/**
 * Agent LSP Types
 *
 * Type definitions for the agent-core LSP server.
 * This server exposes agent state (drones, memory, continuity) to editors.
 */

import { z } from "zod";

/**
 * Agent state exposed via LSP
 */
export const AgentDiagnosticData = z.object({
  type: z.enum(["drone", "task", "memory", "continuity"]),
  id: z.string(),
  status: z.string(),
  persona: z.string().optional(),
  message: z.string(),
});
export type AgentDiagnosticData = z.infer<typeof AgentDiagnosticData>;

/**
 * Drone status for diagnostics
 */
export const DroneStatus = z.object({
  id: z.string(),
  persona: z.enum(["zee", "stanley", "johny"]),
  role: z.enum(["queen", "drone"]),
  status: z.enum(["spawning", "idle", "working", "reporting", "terminated", "error"]),
  currentTask: z.string().optional(),
  paneId: z.string().optional(),
  lastActivityAt: z.number(),
});
export type DroneStatus = z.infer<typeof DroneStatus>;

/**
 * Task status for diagnostics
 */
export const TaskStatus = z.object({
  id: z.string(),
  persona: z.enum(["zee", "stanley", "johny"]),
  description: z.string(),
  status: z.enum(["pending", "assigned", "running", "completed", "failed", "cancelled"]),
  workerId: z.string().optional(),
  createdAt: z.number(),
});
export type TaskStatus = z.infer<typeof TaskStatus>;

/**
 * Code action kinds for agent operations
 */
export const AgentCodeActionKind = {
  SpawnDrone: "agent.spawnDrone",
  KillDrone: "agent.killDrone",
  SubmitTask: "agent.submitTask",
  SearchMemory: "agent.searchMemory",
  RefreshState: "agent.refreshState",
} as const;

/**
 * Hover content types
 */
export const HoverContentType = z.enum([
  "agent_state",
  "drone_status",
  "task_status",
  "memory_context",
  "conversation_state",
]);
export type HoverContentType = z.infer<typeof HoverContentType>;

/**
 * LSP server configuration
 */
export const LSPServerConfig = z.object({
  /** Port for TCP connection (optional, uses stdio by default) */
  port: z.number().optional(),
  /** Enable diagnostics publishing */
  enableDiagnostics: z.boolean().default(true),
  /** Diagnostic refresh interval in ms */
  diagnosticRefreshInterval: z.number().default(5000),
  /** Enable code actions */
  enableCodeActions: z.boolean().default(true),
  /** Enable hover provider */
  enableHover: z.boolean().default(true),
  /** personas tiara connection */
  personasUrl: z.string().optional(),
});
export type LSPServerConfig = z.infer<typeof LSPServerConfig>;

/**
 * Message types for IPC with personas tiara
 */
export const PersonasMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("state_update"),
    workers: z.array(DroneStatus),
    tasks: z.array(TaskStatus),
  }),
  z.object({
    type: z.literal("spawn_drone"),
    persona: z.enum(["zee", "stanley", "johny"]),
    task: z.string(),
    prompt: z.string(),
  }),
  z.object({
    type: z.literal("kill_drone"),
    workerId: z.string(),
  }),
  z.object({
    type: z.literal("submit_task"),
    persona: z.enum(["zee", "stanley", "johny"]),
    description: z.string(),
    prompt: z.string(),
  }),
]);
export type PersonasMessage = z.infer<typeof PersonasMessage>;
