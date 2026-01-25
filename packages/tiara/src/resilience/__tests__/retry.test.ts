import { describe, expect, it, jest } from "@jest/globals";
import { retry, withRetry, RetryError, RetryableErrors } from "../retry.js";

describe("retry", () => {
  describe("retry function", () => {
    it("succeeds on first attempt", async () => {
      const fn = jest.fn().mockResolvedValue("success");
      const result = await retry(fn);

      expect(result.success).toBe(true);
      expect(result.result).toBe("success");
      expect(result.attempts).toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("retries on failure and eventually succeeds", async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error("fail 1"))
        .mockRejectedValueOnce(new Error("fail 2"))
        .mockResolvedValue("success");

      const result = await retry(fn, { maxAttempts: 5, initialDelay: 10 });

      expect(result.success).toBe(true);
      expect(result.result).toBe("success");
      expect(result.attempts).toBe(3);
      expect(result.errors).toHaveLength(2);
    });

    it("fails after max attempts", async () => {
      const fn = jest.fn().mockRejectedValue(new Error("always fails"));

      const result = await retry(fn, { maxAttempts: 3, initialDelay: 10 });

      expect(result.success).toBe(false);
      expect(result.result).toBeUndefined();
      expect(result.attempts).toBe(3);
      expect(result.errors).toHaveLength(3);
    });

    it("respects maxAttempts option", async () => {
      const fn = jest.fn().mockRejectedValue(new Error("fail"));

      const result = await retry(fn, { maxAttempts: 5, initialDelay: 10 });

      expect(result.attempts).toBe(5);
      expect(fn).toHaveBeenCalledTimes(5);
    });

    it("calls onRetry callback", async () => {
      const onRetry = jest.fn();
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValue("success");

      await retry(fn, { maxAttempts: 3, initialDelay: 10, onRetry });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, expect.any(Number));
    });

    it("respects retryableErrors filter", async () => {
      const fn = jest.fn().mockRejectedValue(new Error("permanent failure"));

      const result = await retry(fn, {
        maxAttempts: 5,
        initialDelay: 10,
        retryableErrors: (err) => err.message.includes("temporary"),
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1); // Should stop after first non-retryable error
    });

    it("tracks total time", async () => {
      const fn = jest.fn().mockResolvedValue("success");

      const result = await retry(fn, { initialDelay: 10 });

      expect(result.totalTime).toBeGreaterThanOrEqual(0);
    });

    it("handles timeout", async () => {
      const fn = jest.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve("slow"), 1000))
      );

      const result = await retry(fn, { timeout: 50, maxAttempts: 2, initialDelay: 10 });

      expect(result.success).toBe(false);
      expect(result.errors[0]!.message).toContain("timed out");
    });

    it("converts non-Error exceptions to Error", async () => {
      const fn = jest.fn().mockRejectedValue("string error");

      const result = await retry(fn, { maxAttempts: 1 });

      expect(result.errors[0]).toBeInstanceOf(Error);
      expect(result.errors[0]!.message).toBe("string error");
    });

    it("applies exponential backoff", async () => {
      const delays: number[] = [];
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error("1"))
        .mockRejectedValueOnce(new Error("2"))
        .mockResolvedValue("success");

      await retry(fn, {
        maxAttempts: 5,
        initialDelay: 100,
        backoffMultiplier: 2,
        jitter: 0,
        onRetry: (_err, _attempt, delay) => delays.push(delay),
      });

      // First delay should be initialDelay (100)
      // Second delay should be initialDelay * multiplier (200)
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);
    });

    it("respects maxDelay", async () => {
      const delays: number[] = [];
      const fn = jest.fn().mockRejectedValue(new Error("fail"));

      await retry(fn, {
        maxAttempts: 5,
        initialDelay: 1000,
        maxDelay: 500,
        backoffMultiplier: 10,
        jitter: 0,
        onRetry: (_err, _attempt, delay) => delays.push(delay),
      });

      // All delays should be capped at maxDelay
      for (const delay of delays) {
        expect(delay).toBeLessThanOrEqual(500);
      }
    });
  });

  describe("withRetry wrapper", () => {
    it("creates a retrying version of a function", async () => {
      const original = jest
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValue("success");

      const wrapped = withRetry(original, { maxAttempts: 3, initialDelay: 10 });
      const result = await wrapped();

      expect(result.success).toBe(true);
      expect(result.result).toBe("success");
    });

    it("passes arguments through", async () => {
      const original = jest.fn().mockImplementation((a: number, b: number) => Promise.resolve(a + b));

      const wrapped = withRetry(original);
      const result = await wrapped(2, 3);

      expect(result.success).toBe(true);
      expect(result.result).toBe(5);
      expect(original).toHaveBeenCalledWith(2, 3);
    });
  });

  describe("RetryableErrors predicates", () => {
    describe("network", () => {
      it("returns true for network errors", () => {
        expect(RetryableErrors.network(new Error("ECONNRESET"))).toBe(true);
        expect(RetryableErrors.network(new Error("ETIMEDOUT"))).toBe(true);
        expect(RetryableErrors.network(new Error("ECONNREFUSED"))).toBe(true);
        expect(RetryableErrors.network(new Error("ENOTFOUND"))).toBe(true);
        expect(RetryableErrors.network(new Error("EAI_AGAIN"))).toBe(true);
      });

      it("returns false for non-network errors", () => {
        expect(RetryableErrors.network(new Error("Invalid input"))).toBe(false);
        expect(RetryableErrors.network(new Error("Permission denied"))).toBe(false);
      });
    });

    describe("rateLimit", () => {
      it("returns true for rate limit errors", () => {
        expect(RetryableErrors.rateLimit(new Error("429 Too Many Requests"))).toBe(true);
        expect(RetryableErrors.rateLimit(new Error("Rate limit exceeded"))).toBe(true);
      });

      it("returns false for non-rate-limit errors", () => {
        expect(RetryableErrors.rateLimit(new Error("500 Internal Server Error"))).toBe(false);
      });
    });

    describe("serverError", () => {
      it("returns true for 5xx errors", () => {
        expect(RetryableErrors.serverError(new Error("500 Internal Server Error"))).toBe(true);
        expect(RetryableErrors.serverError(new Error("502 Bad Gateway"))).toBe(true);
        expect(RetryableErrors.serverError(new Error("503 Service Unavailable"))).toBe(true);
      });

      it("returns false for client errors", () => {
        expect(RetryableErrors.serverError(new Error("400 Bad Request"))).toBe(false);
        expect(RetryableErrors.serverError(new Error("404 Not Found"))).toBe(false);
      });
    });

    describe("transient", () => {
      it("returns true for any transient error", () => {
        expect(RetryableErrors.transient(new Error("ECONNRESET"))).toBe(true);
        expect(RetryableErrors.transient(new Error("429 Rate Limited"))).toBe(true);
        expect(RetryableErrors.transient(new Error("500 Server Error"))).toBe(true);
      });

      it("returns false for permanent errors", () => {
        expect(RetryableErrors.transient(new Error("Invalid credentials"))).toBe(false);
      });
    });

    describe("all", () => {
      it("always returns true", () => {
        expect(RetryableErrors.all()).toBe(true);
        expect(RetryableErrors.all()).toBe(true);
      });
    });
  });

  describe("RetryError", () => {
    it("contains attempt information", () => {
      const errors = [new Error("1"), new Error("2")];
      const error = new RetryError("Failed after 2 attempts", 2, errors, 1500);

      expect(error.name).toBe("RetryError");
      expect(error.message).toBe("Failed after 2 attempts");
      expect(error.attempts).toBe(2);
      expect(error.errors).toBe(errors);
      expect(error.totalTime).toBe(1500);
    });
  });
});
