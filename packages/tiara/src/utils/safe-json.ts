/**
 * Safe JSON parsing utilities to prevent unhandled exceptions
 * and improve debugging when parsing fails.
 */

export interface SafeParseResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
}

/**
 * Safely parse JSON with error handling
 * Returns a result object instead of throwing
 */
export function safeJsonParse<T = unknown>(
  data: string,
  context?: string
): SafeParseResult<T> {
  try {
    const parsed = JSON.parse(data) as T;
    return { success: true, data: parsed };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (context) {
      console.warn(`JSON parse failed (${context}): ${err.message}`);
    }
    return { success: false, error: err };
  }
}

/**
 * Parse JSON with a fallback value on failure
 */
export function parseJsonWithFallback<T>(
  data: string,
  fallback: T,
  context?: string
): T {
  const result = safeJsonParse<T>(data, context);
  return result.success && result.data !== undefined ? result.data : fallback;
}

/**
 * Parse JSON or return null on failure
 */
export function parseJsonOrNull<T = unknown>(
  data: string,
  context?: string
): T | null {
  const result = safeJsonParse<T>(data, context);
  return result.success ? (result.data ?? null) : null;
}

/**
 * Parse JSON and throw with enhanced error message
 */
export function parseJsonStrict<T = unknown>(
  data: string,
  context: string
): T {
  try {
    return JSON.parse(data) as T;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const preview = data.length > 100 ? data.slice(0, 100) + '...' : data;
    throw new Error(`JSON parse failed (${context}): ${err.message}. Data preview: ${preview}`);
  }
}
