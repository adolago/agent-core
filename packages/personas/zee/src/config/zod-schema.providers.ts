import { z } from "zod";

import { TelegramConfigSchema } from "./zod-schema.providers-core.js";
import { WhatsAppConfigSchema } from "./zod-schema.providers-whatsapp.js";
import { GroupPolicySchema } from "./zod-schema.core.js";
import { ChannelHeartbeatVisibilitySchema } from "./zod-schema.channels.js";

export * from "./zod-schema.providers-core.js";
export * from "./zod-schema.providers-whatsapp.js";
export { ChannelHeartbeatVisibilitySchema } from "./zod-schema.channels.js";

export const ChannelsSchema = z
  .object({
    defaults: z
      .object({
        groupPolicy: GroupPolicySchema.optional(),
        heartbeat: ChannelHeartbeatVisibilitySchema,
      })
      .strict()
      .optional(),
    whatsapp: WhatsAppConfigSchema.optional(),
    telegram: TelegramConfigSchema.optional(),
  })
  .passthrough() // Allow extension channel configs.
  .optional();
