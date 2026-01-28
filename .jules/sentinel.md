## 2024-05-23 - Missing Server Authentication Middleware
**Vulnerability:** The `agent-core` server had `OPENCODE_SERVER_PASSWORD` configuration logic in place (CLI warnings) and client-side support (generating headers), but the actual server implementation lacked the authentication middleware entirely, allowing unrestricted access even when a password was configured.
**Learning:** Presence of configuration flags and client-side security code does not guarantee server-side enforcement. The `onError` handler also masked 401 errors as 500s because it didn't handle `HTTPException` correctly.
**Prevention:** Always verify security controls with integration tests that attempt to bypass them. Ensure global error handlers respect HTTP exceptions.

## 2026-01-25 - Information Exposure via Stack Traces
**Vulnerability:** The `agent-core` server explicitly returned `err.stack` in JSON responses for 500 Internal Server Errors, exposing internal file paths and logic.
**Learning:** Even local-first tools can expose sensitive system information via error handling. Testing error responses requires ensuring the mock error itself doesn't contain the stack trace in its message, which can lead to false negatives in tests.
**Prevention:** Sanitize error messages in the global `onError` handler. Use `err.message` instead of `err.stack` or `err.toString()` for unknown errors in production-like environments.

## 2026-01-27 - Command Injection in Ripgrep Search
**Vulnerability:** The `Ripgrep.search` function constructed a shell command by joining arguments into a string and executing it via `$` (Bun Shell) with `{ raw: command }`. This allowed arbitrary command injection via the `pattern` argument.
**Learning:** Using `raw` mode in Bun Shell bypasses auto-escaping. Even when using modern runtimes like Bun, constructing commands as strings for shell execution is risky.
**Prevention:** Use `Bun.spawn` with an argument array to execute binaries directly, bypassing the shell. This ensures arguments are treated literally and prevents injection.

## 2026-05-28 - SSRF in Proxy Fallback via Protocol-Relative URLs
**Vulnerability:** The `agent-core` server's proxy fallback used `new URL(c.req.path, proxyBase)` to construct the upstream URL. `new URL()` treats paths starting with `//` (e.g., `//evil.com`) as protocol-relative URLs, ignoring the `proxyBase` and allowing Server-Side Request Forgery (SSRF) to arbitrary origins.
**Learning:** `new URL()` behavior with protocol-relative paths can be a subtle source of SSRF when combining a base URL with untrusted path input. Concatenating URLs or validating the resulting origin is crucial.
**Prevention:** Always validate the `origin` of the constructed URL matches the expected `proxyBase` origin before making the request.
