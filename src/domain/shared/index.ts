import { registry } from "../../mcp/registry";
import { CANVAS_TOOLS } from "./canvas-tool";

export function registerSharedTools(): void {
  for (const tool of CANVAS_TOOLS) {
    registry.register(tool, { source: "domain" });
  }
}
