import { describe, expect, test } from "bun:test"

describe("canvas tool plugin", () => {
  test("renders inline when WezTerm integration disabled", async () => {
    const prev = process.env.AGENT_CORE_CANVAS_WEZTERM
    process.env.AGENT_CORE_CANVAS_WEZTERM = "0"
    try {
      const mod = await import("../../../../.agent-core/tool/canvas.ts")
      const output = await mod.canvasSpawn.execute({
        kind: "text",
        id: "poem",
        config: JSON.stringify({ title: "Poem", content: "Hello canvas" }),
      } as any, {} as any)

      expect(output).toContain("=== Poem ===")
      expect(output).toContain("Hello canvas")
      expect(output).toContain("Content displayed inline")
    } finally {
      if (prev === undefined) {
        delete process.env.AGENT_CORE_CANVAS_WEZTERM
      } else {
        process.env.AGENT_CORE_CANVAS_WEZTERM = prev
      }
    }
  })
})
