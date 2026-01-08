
import { Type } from "@sinclair/typebox";
import type { AgentTool } from "../../mcp/types";
import { requestDaemon } from "../../daemon/ipc-client";

interface DroneResult {
  workerId: string;
  success: boolean;
  result?: string;
  error?: string;
}

export function createZeeBrowserTool(): AgentTool {
  return {
    name: "zee_browser",
    description: "Browse the web using Zee's headless browser. Use this for complex web interaction, scraping, or when 'webfetch' is insufficient.",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("navigate"),
        Type.Literal("screenshot"),
        Type.Literal("click"),
        Type.Literal("type"),
        Type.Literal("scrape")
      ]),
      url: Type.Optional(Type.String({ description: "URL to navigate to" })),
      selector: Type.Optional(Type.String({ description: "CSS selector for interaction" })),
      text: Type.Optional(Type.String({ description: "Text to type" }))
    }),
    execute: async (args) => {
      const prompt = `BROWSER TASK REQUEST:
Action: ${args.action}
URL: ${args.url}
Selector: ${args.selector}
Text: ${args.text}

Please use your internal browser tools to execute this and return the result.`;

      try {
        const result = await requestDaemon<DroneResult>("spawn_drone_with_wait", {
          persona: "zee",
          task: `Browser action: ${args.action} ${args.url || ""}`,
          prompt,
          timeoutMs: 60000
        });

        if (result.success) {
          return {
            content: [{ type: "text", text: result.result || "Action completed" }]
          };
        }
        return {
          content: [{ type: "text", text: `Zee Browser Error: ${result.error}` }],
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
