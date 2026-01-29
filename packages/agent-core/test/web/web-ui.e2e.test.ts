import { describe, expect, test, afterAll } from "bun:test"
import { Server } from "../../src/server/server"

const cwd = process.cwd()

function withServer() {
  const server = Server.listen({ hostname: "127.0.0.1", port: 0, mdns: false, cors: [] })
  const baseUrl = `http://${server.hostname}:${server.port}`
  return { server, baseUrl }
}

describe("web UI shell", () => {
  const { server, baseUrl } = withServer()

  afterAll(async () => {
    await server.stop()
  })

  test("serves web console shell", async () => {
    const response = await fetch(`${baseUrl}/`)
    const html = await response.text()
    expect(html).toContain("agent-core web console")
    expect(html).toContain("Sessions")
    expect(html).toContain("File tree")
    expect(html).toContain("Settings")
    expect(html).toContain("Provider auth")
  })

  test("share and unshare endpoints work for sessions", async () => {
    const created = await fetch(`${baseUrl}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-opencode-directory": cwd },
      body: JSON.stringify({}),
    })
    const session = await created.json()

    const shared = await fetch(`${baseUrl}/session/${session.id}/share`, {
      method: "POST",
      headers: { "x-opencode-directory": cwd },
    })
    const sharedSession = await shared.json()
    expect(sharedSession.share?.url).toBeTruthy()

    const unshared = await fetch(`${baseUrl}/session/${session.id}/share`, {
      method: "DELETE",
      headers: { "x-opencode-directory": cwd },
    })
    const unsharedSession = await unshared.json()
    expect(unsharedSession.share).toBeUndefined()
  })

  test("provider auth endpoints respond", async () => {
    const [providersRes, authRes, statusRes] = await Promise.all([
      fetch(`${baseUrl}/provider`),
      fetch(`${baseUrl}/provider/auth`),
      fetch(`${baseUrl}/provider/auth/status`),
    ])
    expect(providersRes.ok).toBe(true)
    expect(authRes.ok).toBe(true)
    expect(statusRes.ok).toBe(true)

    const providers = await providersRes.json()
    expect(Array.isArray(providers.all)).toBe(true)

    const methods = await authRes.json()
    expect(typeof methods).toBe("object")

    const status = await statusRes.json()
    expect(typeof status).toBe("object")
  })
})
