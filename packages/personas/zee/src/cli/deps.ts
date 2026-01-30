import { logWebSelfId, sendMessageWhatsApp } from "../channels/web/index.js";
import type { OutboundSendDeps } from "../infra/outbound/deliver.js";
import { sendMessageTelegram } from "../telegram/send.js";

export type CliDeps = {
  sendMessageWhatsApp: typeof sendMessageWhatsApp;
  sendMessageTelegram: typeof sendMessageTelegram;
};

export function createDefaultDeps(): CliDeps {
  return {
    sendMessageWhatsApp,
    sendMessageTelegram,
  };
}

// Provider docking: extend this mapping when adding new outbound send deps.
export function createOutboundSendDeps(deps: CliDeps): OutboundSendDeps {
  return {
    sendWhatsApp: deps.sendMessageWhatsApp,
    sendTelegram: deps.sendMessageTelegram,
  };
}

export { logWebSelfId };
