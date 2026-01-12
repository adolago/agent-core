import { BusEvent } from "@/bus/bus-event"
import { Log } from "../util/log"
import { describeRoute, generateSpecs, resolver, openAPIRouteHandler } from "hono-openapi"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { streamSSE } from "hono/streaming"
import { proxy } from "hono/proxy"
import z from "zod"
import { Provider } from "../provider/provider"
import { NamedError } from "@opencode-ai/util/error"
import { lazy } from "../util/lazy"
import { Storage } from "../storage/storage"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import { websocket } from "hono/bun"
import { Installation } from "@/installation"
import { MDNS } from "./mdns"
import { ServerState } from "./state"
import { Instance } from "../project/instance"

// Routes
import { ProjectRoute } from "./route/project"
import { QuestionRoute } from "./route/question"
import { GlobalRoute } from "./route/global"
import { PtyRoute } from "./route/pty"
import { ConfigRoute } from "./route/config"
import { InstanceRoute } from "./route/instance"
import { FilesystemRoute } from "./route/filesystem"
import { SessionRoute } from "./route/session"
import { PermissionRoute } from "./route/permission"
import { CommandRoute } from "./route/command"
import { ModelRoute } from "./route/model"
import { McpRoute } from "./route/mcp"
import { LspRoute } from "./route/lsp"
import { TuiRoute } from "./route/tui"
import { AuthRoute } from "./route/auth"
import { ToolRoute } from "./route/tool"

// Default API port for the daemon
const DEFAULT_API_PORT = 3210

// @ts-ignore This global is needed to prevent ai-sdk from logging warnings to stdout
globalThis.AI_SDK_LOG_WARNINGS = false

export namespace Server {
  const log = Log.create({ service: "server" })

  let _corsWhitelist: string[] = []

  export function url(): URL {
    return ServerState.url()
  }

  export const Event = {
    Connected: BusEvent.define("server.connected", z.object({})),
    Disposed: BusEvent.define("global.disposed", z.object({})),
  }

  const app = new Hono()
  export const App: () => Hono = lazy(
    () =>
      app
        .onError((err, c) => {
          log.error("failed", {
            error: err,
          })
          if (err instanceof NamedError) {
            let status: ContentfulStatusCode
            if (err instanceof Storage.NotFoundError) status = 404
            else if (err instanceof Provider.ModelNotFoundError) status = 400
            else if (err.name.startsWith("Worktree")) status = 400
            else status = 500
            return c.json(err.toObject(), { status })
          }
          const message = err instanceof Error && err.stack ? err.stack : err.toString()
          return c.json(new NamedError.Unknown({ message }).toObject(), {
            status: 500,
          })
        })
        .use(async (c, next) => {
          const skipLogging = c.req.path === "/log"
          if (!skipLogging) {
            log.info("request", {
              method: c.req.method,
              path: c.req.path,
            })
          }
          const timer = log.time("request", {
            method: c.req.method,
            path: c.req.path,
          })
          await next()
          if (!skipLogging) {
            timer.stop()
          }
        })
        .use(
          cors({
            origin(input) {
              if (!input) return

              if (input.startsWith("http://localhost:")) return input
              if (input.startsWith("http://127.0.0.1:")) return input
              if (input === "tauri://localhost" || input === "http://tauri.localhost") return input

              // *.opencode.ai (https only, adjust if needed)
              if (/^https:\/\/([a-z0-9-]+\.)*opencode\.ai$/.test(input)) {
                return input
              }
              if (_corsWhitelist.includes(input)) {
                return input
              }

              return
            },
          }),
        )
        // Mount Global Route
        .route("/global", GlobalRoute)
        
        // Middleware to provide instance context
        .use(async (c, next) => {
          let directory = c.req.query("directory") || c.req.header("x-opencode-directory") || process.cwd()
          // If directory is relative, make it absolute ensuring it starts with /
          // This fixes an issue where ?directory=foo/bar was treating it as relative to CWD
          // but we want it relative to root if it starts with /
          // Actually, process.cwd() is absolute.
          // If user passes query dir, we assume it's the intended workspace.
          
          return Instance.provide({
            directory,
            fn: async () => {
              await next()
            },
          })
        })
        
        // Mount Routes
        .route("/pty", PtyRoute)
        .route("/", ConfigRoute)
        .route("/", InstanceRoute)
        .route("/", FilesystemRoute)
        .route("/", SessionRoute)
        .route("/permission", PermissionRoute)
        .route("/command", CommandRoute)
        .route("/", ModelRoute)
        .route("/mcp", McpRoute)
        .route("/", LspRoute)
        .route("/tui", TuiRoute)
        .route("/auth", AuthRoute)
        .route("/", ToolRoute) // /experimental/tool
        .route("/question", QuestionRoute)
        .route("/project", ProjectRoute)

        // API Documentation
        .get(
          "/openapi",
          describeRoute({
            summary: "Get OpenAPI specs",
            description: "Get the OpenAPI specifications for the API.",
            operationId: "openapi.specs",
            responses: {
              200: {
                description: "OpenAPI specs",
                content: {
                  "application/json": {
                    schema: resolver(z.any()),
                  },
                },
              },
            },
          }),
          async (c) => {
            return c.json(await openapi())
          },
        )

        
        // Proxy Fallback - MUST BE LAST
        .all("/*", async (c) => {
          const path = c.req.path
          const response = await proxy(`https://app.opencode.ai${path}`, {
            ...c.req,
            headers: {
              ...c.req.raw.headers,
              host: "app.opencode.ai",
            },
          })
          response.headers.set(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'",
          )
          return response
        }) as unknown as Hono,
  )

  export async function openapi() {
    // Cast to break excessive type recursion from long route chains
    const result = await generateSpecs(App() as Hono, {
      documentation: {
        info: {
          title: "opencode",
          version: "1.0.0",
          description: "opencode api",
        },
        openapi: "3.1.1",
      },
    })
    return result
  }

  export function listen(opts: { port: number; hostname: string; mdns?: boolean; cors?: string[] }) {
    _corsWhitelist = opts.cors ?? []

    const args = {
      hostname: opts.hostname,
      idleTimeout: 0,
      fetch: App().fetch,
      websocket: websocket,
    } as const
    const tryServe = (port: number) => {
      try {
        return Bun.serve({ ...args, port })
      } catch {
        return undefined
      }
    }
    const server = opts.port === 0 ? (tryServe(DEFAULT_API_PORT) ?? tryServe(0)) : tryServe(opts.port)
    if (!server) throw new Error(`Failed to start server on port ${opts.port}`)

    ServerState.setUrl(server.url)

    const shouldPublishMDNS =
      opts.mdns &&
      server.port &&
      opts.hostname !== "127.0.0.1" &&
      opts.hostname !== "localhost" &&
      opts.hostname !== "::1"
    if (shouldPublishMDNS) {
      MDNS.publish(server.port!, `agent-core-${server.port!}`)
    } else if (opts.mdns) {
      log.warn("mDNS enabled but hostname is loopback; skipping mDNS publish")
    }

    const originalStop = server.stop.bind(server)
    server.stop = async (closeActiveConnections?: boolean) => {
      if (shouldPublishMDNS) MDNS.unpublish()
      return originalStop(closeActiveConnections)
    }

    return server
  }
}
