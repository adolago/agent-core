import { describe, expect, it, jest, beforeEach, afterEach } from "@jest/globals";
import {
  SlidingWindowRateLimiter,
  TokenBucketRateLimiter,
  createRateLimiterMiddleware,
} from "../rate-limiter.js";

describe("rate-limiter", () => {
  describe("SlidingWindowRateLimiter", () => {
    let limiter: SlidingWindowRateLimiter;

    beforeEach(() => {
      limiter = new SlidingWindowRateLimiter({
        maxRequests: 5,
        windowMs: 1000,
      });
    });

    afterEach(() => {
      limiter.destroy();
    });

    it("allows requests within limit", () => {
      for (let i = 0; i < 5; i++) {
        const result = limiter.consume("test");
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i);
      }
    });

    it("blocks requests over limit", () => {
      // Consume all allowed requests
      for (let i = 0; i < 5; i++) {
        limiter.consume("test");
      }

      // Next request should be blocked
      const result = limiter.consume("test");
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it("tracks separate keys independently", () => {
      // Exhaust key1
      for (let i = 0; i < 5; i++) {
        limiter.consume("key1");
      }

      // key2 should still be allowed
      const result = limiter.consume("key2");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it("check does not consume requests", () => {
      const check1 = limiter.check("test");
      const check2 = limiter.check("test");

      expect(check1.remaining).toBe(5);
      expect(check2.remaining).toBe(5);
    });

    it("reset clears specific key", () => {
      // Consume some requests
      limiter.consume("key1");
      limiter.consume("key1");
      limiter.consume("key2");

      // Reset key1
      limiter.reset("key1");

      // key1 should be fresh
      expect(limiter.check("key1").remaining).toBe(5);
      // key2 should be unchanged
      expect(limiter.check("key2").remaining).toBe(4);
    });

    it("reset without key clears all", () => {
      limiter.consume("key1");
      limiter.consume("key2");

      limiter.reset();

      expect(limiter.check("key1").remaining).toBe(5);
      expect(limiter.check("key2").remaining).toBe(5);
    });

    it("status returns current state", () => {
      limiter.consume("test");
      limiter.consume("test");

      const status = limiter.status("test");

      expect(status.total).toBe(5);
      expect(status.used).toBe(2);
      expect(status.remaining).toBe(3);
    });

    it("calls onRateLimited callback when limit exceeded", () => {
      const onRateLimited = jest.fn();
      const limitedLimiter = new SlidingWindowRateLimiter({
        maxRequests: 2,
        windowMs: 1000,
        onRateLimited,
      });

      limitedLimiter.consume("test");
      limitedLimiter.consume("test");
      limitedLimiter.consume("test"); // Should trigger callback

      expect(onRateLimited).toHaveBeenCalledTimes(1);
      expect(onRateLimited).toHaveBeenCalledWith("test", 0, expect.any(Date));

      limitedLimiter.destroy();
    });

    it("provides correct resetAt time", () => {
      const now = Date.now();
      limiter.consume("test");

      const status = limiter.status("test");
      const resetTime = status.resetAt.getTime();

      // Reset should be approximately windowMs after now
      expect(resetTime).toBeGreaterThanOrEqual(now);
      expect(resetTime).toBeLessThanOrEqual(now + 1000 + 100); // +100ms tolerance
    });

    it("allows requests after window expires", async () => {
      const shortLimiter = new SlidingWindowRateLimiter({
        maxRequests: 2,
        windowMs: 100,
      });

      shortLimiter.consume("test");
      shortLimiter.consume("test");
      expect(shortLimiter.consume("test").allowed).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be allowed again
      expect(shortLimiter.consume("test").allowed).toBe(true);

      shortLimiter.destroy();
    });
  });

  describe("TokenBucketRateLimiter", () => {
    let limiter: TokenBucketRateLimiter;

    beforeEach(() => {
      limiter = new TokenBucketRateLimiter({
        maxRequests: 5, // bucket size
        windowMs: 1000, // refill interval
      });
    });

    afterEach(() => {
      limiter.destroy();
    });

    it("allows requests up to bucket size", () => {
      for (let i = 0; i < 5; i++) {
        const result = limiter.consume("test");
        expect(result.allowed).toBe(true);
      }
    });

    it("blocks when bucket is empty", () => {
      // Drain the bucket
      for (let i = 0; i < 5; i++) {
        limiter.consume("test");
      }

      const result = limiter.consume("test");
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("tracks separate keys independently", () => {
      // Drain key1
      for (let i = 0; i < 5; i++) {
        limiter.consume("key1");
      }

      // key2 should have full bucket
      const result = limiter.consume("key2");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it("check does not consume tokens", () => {
      const check1 = limiter.check("test");
      const check2 = limiter.check("test");

      expect(check1.remaining).toBe(5);
      expect(check2.remaining).toBe(5);
    });

    it("refills tokens after window", async () => {
      const shortLimiter = new TokenBucketRateLimiter({
        maxRequests: 3,
        windowMs: 100,
      });

      // Drain the bucket
      for (let i = 0; i < 3; i++) {
        shortLimiter.consume("test");
      }
      expect(shortLimiter.consume("test").allowed).toBe(false);

      // Wait for refill
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should have tokens again
      expect(shortLimiter.consume("test").allowed).toBe(true);

      shortLimiter.destroy();
    });

    it("reset clears bucket for key", () => {
      limiter.consume("key1");
      limiter.consume("key1");

      limiter.reset("key1");

      expect(limiter.check("key1").remaining).toBe(5);
    });

    it("reset without key clears all buckets", () => {
      limiter.consume("key1");
      limiter.consume("key2");

      limiter.reset();

      expect(limiter.check("key1").remaining).toBe(5);
      expect(limiter.check("key2").remaining).toBe(5);
    });

    it("calls onRateLimited callback when bucket empty", () => {
      const onRateLimited = jest.fn();
      const limitedLimiter = new TokenBucketRateLimiter({
        maxRequests: 2,
        windowMs: 1000,
        onRateLimited,
      });

      limitedLimiter.consume("test");
      limitedLimiter.consume("test");
      limitedLimiter.consume("test");

      expect(onRateLimited).toHaveBeenCalledTimes(1);

      limitedLimiter.destroy();
    });

    it("provides accurate status", () => {
      limiter.consume("test");
      limiter.consume("test");

      const status = limiter.status("test");

      expect(status.total).toBe(5);
      expect(status.remaining).toBe(3);
      expect(status.used).toBe(2);
    });
  });

  describe("createRateLimiterMiddleware", () => {
    it("allows requests within limit", () => {
      const limiter = new SlidingWindowRateLimiter({
        maxRequests: 5,
        windowMs: 1000,
      });
      const middleware = createRateLimiterMiddleware(limiter);

      const req = { ip: "127.0.0.1" };
      const headers: Record<string, string> = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn((name: string, value: string) => {
          headers[name] = value;
        }),
      };
      const next = jest.fn();

      middleware(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(headers["X-RateLimit-Limit"]).toBe("5");
      expect(headers["X-RateLimit-Remaining"]).toBe("4");

      limiter.destroy();
    });

    it("blocks requests over limit with 429", () => {
      const limiter = new SlidingWindowRateLimiter({
        maxRequests: 1,
        windowMs: 1000,
      });
      const middleware = createRateLimiterMiddleware(limiter);

      const req = { ip: "127.0.0.1" };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
      };
      const next = jest.fn();

      // First request passes
      middleware(req, res as any, next);
      expect(next).toHaveBeenCalledTimes(1);

      // Second request blocked
      middleware(req, res as any, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Too Many Requests",
        })
      );
      expect(next).toHaveBeenCalledTimes(1); // Still only called once

      limiter.destroy();
    });

    it("uses X-Forwarded-For header when IP not available", () => {
      const limiter = new SlidingWindowRateLimiter({
        maxRequests: 5,
        windowMs: 1000,
      });
      const middleware = createRateLimiterMiddleware(limiter);

      const req = { headers: { "x-forwarded-for": "192.168.1.1" } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
      };
      const next = jest.fn();

      middleware(req, res as any, next);

      expect(next).toHaveBeenCalled();

      limiter.destroy();
    });

    it("sets Retry-After header when rate limited", () => {
      const limiter = new SlidingWindowRateLimiter({
        maxRequests: 1,
        windowMs: 1000,
      });
      const middleware = createRateLimiterMiddleware(limiter);

      const req = { ip: "127.0.0.1" };
      const headers: Record<string, string> = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn((name: string, value: string) => {
          headers[name] = value;
        }),
      };
      const next = jest.fn();

      middleware(req, res as any, next); // Pass
      middleware(req, res as any, next); // Blocked

      expect(headers["Retry-After"]).toBeDefined();
      expect(parseInt(headers["Retry-After"]!)).toBeGreaterThanOrEqual(0);

      limiter.destroy();
    });
  });
});
