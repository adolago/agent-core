// Flags for agent-core (personal use configuration)
// Most features are hardcoded ON/OFF - only essential config is exposed

function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

function number(key: string) {
  const value = process.env[key]
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function computeFlags() {
  return {
    // ═══════════════════════════════════════════════════════════════════════
    // ESSENTIAL CONFIG (user can set via environment)
    // ═══════════════════════════════════════════════════════════════════════

    // Config paths
    OPENCODE_CONFIG: process.env["OPENCODE_CONFIG"],
    OPENCODE_CONFIG_DIR: process.env["OPENCODE_CONFIG_DIR"],
    OPENCODE_CONFIG_CONTENT: process.env["OPENCODE_CONFIG_CONTENT"],
    OPENCODE_GIT_BASH_PATH: process.env["OPENCODE_GIT_BASH_PATH"], // Windows

    // Permission override
    OPENCODE_PERMISSION: process.env["OPENCODE_PERMISSION"],

    // Auth (disabled by default, enable with AGENT_CORE_ENABLE_SERVER_AUTH=1)
    AGENT_CORE_SERVER_PASSWORD: process.env["AGENT_CORE_SERVER_PASSWORD"],
    AGENT_CORE_SERVER_USERNAME: process.env["AGENT_CORE_SERVER_USERNAME"],
    AGENT_CORE_ENABLE_SERVER_AUTH: truthy("AGENT_CORE_ENABLE_SERVER_AUTH"),
    OPENCODE_SERVER_PASSWORD: process.env["OPENCODE_SERVER_PASSWORD"], // Legacy
    OPENCODE_SERVER_USERNAME: process.env["OPENCODE_SERVER_USERNAME"], // Legacy
    OPENCODE_ENABLE_SERVER_AUTH: truthy("OPENCODE_ENABLE_SERVER_AUTH"), // Legacy
    AGENT_CORE_DISABLE_SERVER_AUTH: truthy("AGENT_CORE_DISABLE_SERVER_AUTH"),
    OPENCODE_DISABLE_SERVER_AUTH: truthy("OPENCODE_DISABLE_SERVER_AUTH"),

    // Tuning (optional overrides)
    OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS: number("OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"),
    OPENCODE_EXPERIMENTAL_LLM_STREAM_START_TIMEOUT_MS: number("OPENCODE_EXPERIMENTAL_LLM_STREAM_START_TIMEOUT_MS"),
    OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX: number("OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX"),
    OPENCODE_EXPERIMENTAL_BASH_MAX_OUTPUT_LENGTH: number("OPENCODE_EXPERIMENTAL_BASH_MAX_OUTPUT_LENGTH"),

    // Stream health monitoring thresholds
    AGENT_CORE_STREAM_STALL_WARNING_MS: number("AGENT_CORE_STREAM_STALL_WARNING_MS"),
    AGENT_CORE_STREAM_STALL_TIMEOUT_MS: number("AGENT_CORE_STREAM_STALL_TIMEOUT_MS"),
    AGENT_CORE_STREAM_DIAGNOSTICS: !truthy("AGENT_CORE_STREAM_DIAGNOSTICS_DISABLE"),

    // Client identifier
    OPENCODE_CLIENT: process.env["OPENCODE_CLIENT"] ?? "cli",

    // Testing
    OPENCODE_FAKE_VCS: process.env["OPENCODE_FAKE_VCS"],

    // ═══════════════════════════════════════════════════════════════════════
    // HARDCODED (personal use defaults, not configurable)
    // ═══════════════════════════════════════════════════════════════════════

    // Disabled features
    OPENCODE_AUTO_SHARE: false,              // No cloud sync
    OPENCODE_DISABLE_AUTOUPDATE: true,       // Manual updates via nightly
    OPENCODE_DISABLE_PRUNE: true,            // Keep all sessions
    OPENCODE_DISABLE_MODELS_FETCH: true,     // Use bundled models
    OPENCODE_DISABLE_TERMINAL_TITLE: false,
    OPENCODE_DISABLE_AUTOCOMPACT: false,     // Allow autocompact

    // Enabled features
    OPENCODE_DISABLE_DEFAULT_PLUGINS: false, // Load default plugins
    OPENCODE_DISABLE_LSP_DOWNLOAD: false,    // Download LSP servers
    OPENCODE_ENABLE_EXPERIMENTAL_MODELS: true,
    OPENCODE_DISABLE_CLAUDE_CODE: false,
    OPENCODE_DISABLE_CLAUDE_CODE_PROMPT: false,
    OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: false,

    // All experimental features ON
    OPENCODE_EXPERIMENTAL: true,
    OPENCODE_EXPERIMENTAL_FILEWATCHER: true,
    OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: false,
    OPENCODE_EXPERIMENTAL_ICON_DISCOVERY: true,
    OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT: false,
    OPENCODE_ENABLE_EXA: true,
    OPENCODE_EXPERIMENTAL_OXFMT: true,
    OPENCODE_EXPERIMENTAL_LSP_TY: true,
    OPENCODE_EXPERIMENTAL_LSP_TOOL: true,
    OPENCODE_EXPERIMENTAL_PLAN_MODE: true,
  }
}

export const Flag = computeFlags()

export function reloadFlags() {
  Object.assign(Flag, computeFlags())
}

