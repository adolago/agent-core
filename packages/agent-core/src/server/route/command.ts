import { describeRoute, resolver } from "hono-openapi"
import { Hono } from "hono"
import { z } from "zod"
import { Command } from "../../command/command"

export const CommandRoute = new Hono().get(
  "/",
  describeRoute({
    summary: "List commands",
    description: "Get a list of all available commands in the OpenCode system.",
    operationId: "command.list",
    responses: {
      200: {
        description: "List of commands",
        content: {
          "application/json": {
            schema: resolver(
              z.array(
                z.object({
                  id: z.string(),
                  description: z.string(),
                  usage: z.string(),
                  examples: z.array(z.string()),
                }),
              ),
            ),
          },
        },
      },
    },
  }),
  async (c) => {
    return c.json(Command.help())
  },
)
