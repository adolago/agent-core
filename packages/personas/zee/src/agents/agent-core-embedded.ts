/**
 * Agent-core client exports.
 * Connects to agent-core daemon for AI processing.
 */
export type {
  AgentEvent,
  CompactSessionOptions,
  EmbeddedPiAgentMeta,
  EmbeddedPiAgentOptions,
  EmbeddedPiCompactResult,
  EmbeddedPiRunMeta,
  EmbeddedPiRunResult,
  MessagingToolSend,
  PersonaId,
  UsageInfo,
} from "./agent-core-client.js";

export {
  abortEmbeddedPiRun,
  compactEmbeddedPiSession,
  isEmbeddedPiRunActive,
  isEmbeddedPiRunStreaming,
  queueEmbeddedPiMessage,
  resolveEmbeddedSessionLane,
  runEmbeddedPiAgent,
  waitForEmbeddedPiRunEnd,
} from "./agent-core-client.js";
