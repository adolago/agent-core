/**
 * Session Module - Retry Logic
 *
 * Implements retry strategies for handling transient failures
 * in LLM API calls and tool execution.
 *
 * Key Features:
 * - Exponential backoff with jitter
 * - Retry-After header support
 * - Error classification for retry decisions
 * - Configurable retry limits
 * - Cancellation support via AbortSignal
 */

// =============================================================================
// Retry Configuration
// =============================================================================

export interface RetryConfig {
  /** Initial delay between retries in milliseconds */
  initialDelay: number;
  /** Maximum delay between retries in milliseconds */
  maxDelay: number;
  /** Backoff factor (delay multiplier between retries) */
  backoffFactor: number;
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Add jitter to prevent thundering herd */
  enableJitter: boolean;
  /** Jitter factor (0-1, percentage of delay to randomize) */
  jitterFactor: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  initialDelay: 2000,
  maxDelay: 30000,
  backoffFactor: 2,
  maxAttempts: 5,
  enableJitter: true,
  jitterFactor: 0.1,
};

// =============================================================================
// Error Classification
// =============================================================================

/**
 * Retryable error types and their messages.
 */
export const RETRYABLE_ERRORS = {
  /** Rate limiting */
  RATE_LIMITED: ['rate limit', 'too many requests', '429'],
  /** Server overload */
  OVERLOADED: ['overloaded', 'exhausted', 'unavailable', '503'],
  /** Temporary server errors */
  SERVER_ERROR: ['server_error', 'internal error', '500', '502', '504'],
  /** Network errors */
  NETWORK: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'connection reset'],
  /** Capacity issues */
  CAPACITY: ['no_kv_space', 'capacity'],
} as const;

export type RetryableErrorType = keyof typeof RETRYABLE_ERRORS;

/**
 * Classify an error to determine if it's retryable.
 */
export function classifyError(error: unknown): { retryable: boolean; type?: RetryableErrorType; message?: string } {
  const errorMessage = getErrorMessage(error).toLowerCase();
  const errorCode = getErrorCode(error);

  for (const [type, patterns] of Object.entries(RETRYABLE_ERRORS)) {
    for (const pattern of patterns) {
      if (
        errorMessage.includes(pattern.toLowerCase()) ||
        errorCode === pattern
      ) {
        return {
          retryable: true,
          type: type as RetryableErrorType,
          message: getRetryMessage(type as RetryableErrorType),
        };
      }
    }
  }

  // Check for explicit isRetryable flag
  if (hasRetryableFlag(error)) {
    return {
      retryable: true,
      message: errorMessage,
    };
  }

  return { retryable: false };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.error === 'string') return obj.error;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
    if (typeof obj.code === 'string') return obj.code;
    if (typeof obj.statusCode === 'number') return String(obj.statusCode);
    if (typeof obj.status === 'number') return String(obj.status);
  }
  return undefined;
}

function hasRetryableFlag(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
    return obj.isRetryable === true;
  }
  return false;
}

function getRetryMessage(type: RetryableErrorType): string {
  switch (type) {
    case 'RATE_LIMITED':
      return 'Rate limited - waiting to retry';
    case 'OVERLOADED':
      return 'Provider is overloaded - waiting to retry';
    case 'SERVER_ERROR':
      return 'Server error - waiting to retry';
    case 'NETWORK':
      return 'Network error - waiting to retry';
    case 'CAPACITY':
      return 'Capacity issue - waiting to retry';
    default:
      return 'Temporary error - waiting to retry';
  }
}

// =============================================================================
// Delay Calculation
// =============================================================================

export interface RetryHeaders {
  'retry-after'?: string;
  'retry-after-ms'?: string;
}

/**
 * Calculate the delay before the next retry attempt.
 */
export function calculateDelay(
  attempt: number,
  config: RetryConfig,
  headers?: RetryHeaders,
): number {
  // Check for Retry-After headers first
  if (headers) {
    const headerDelay = parseRetryAfterHeader(headers);
    if (headerDelay !== null) {
      return headerDelay;
    }
  }

  // Calculate exponential backoff
  let delay = config.initialDelay * Math.pow(config.backoffFactor, attempt - 1);

  // Cap at maximum delay
  delay = Math.min(delay, config.maxDelay);

  // Add jitter if enabled
  if (config.enableJitter) {
    const jitter = delay * config.jitterFactor * (Math.random() * 2 - 1);
    delay = Math.max(0, delay + jitter);
  }

  return Math.round(delay);
}

/**
 * Parse Retry-After header value.
 */
function parseRetryAfterHeader(headers: RetryHeaders): number | null {
  // Check for milliseconds header first
  if (headers['retry-after-ms']) {
    const ms = parseFloat(headers['retry-after-ms']);
    if (!isNaN(ms)) {
      return ms;
    }
  }

  // Check for seconds header
  if (headers['retry-after']) {
    const value = headers['retry-after'];

    // Try parsing as seconds
    const seconds = parseFloat(value);
    if (!isNaN(seconds)) {
      return Math.ceil(seconds * 1000);
    }

    // Try parsing as HTTP date
    const date = Date.parse(value);
    if (!isNaN(date)) {
      const delay = date - Date.now();
      if (delay > 0) {
        return Math.ceil(delay);
      }
    }
  }

  return null;
}

// =============================================================================
// Retry Strategy Interface
// =============================================================================

export interface RetryStrategy {
  /** Get the delay for the next retry attempt, or null if no more retries */
  getDelay(attempt: number, error?: Error): number | null;
  /** Sleep for the specified duration with abort support */
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  /** Check if we should retry based on the error */
  shouldRetry(error: unknown): boolean;
  /** Get the current attempt number */
  readonly currentAttempt: number;
  /** Get the retry configuration */
  readonly config: RetryConfig;
}

// =============================================================================
// Default Retry Strategy
// =============================================================================

export class DefaultRetryStrategy implements RetryStrategy {
  private _currentAttempt = 0;

  constructor(public readonly config: RetryConfig = DEFAULT_RETRY_CONFIG) {}

  get currentAttempt(): number {
    return this._currentAttempt;
  }

  getDelay(attempt: number, error?: Error): number | null {
    this._currentAttempt = attempt;

    if (attempt > this.config.maxAttempts) {
      return null;
    }

    // Extract headers if available
    const headers = this.extractHeaders(error);

    return calculateDelay(attempt, this.config, headers);
  }

  async sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }

      const timeout = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      const onAbort = () => {
        clearTimeout(timeout);
        reject(new DOMException('Aborted', 'AbortError'));
      };

      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  shouldRetry(error: unknown): boolean {
    const classification = classifyError(error);
    return classification.retryable;
  }

  private extractHeaders(error?: Error): RetryHeaders | undefined {
    if (!error) return undefined;

    const obj = error as unknown as Record<string, unknown>;
    if (typeof obj.responseHeaders === 'object' && obj.responseHeaders !== null) {
      return obj.responseHeaders as RetryHeaders;
    }

    return undefined;
  }
}

// =============================================================================
// Retry Executor
// =============================================================================

export interface RetryOptions<T> {
  /** Operation to retry */
  operation: () => Promise<T>;
  /** Retry strategy */
  strategy?: RetryStrategy;
  /** Abort signal */
  signal?: AbortSignal;
  /** Callback before each retry */
  onRetry?: (attempt: number, delay: number, error: unknown) => void;
}

/**
 * Execute an operation with automatic retries.
 */
export async function withRetry<T>(options: RetryOptions<T>): Promise<T> {
  const strategy = options.strategy ?? new DefaultRetryStrategy();
  let attempt = 0;

  while (true) {
    attempt++;

    try {
      options.signal?.throwIfAborted();
      return await options.operation();
    } catch (error) {

      // Check if we should retry
      if (!strategy.shouldRetry(error)) {
        throw error;
      }

      // Get delay for next retry
      const delay = strategy.getDelay(attempt, error instanceof Error ? error : undefined);
      if (delay === null) {
        throw error;
      }

      // Notify callback
      options.onRetry?.(attempt, delay, error);

      // Wait before retrying
      if (options.signal) {
        await strategy.sleep(delay, options.signal);
      } else {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a retry strategy with custom configuration.
 */
export function createRetryStrategy(config?: Partial<RetryConfig>): RetryStrategy {
  return new DefaultRetryStrategy({ ...DEFAULT_RETRY_CONFIG, ...config });
}

/**
 * Create a retry strategy optimized for rate limiting.
 */
export function createRateLimitRetryStrategy(): RetryStrategy {
  return new DefaultRetryStrategy({
    ...DEFAULT_RETRY_CONFIG,
    initialDelay: 5000,
    maxDelay: 60000,
    maxAttempts: 10,
    backoffFactor: 1.5,
  });
}

/**
 * Create a retry strategy optimized for network errors.
 */
export function createNetworkRetryStrategy(): RetryStrategy {
  return new DefaultRetryStrategy({
    ...DEFAULT_RETRY_CONFIG,
    initialDelay: 1000,
    maxDelay: 10000,
    maxAttempts: 3,
    backoffFactor: 2,
  });
}
