import { describeRoute, resolver, validator } from "hono-openapi"
import { Hono } from "hono"
import { z } from "zod"
import { Auth } from "../../config/auth"
import { errors } from "../error"

export const AuthRoute = new Hono()
  .put(
    "/:providerID",
    describeRoute({
      summary: "Set auth credentials",
      description: "Set authentication credentials",
      operationId: "auth.set",
      responses: {
        200: {
          description: "Successfully set authentication credentials",
          content: {
            "application/json": {
              schema: resolver(z.boolean()),
            },
          },
        },
        ...errors(400),
      },
    }),
    validator(
      "param",
      z.object({
        providerID: z.string(),
      }),
    ),
    validator(
      "json",
      z.object({
        api_key: z.string().optional(),
      }),
    ),
    async (c) => {
      const providerID = c.req.valid("param").providerID
      const body = c.req.valid("json")
      await Auth.set(providerID, body)
      return c.json(true)
    },
  )
  .delete(
    "/:providerID",
    describeRoute({
      summary: "Remove auth credentials",
      description: "Remove authentication credentials",
      operationId: "auth.remove",
      responses: {
        200: {
          description: "Successfully removed authentication credentials",
          content: {
            "application/json": {
              schema: resolver(z.boolean()),
            },
          },
        },
        ...errors(400, 404),
      },
    }),
    validator(
      "param",
      z.object({
        providerID: z.string(),
      }),
    ),
    async (c) => {
      const providerID = c.req.valid("param").providerID
      await Auth.remove(providerID)
      return c.json(true)
    },
  )
