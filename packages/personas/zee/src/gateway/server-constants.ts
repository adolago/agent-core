export const MAX_PAYLOAD_BYTES = 512 * 1024; // cap incoming frame size
export const MAX_BUFFERED_BYTES = 1.5 * 1024 * 1024; // per-connection send buffer limit

export const MAX_CHAT_HISTORY_MESSAGES_BYTES = 6 * 1024 * 1024; // keep history responses comfortably under client WS limits
export const HANDSHAKE_TIMEOUT_MS = 10_000;
export const TICK_INTERVAL_MS = 30_000;
export const PING_INTERVAL_MS = 30_000; // WebSocket-level ping/pong keepalive
export const HEALTH_REFRESH_INTERVAL_MS = 60_000;
export const DEDUPE_TTL_MS = 5 * 60_000;
export const DEDUPE_MAX = 1000;

// Request handling timeouts (for reliability)
export const REQUEST_TIMEOUT_MS = 5 * 60_000; // 5 minutes for long-running agent requests
export const PROVIDER_SHUTDOWN_TIMEOUT_MS = 10_000; // 10 seconds per provider during shutdown
export const ABORT_TASK_TIMEOUT_MS = 5_000; // 5 seconds to wait for task abort
