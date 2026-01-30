import { app } from "./app"
import { env } from "./env"

if (import.meta.main) {
  const server = Bun.serve({
    fetch: app.fetch,
    port: env.PORT,
    hostname: env.HOST,
  })
  console.log(`Hosted server running on http://${server.hostname}:${server.port}`)
}

export default app
