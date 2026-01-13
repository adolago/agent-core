# Deep Diagnostics Plan for Alpha Launch

## 1. Objective

To ensure the stability, recoverability, and observability of `agent-core` during the Alpha phase, enabling rapid identification and resolution of issues in diverse user environments.

## 2. Expanded Health Checks (`agent-core check`)

Transform the existing simple environment check into a comprehensive "Doctor" tool.

### 2.1 System Environment

- [ ] **Dependency Verification**: Check versions of `node`, `bun`, `git`, `docker` (if used) against minimum requirements.
- [ ] **Permission Audit**: Verify R/W access to:
  - `~/.agent-core` (Global config)
  - Current workspace/repository.
  - Temporary directories (`/tmp` or equivalent).
- [ ] **Resource Availability**:
  - Free disk space check (>1GB recommended for logs/cache).
  - Available memory check.

### 2.2 Connectivity & Providers

- [ ] **Provider Latency Test**: Measure simple round-trip time to configured providers (Anthropic, OpenAI, etc.).
- [ ] **Quota/Credit Check**: (If API allows) Check for remaining credits or rate-limit status.
- [ ] **LSP Server Status**: Verify that configured LSP servers (e.g., `typescript-language-server`) can start and respond to initialization.
- [ ] **MCP Server Status**: Ping local/remote MCP servers.

### 2.3 Configuration Integrity

- [ ] **Schema Validation**: Validate `agent-core.json` against the Zod schema and report specific line-number errors.
- [ ] **Conflict Detection**: Identify conflicting settings (e.g., dual providers without a specified default, overlapping keybinds).
- [ ] **Secrets Verification**: Check for presence of required API keys without displaying them.

## 3. Runtime Diagnostics & Observability

### 3.1 Session Tracing

- [ ] **Trace Mode**: precise logging of the agent loop (Thought -> Tool Call -> Tool Result).
- [ ] **Performance Profiling**: Track time spent in:
  - LLM Inference
  - Tool Execution
  - Local I/O
- [ ] **Context Window Monitoring**: Real-time logging of token usage vs. model limits. Warn when approaching 80/90% capacity.

### 3.2 Integrity Monitoring

- [ ] **State Watchdog**: Background process to detect if the agent loop hangs (no activity for X minutes).
- [ ] **File Lock Monitor**: Detect stale lock files from crashed sessions and offer to clear them.

## 4. Crash Handling & Reporting (`agent-core bug-report`)

### 4.1 Enhanced Artifact Collection

- **Session Replay**: Dump the last N messages of the active session in a sanitized JSON format (scrubbing secrets).
- **Environment Snapshot**: Capture `env` vars (keys redacted), active git branch, and recent commit hash.
- **LSP Logs**: Include stderr output from attached language servers.

### 4.2 Automated Diagnostics

- **Sanity Check**: Before zipping, run a mini-health check to see if the error is due to a known environment issue (e.g., "No Internet").
- **Privacy Filter**: Regex-based scrubbing of potential API keys in standard logs.

## 5. Alpha Success Metrics

Define "Stable" as:

- [ ] < 1% Crash Rate per Session.
- [ ] P95 Latency for "Tool Call" < 2s (excluding LLM generation time).
- [ ] 100% successful recovery from interrupted sessions.

## 6. Implementation Roadmap

### Phase 1: The "Doctor" (Complete)

- [x] Update `packages/agent-core/src/cli/cmd/check.ts` to include:
  - [x] Disk/Memory checks.
  - [x] Write permission checks.
  - [x] Provider connectivity ping.

### Phase 2: Enhanced Logging (Complete)

- [x] Implement `Trace` log level in `packages/agent-core/src/util/log.ts`.
- [x] Add token usage tracking to the `Session` object.

### Phase 3: Crash Recovery (Complete)

- [x] Automated stale lock file cleanup on startup.
