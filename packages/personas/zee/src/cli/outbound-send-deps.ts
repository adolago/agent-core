import type { OutboundSendDeps } from "../infra/outbound/deliver.js";

export type CliDeps = {
  sendMessageWhatsApp: NonNullable<OutboundSendDeps["sendWhatsApp"]>;
  sendMessageTelegram: NonNullable<OutboundSendDeps["sendTelegram"]>;
  sendMessageSignal: NonNullable<OutboundSendDeps["sendSignal"]>;
};

// Provider docking: extend this mapping when adding new outbound send deps.
export function createOutboundSendDeps(deps: CliDeps): OutboundSendDeps {
  return {
    sendWhatsApp: deps.sendMessageWhatsApp,
    sendTelegram: deps.sendMessageTelegram,
    sendSignal: deps.sendMessageSignal,
  };
}
