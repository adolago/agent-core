import { expect, test } from "bun:test"

import { data } from "../../src/provider/models-macro"

test("models.dev base URL can be overridden via env", async () => {
  const originalModelsDevApiJson = process.env.MODELS_DEV_API_JSON
  const originalModelsUrl = process.env.AGENT_CORE_MODELS_URL
  const originalFetch = globalThis.fetch

  // Force the fetch path (no local JSON override).
  delete process.env.MODELS_DEV_API_JSON
  process.env.AGENT_CORE_MODELS_URL = "https://example.invalid"

  const requests: string[] = []
  const mockFetch: typeof fetch = (async (input: any, init: any) => {
    requests.push(String(input))
    // Ensure callers can use .text() / .json() interchangeably.
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }) as any
  // Bun's fetch has extra properties (e.g. fetch.preconnect); preserve them for typing.
  ;(mockFetch as any).preconnect = (originalFetch as any).preconnect
  globalThis.fetch = mockFetch

  try {
    await data()
    expect(requests).toEqual(["https://example.invalid/api.json"])
  } finally {
    // Restore env + fetch to avoid cross-test pollution.
    if (originalModelsDevApiJson === undefined) delete process.env.MODELS_DEV_API_JSON
    else process.env.MODELS_DEV_API_JSON = originalModelsDevApiJson
    if (originalModelsUrl === undefined) delete process.env.AGENT_CORE_MODELS_URL
    else process.env.AGENT_CORE_MODELS_URL = originalModelsUrl
    globalThis.fetch = originalFetch
  }
})
