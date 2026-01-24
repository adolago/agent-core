## 2024-05-23 - Missing Server Authentication Middleware
**Vulnerability:** The `agent-core` server had `OPENCODE_SERVER_PASSWORD` configuration logic in place (CLI warnings) and client-side support (generating headers), but the actual server implementation lacked the authentication middleware entirely, allowing unrestricted access even when a password was configured.
**Learning:** Presence of configuration flags and client-side security code does not guarantee server-side enforcement. The `onError` handler also masked 401 errors as 500s because it didn't handle `HTTPException` correctly.
**Prevention:** Always verify security controls with integration tests that attempt to bypass them. Ensure global error handlers respect HTTP exceptions.

## 2025-02-17 - Stack Trace Exposure in API Responses
**Vulnerability:** The `agent-core` Hono server's global `onError` handler was explicitly configured to return `err.stack` in the JSON response for unhandled errors.
**Learning:** Even modern frameworks can be configured insecurely. The `onError` handler prioritizes debugging convenience over security by default or by explicit choice in early development.
**Prevention:** Review global error handlers in all services to ensure they sanitize error output for production environments, logging stack traces to the server logs instead of the response.
