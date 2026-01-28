/**
 * Environment Variable Sanitization
 *
 * Prevents PATH injection and other environment-based attacks.
 * Ported from agent-core security module.
 *
 * The risk: If an attacker can control environment variables like PATH,
 * and those values contain shell metacharacters (e.g., $(command)),
 * the shell may execute arbitrary commands during variable expansion.
 *
 * The fix: Validate PATH values before passing to child processes,
 * and reject values containing shell metacharacters.
 *
 * @module security/env-sanitize
 */

/**
 * Characters that could trigger shell expansion or injection
 * Note: Backslash is excluded because it's used in Windows paths
 */
const SHELL_METACHARACTERS_PATTERN = /[$`|;&<>(){}[\]!#*?~'"]/;

/**
 * Check if a string contains shell metacharacters that could cause injection
 */
export function containsShellMetacharacters(value: string): boolean {
  return SHELL_METACHARACTERS_PATTERN.test(value);
}

/**
 * Validate that a PATH-like environment variable doesn't contain injection attempts.
 * PATH values should only contain directory paths separated by colons (Unix) or semicolons (Windows).
 *
 * @param value - The PATH value to validate
 * @returns true if safe, false if potentially dangerous
 */
export function isValidPathValue(value: string): boolean {
  // PATH should only contain:
  // - Alphanumeric characters
  // - Path separators: / (Unix), \ (Windows)
  // - Path list separator: : (Unix), ; (Windows)
  // - Dots, dashes, underscores (common in paths)
  // - Spaces (for paths with spaces)
  const validPathPattern = /^[a-zA-Z0-9/\\:;.\-_ ]+$/;
  return validPathPattern.test(value);
}

/**
 * Get a safe default PATH value based on the platform
 */
export function getDefaultPath(): string {
  if (process.platform === "win32") {
    return "C:\\Windows\\System32;C:\\Windows";
  }
  return "/usr/local/bin:/usr/bin:/bin";
}

/**
 * Sanitize environment variables for shell execution.
 * Returns a copy of the env with dangerous PATH values replaced.
 *
 * @param env - Environment to sanitize
 * @param options - Sanitization options
 * @returns Sanitized environment object
 */
export function sanitizeEnvForShell(
  env: Record<string, string>,
  options?: {
    /** Whether to validate PATH (default: true) */
    validatePath?: boolean;
  },
): { env: Record<string, string>; warnings: string[] } {
  const validatePath = options?.validatePath ?? true;
  const warnings: string[] = [];
  const result: Record<string, string> = { ...env };

  if (validatePath && result.PATH) {
    if (!isValidPathValue(result.PATH)) {
      warnings.push(
        `PATH contains potentially dangerous characters, using default: ${result.PATH.slice(0, 50)}...`,
      );
      result.PATH = getDefaultPath();
    }
  }

  // Check for command substitution patterns in all values
  for (const [key, value] of Object.entries(result)) {
    if (value.includes("$(") || value.includes("`")) {
      warnings.push(`${key} contains command substitution pattern, removing`);
      delete result[key];
    }
  }

  return { env: result, warnings };
}

/**
 * Validate user-provided environment variables before merging.
 * Rejects variables that could be used for injection.
 *
 * @param userEnv - User-provided environment variables
 * @returns Validated environment or throws on dangerous input
 */
export function validateUserEnv(userEnv?: Record<string, string>): Record<string, string> {
  if (!userEnv) return {};

  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(userEnv)) {
    // Reject PATH overrides with shell metacharacters
    if (key.toLowerCase() === "path" && !isValidPathValue(value)) {
      throw new Error(`Invalid PATH value: contains shell metacharacters`);
    }

    // Reject any value with command substitution
    if (value.includes("$(") || value.includes("`")) {
      throw new Error(`Invalid env value for ${key}: contains command substitution`);
    }

    result[key] = value;
  }

  return result;
}
