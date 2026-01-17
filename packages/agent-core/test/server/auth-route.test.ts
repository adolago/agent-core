import { describe, expect, test, mock } from "bun:test"
import { Auth } from "../../src/auth"

mock.module("../../src/provider/provider", () => ({
  Provider: {
    reload: async () => {},
    validateAuth: async () => {},
  },
}))

const { AuthRoute } = await import("../../src/server/route/auth")

describe("auth.set endpoint", () => {
  test("accepts Auth.Info payload and updates credentials at runtime", async () => {
    const response = await AuthRoute.request("/cerebras", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "api",
        key: "test-key",
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toBe(true)

    const stored = await Auth.get("cerebras")
    expect(stored?.type).toBe("api")
    expect(stored && "key" in stored ? stored.key : undefined).toBe("test-key")
  })

  test("accepts legacy api_key payload", async () => {
    const response = await AuthRoute.request("/cerebras", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: "legacy-key",
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toBe(true)

    const stored = await Auth.get("cerebras")
    expect(stored?.type).toBe("api")
    expect(stored && "key" in stored ? stored.key : undefined).toBe("legacy-key")
  })
})

