
import { Type } from "@sinclair/typebox";
import type { AgentTool } from "../../mcp/types";
import { requestDaemon } from "../../daemon/ipc-client";

interface DroneResult {
  workerId: string;
  success: boolean;
  result?: string;
  error?: string;
}

export function createZeeCodexBarTool(): AgentTool {
  return {
    name: "zee_codexbar",
    description: "Manage the CodexBar UI state via Zee. CodexBar is a persistent status bar and notification center.",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("set_status"),
        Type.Literal("notify"),
        Type.Literal("clear_status")
      ]),
      text: Type.Optional(Type.String({ description: "Status text or notification message" })),
      type: Type.Optional(Type.Union([
        Type.Literal("info"),
        Type.Literal("success"),
        Type.Literal("warning"),
        Type.Literal("error")
      ])),
      duration: Type.Optional(Type.Number({ description: "Duration in ms (for notifications)" }))
    }),
    execute: async (args) => {
      const prompt = `CODEXBAR ACTION REQUEST:
Action: ${args.action}
Text: ${args.text}
Type: ${args.type || "info"}
Duration: ${args.duration}

Please execute this using your internal CodexBar tool.`;

      try {
        const result = await requestDaemon<DroneResult>("spawn_drone_with_wait", {
          persona: "zee",
          task: `CodexBar action: ${args.action}`,
          prompt,
          timeoutMs: 30000
        });

        if (result.success) {
          return {
            content: [{ type: "text", text: result.result || "CodexBar updated" }]
          };
        }
        return {
          content: [{ type: "text", text: `CodexBar Error: ${result.error}` }],
          isError: true
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Delegation failed: ${String(err)}` }],
          isError: true
        };
      }
    }
  };
}
