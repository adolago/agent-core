/**
 * Resilience Module
 *
 * Production-ready resilience patterns for Tiara orchestration engine.
 * Provides retry with exponential backoff and rate limiting utilities.
 *
 * Ported from claude-flow v3 @claude-flow/shared/resilience
 *
 * @module tiara/resilience
 */

// Retry with exponential backoff
export {
  retry,
  withRetry,
  RetryError,
  RetryableErrors,
} from "./retry.js";

export type { RetryOptions, RetryResult } from "./retry.js";

// Rate limiting
export {
  SlidingWindowRateLimiter,
  TokenBucketRateLimiter,
  createRateLimiterMiddleware,
} from "./rate-limiter.js";

export type {
  RateLimiter,
  RateLimiterOptions,
  RateLimitResult,
  RateLimiterRequest,
  RateLimiterResponse,
} from "./rate-limiter.js";
