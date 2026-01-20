import { afterAll, describe, expect, test } from "bun:test"
import { ModelsDev } from "../../src/provider/models"
import { Provider } from "../../src/provider/provider"
import { ProviderAuth } from "../../src/provider/auth"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

const originalModelsGet = ModelsDev.get
const originalModelsRefresh = ModelsDev.refresh
const originalProviderList = Provider.list
const originalAuthMethods = ProviderAuth.methods

ModelsDev.get = async () => ({
  inworld: {
    id: "inworld",
    name: "Inworld AI",
    env: [],
    models: {},
  },
})
ModelsDev.refresh = async () => {}
Provider.list = async () => ({})
ProviderAuth.methods = async () => ({})

afterAll(() => {
  ModelsDev.get = originalModelsGet
  ModelsDev.refresh = originalModelsRefresh
  Provider.list = originalProviderList
  ProviderAuth.methods = originalAuthMethods
})

const { ModelRoute } = await import("../../src/server/route/model")

describe("model route", () => {
  test("skips defaults for providers without models", async () => {
    await using tmp = await tmpdir({
      config: {
        $schema: "https://opencode.ai/config.json",
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const response = await ModelRoute.request("/provider")
        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.default.inworld).toBeUndefined()
      },
    })
  })
})
