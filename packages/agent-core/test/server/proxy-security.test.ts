import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test"
import { Server } from "../../src/server/server"

describe("Proxy Security", () => {
  const originalEnv = process.env.AGENT_CORE_PROXY_BASE_URL

  beforeAll(() => {
    process.env.AGENT_CORE_PROXY_BASE_URL = "http://localhost:1234"
  })

  afterAll(() => {
    if (originalEnv) process.env.AGENT_CORE_PROXY_BASE_URL = originalEnv
    else delete process.env.AGENT_CORE_PROXY_BASE_URL
  })

  beforeEach(() => {
    Server.App.reset()
  })

  test("Prevents open proxy / SSRF via protocol-relative path", async () => {
    const app = Server.App()

    // Attempt to access example.com via the proxy
    // Using a path that starts with // which new URL() treats as protocol-relative
    const response = await app.request("//example.com", {
      method: "GET",
    })

    // Before fix: This would execute the request to example.com
    // After fix: Should return 403 Forbidden
    expect(response.status).toBe(403)
  })

  test("Allows normal proxy requests", async () => {
    const app = Server.App()

    // This should resolve to http://localhost:1234/api/test
    // Since we can't easily mock the upstream fetch in this integration test without more work,
    // we just check that it DOES NOT return 403 (Forbidden).
    // It will likely return 500 or 404 because localhost:1234 doesn't exist.
    const response = await app.request("/api/test", {
      method: "GET",
    })

    expect(response.status).not.toBe(403)
  })
})
