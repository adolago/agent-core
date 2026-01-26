## 2024-05-23 - Missing Server Authentication Middleware
**Vulnerability:** The `agent-core` server had `OPENCODE_SERVER_PASSWORD` configuration logic in place (CLI warnings) and client-side support (generating headers), but the actual server implementation lacked the authentication middleware entirely, allowing unrestricted access even when a password was configured.
**Learning:** Presence of configuration flags and client-side security code does not guarantee server-side enforcement. The `onError` handler also masked 401 errors as 500s because it didn't handle `HTTPException` correctly.
**Prevention:** Always verify security controls with integration tests that attempt to bypass them. Ensure global error handlers respect HTTP exceptions.

## 2026-01-25 - Information Exposure via Stack Traces
**Vulnerability:** The `agent-core` server explicitly returned `err.stack` in JSON responses for 500 Internal Server Errors, exposing internal file paths and logic.
**Learning:** Even local-first tools can expose sensitive system information via error handling. Testing error responses requires ensuring the mock error itself doesn't contain the stack trace in its message, which can lead to false negatives in tests.
**Prevention:** Sanitize error messages in the global `onError` handler. Use `err.message` instead of `err.stack` or `err.toString()` for unknown errors in production-like environments.

## 2026-02-17 - Open Proxy / SSRF via Protocol-Relative URLs
**Vulnerability:** The proxy handler in `server.ts` blindly joined `c.req.path` with `proxyBase`. Protocol-relative URLs (e.g., `//evil.com`) in `c.req.path` caused `new URL()` to ignore `proxyBase`, turning the agent into an open proxy.
**Learning:** `new URL(path, base)` is not just a path joiner; it parses `path` as a potential URL. Protocol-relative paths override the base's host.
**Prevention:** Always validate that the resolved URL's origin matches the expected `proxyBase` origin when implementing a proxy.
