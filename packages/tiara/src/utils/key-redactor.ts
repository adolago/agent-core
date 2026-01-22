/**
 * API Key Redaction Utility
 * Prevents sensitive data from leaking into logs, memory, or git commits
 */

export interface RedactionConfig {
  patterns: RegExp[];
  replacement: string;
  maskLength: number;
}

export class KeyRedactor {
  private static readonly API_KEY_PATTERNS = [
    // Anthropic API keys
    /sk-ant-[a-zA-Z0-9_-]{95,}/gi,

    // OpenRouter API keys
    /sk-or-[a-zA-Z0-9_-]{32,}/gi,

    // Google/Gemini API keys
    /AIza[a-zA-Z0-9_-]{35}/gi,

    // Generic API keys
    /[a-zA-Z0-9_-]{20,}API[a-zA-Z0-9_-]{20,}/gi,

    // Bearer tokens
    /Bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi,

    // Environment variable format
    /([A-Z_]+_API_KEY|[A-Z_]+_TOKEN|[A-Z_]+_SECRET)=["']?([^"'\s]+)["']?/gi,

    // Supabase keys
    /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/gi,
  ];

  // Combined pattern for faster redaction
  private static readonly COMBINED_PATTERN = new RegExp(
    KeyRedactor.API_KEY_PATTERNS.map(p => p.source).join('|'),
    'gi'
  );

  private static readonly SENSITIVE_FIELDS = [
    'apiKey',
    'api_key',
    'token',
    'secret',
    'password',
    'private_key',
    'privateKey',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
  ];

  // Combined pattern for faster key checking
  private static readonly SENSITIVE_KEY_PATTERN = new RegExp(
    KeyRedactor.SENSITIVE_FIELDS.join('|'),
    'i'
  );

  /**
   * Redact API keys and sensitive data from text
   */
  static redact(text: string, showPrefix = true): string {
    if (!text) return text;
    // Optimization: Skip redaction for short strings that can't contain API keys
    // The shortest pattern (Env var) is roughly 10 chars (e.g. "A_KEY=val")
    if (text.length < 10) return text;

    return text.replace(this.COMBINED_PATTERN, (match) => {
      if (showPrefix && match.length > 8) {
        const prefix = match.substring(0, 8);
        return `${prefix}...[REDACTED]`;
      }
      return '[REDACTED_API_KEY]';
    });
  }

  /**
   * Redact sensitive fields in objects
   */
  static redactObject<T extends Record<string, any>>(obj: T, deep = true): T {
    if (!obj || typeof obj !== 'object') return obj;

    // Handle array specifically to preserve type and mapping
    if (Array.isArray(obj)) {
      let changed = false;
      const newArray = obj.map(item => {
        let newItem = item;
        if (typeof item === 'string') {
          newItem = this.redact(item);
        } else {
          newItem = this.redactObject(item, deep);
        }

        if (newItem !== item) changed = true;
        return newItem;
      });
      return (changed ? newArray : obj) as unknown as T;
    }

    let redacted: T | null = null;
    const keys = Object.keys(obj);

    for (const key of keys) {
      const val = (obj as any)[key];
      let newVal = val;

      // 1. Check if key is sensitive
      const isSensitive = typeof val === 'string' && this.SENSITIVE_KEY_PATTERN.test(key);

      if (isSensitive) {
        if (val && val.length > 8) {
          newVal = `${val.substring(0, 4)}...[REDACTED]`;
        } else {
          newVal = '[REDACTED]';
        }
      }
      // 2. Deep redaction
      else if (deep && typeof val === 'object' && val !== null) {
        newVal = this.redactObject(val, deep);
      }
      // 3. String content redaction
      else if (typeof val === 'string') {
        // Optimization: check length before calling redact to avoid function call overhead
        if (val.length >= 10) {
          newVal = this.redact(val);
        }
      }

      // If changed, ensure we have a clone
      if (newVal !== val) {
        if (!redacted) {
          redacted = { ...obj };
        }
        (redacted as any)[key] = newVal;
      }
    }

    return redacted || obj;
  }

  /**
   * Sanitize text for safe logging
   */
  static sanitize(text: string): string {
    return this.redact(text, true);
  }

  /**
   * Sanitize command arguments
   */
  static sanitizeArgs(args: string[]): string[] {
    return args.map(arg => {
      // Check if arg is a flag value pair
      if (arg.includes('key') || arg.includes('token') || arg.includes('secret')) {
        return this.redact(arg);
      }
      return arg;
    });
  }

  /**
   * Check if text contains unredacted sensitive data
   */
  static containsSensitiveData(text: string): boolean {
    // Use search instead of match to avoid allocating an array of all matches
    // and to stop as soon as a match is found.
    return text.search(this.COMBINED_PATTERN) !== -1;
  }

  /**
   * Validate that text is safe for logging/storage
   */
  static validate(text: string): { safe: boolean; warnings: string[] } {
    const warnings: string[] = [];

    // We can still use the individual patterns for detailed warnings
    this.API_KEY_PATTERNS.forEach((pattern, index) => {
      // Reset lastIndex just in case, since they are global
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        warnings.push(`Potential API key detected (pattern ${index + 1})`);
      }
    });

    return {
      safe: warnings.length === 0,
      warnings,
    };
  }

  /**
   * Redact environment variables
   */
  static redactEnv(env: Record<string, string | undefined>): Record<string, string> {
    const redacted: Record<string, string> = {};

    Object.keys(env).forEach(key => {
      const value = env[key];
      if (!value) {
        redacted[key] = '';
        return;
      }

      const lowerKey = key.toLowerCase();
      const isSensitive = lowerKey.includes('key') ||
                         lowerKey.includes('token') ||
                         lowerKey.includes('secret') ||
                         lowerKey.includes('password');

      if (isSensitive) {
        redacted[key] = value.length > 8
          ? `${value.substring(0, 4)}...[REDACTED]`
          : '[REDACTED]';
      } else {
        redacted[key] = value;
      }
    });

    return redacted;
  }
}

// Export singleton instance
export const redactor = KeyRedactor;
