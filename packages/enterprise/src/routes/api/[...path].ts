import type { APIEvent } from "@solidjs/start/server"
import { Hono } from "hono"
import { describeResponse, describeRoute, openAPIRouteHandler, resolver } from "hono-openapi"
import { validator } from "hono-openapi"
import z from "zod"
import { cors } from "hono/cors"

const app = new Hono()

app
  .basePath("/api")
  .use(cors())
  .get(
    "/doc",
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "Opencode Enterprise API",
          version: "1.0.0",
          description: "Opencode Enterprise API endpoints",
        },
        openapi: "3.1.1",
      },
    }),
  )
  .post(
    "/share",
    describeRoute({
      description: "Create a share",
      operationId: "share.create",
      responses: {
        200: {
          description: "Success",
          content: {
            "application/json": {
              schema: resolver(
                z
                  .object({
                    url: z.string(),
                    secret: z.string(),
                  })
                  .meta({ ref: "Share" }),
              ),
            },
          },
        },
      },
    }),
    validator("json", z.object({ sessionID: z.string() })),
    async (c) => {
      const body = c.req.valid("json")
      const secret: string = crypto.randomUUID()
      return c.json({
        secret,
        url: "/s/" + body.sessionID,
      })
    },
  )

export function GET(event: APIEvent) {
  return app.fetch(event.request)
}

export function POST(event: APIEvent) {
  return app.fetch(event.request)
}

export function PUT(event: APIEvent) {
  return app.fetch(event.request)
}

export async function DELETE(event: APIEvent) {
  return app.fetch(event.request)
}
