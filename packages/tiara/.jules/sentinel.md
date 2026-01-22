## 2026-01-14 - Broken AES-GCM Encryption
**Vulnerability:** The `CryptographicCore` used `crypto.createCipher` (deprecated) with AES-256-GCM. This function ignores the generated IV and uses a weak KDF (MD5), leading to IV reuse and potential key exposure.
**Learning:** Even "unused" or "prototype" security code in a codebase poses a risk as it might be adopted blindly. Deprecated crypto functions in Node.js can fail silently or behave insecurely (e.g. ignoring arguments) before being removed.
**Prevention:** Always use `createCipheriv` with explicit Key and IV management. Use proper KDFs (PBKDF2/scrypt/Argon2) for password-based encryption. Lint for deprecated crypto functions.

## 2026-01-14 - Middleware Ordering and Auth Bypass
**Vulnerability:** `SwarmApi` authentication was missing, and middleware setup was unordered (logging/validation added after routes). Even if auth was added, it might have been bypassed for some routes if added in wrong order.
**Learning:** In Express, middleware order is critical. Pre-route middleware (Auth, Logging) must be registered before routes. Post-route middleware (Error Handling) must be registered last.
**Prevention:** Use explicit `setupRequestMiddleware` and `setupErrorMiddleware` methods called in the correct order in the constructor. Always verify that security middleware runs before business logic.

## 2026-01-21 - JWT Signature Bypass via Incorrect Buffer Conversion
**Vulnerability:** `AuthService.constantTimeCompare` used `Buffer.from(str, 'hex')` to convert input strings to buffers. This caused base64url-encoded JWT signatures to be converted to empty or truncated buffers, allowing attackers to forge signatures by matching the length of the valid signature.
**Learning:** `Buffer.from(str, 'hex')` silently ignores or truncates non-hex characters. When comparing strings with different encodings (hex vs base64url), relying on 'hex' conversion is catastrophic.
**Prevention:** Use `Buffer.from(str)` (utf8) for generic constant-time string comparison, or strictly decode inputs to their binary form before comparison. Ensure cryptographic comparison functions handle all expected input formats correctly.
