## 2024-05-23 - Missing Server Authentication Middleware
**Vulnerability:** The `agent-core` server had `OPENCODE_SERVER_PASSWORD` configuration logic in place (CLI warnings) and client-side support (generating headers), but the actual server implementation lacked the authentication middleware entirely, allowing unrestricted access even when a password was configured.
**Learning:** Presence of configuration flags and client-side security code does not guarantee server-side enforcement. The `onError` handler also masked 401 errors as 500s because it didn't handle `HTTPException` correctly.
**Prevention:** Always verify security controls with integration tests that attempt to bypass them. Ensure global error handlers respect HTTP exceptions.
