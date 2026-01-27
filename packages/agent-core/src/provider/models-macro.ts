export async function data() {
  const path = Bun.env.MODELS_DEV_API_JSON
  if (path) {
    const file = Bun.file(path)
    if (await file.exists()) {
      return await file.text()
    }
  }
  const modelsDevUrl = Bun.env.AGENT_CORE_MODELS_URL ?? Bun.env.OPENCODE_MODELS_URL ?? "https://models.dev"
  const json = await fetch(`${modelsDevUrl}/api.json`).then((x) => x.text())
  return json
}
