import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { Server } from "../../src/server/server"

describe("Server Error Handling", () => {
  test("does not expose stack trace in response (security enhancement)", async () => {
    const app = Server.App()

    // Create a mock context
    const c = {
      json: (data: any, options: any) => ({ data, options }),
      req: {
        method: "GET",
        path: "/test",
      }
    } as any

    // Create a sensitive error
    const error = new Error("This is a sensitive error")
    error.stack = "Error: This is a sensitive error\n    at sensitiveFunction (file.ts:1:1)"

    // Manually invoke the error handler
    const result = await app.errorHandler(error, c) as any

    const body = result.data
    const status = result.options.status

    expect(status).toBe(500)
    expect(body.name).toBe("UnknownError")
    expect(body.data.message).toBe("This is a sensitive error") // Should be just the message
    expect(body.data.message).not.toContain("at sensitiveFunction")
  })
})
