import { describe, expect, it } from "@jest/globals";
import {
  generateSecureId,
  generateUUID,
  generateSecureToken,
  generateShortId,
  generateSessionId,
  generateAgentId,
  generateTaskId,
  generateMemoryId,
  generateEventId,
  generateSwarmId,
  generatePatternId,
  generateTrajectoryId,
  secureRandomInt,
  secureRandomChoice,
  secureShuffleArray,
} from "../secure-random.js";

describe("secure-random", () => {
  describe("generateSecureId", () => {
    it("generates unique IDs", () => {
      const id1 = generateSecureId();
      const id2 = generateSecureId();
      expect(id1).not.toBe(id2);
    });

    it("includes prefix when provided", () => {
      const id = generateSecureId("test");
      expect(id).toMatch(/^test_/);
    });

    it("generates IDs with correct format", () => {
      const id = generateSecureId("prefix", 8);
      // Format: prefix_timestamp_randomHex
      expect(id).toMatch(/^prefix_[a-z0-9]+_[a-f0-9]{16}$/);
    });

    it("generates longer IDs with higher byte count", () => {
      const shortId = generateSecureId(undefined, 4);
      const longId = generateSecureId(undefined, 16);
      expect(longId.length).toBeGreaterThan(shortId.length);
    });
  });

  describe("generateUUID", () => {
    it("generates valid UUID v4", () => {
      const uuid = generateUUID();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it("generates unique UUIDs", () => {
      const uuid1 = generateUUID();
      const uuid2 = generateUUID();
      expect(uuid1).not.toBe(uuid2);
    });
  });

  describe("generateSecureToken", () => {
    it("generates hex token of correct length", () => {
      const token = generateSecureToken(16);
      expect(token).toHaveLength(32); // 16 bytes = 32 hex chars
    });

    it("defaults to 32 bytes (64 hex chars)", () => {
      const token = generateSecureToken();
      expect(token).toHaveLength(64);
    });

    it("generates only hex characters", () => {
      const token = generateSecureToken();
      expect(token).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe("generateShortId", () => {
    it("generates base64url encoded ID", () => {
      const id = generateShortId();
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("includes prefix when provided", () => {
      const id = generateShortId("test");
      expect(id).toMatch(/^test-[A-Za-z0-9_-]+$/);
    });
  });

  describe("domain-specific ID generators", () => {
    it("generateSessionId starts with session_", () => {
      expect(generateSessionId()).toMatch(/^session_/);
    });

    it("generateAgentId starts with agent_", () => {
      expect(generateAgentId()).toMatch(/^agent_/);
    });

    it("generateTaskId starts with task_", () => {
      expect(generateTaskId()).toMatch(/^task_/);
    });

    it("generateMemoryId starts with mem_", () => {
      expect(generateMemoryId()).toMatch(/^mem_/);
    });

    it("generateEventId starts with evt_", () => {
      expect(generateEventId()).toMatch(/^evt_/);
    });

    it("generateSwarmId starts with swarm_", () => {
      expect(generateSwarmId()).toMatch(/^swarm_/);
    });

    it("generatePatternId starts with pat_", () => {
      expect(generatePatternId()).toMatch(/^pat_/);
    });

    it("generateTrajectoryId starts with traj_", () => {
      expect(generateTrajectoryId()).toMatch(/^traj_/);
    });
  });

  describe("secureRandomInt", () => {
    it("generates integers within range", () => {
      for (let i = 0; i < 100; i++) {
        const value = secureRandomInt(5, 10);
        expect(value).toBeGreaterThanOrEqual(5);
        expect(value).toBeLessThanOrEqual(10);
      }
    });

    it("handles single value range", () => {
      const value = secureRandomInt(42, 42);
      expect(value).toBe(42);
    });

    it("handles large ranges", () => {
      const value = secureRandomInt(0, 1000000);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1000000);
    });

    it("has uniform distribution (rough check)", () => {
      const counts = new Map<number, number>();
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        const value = secureRandomInt(0, 9);
        counts.set(value, (counts.get(value) || 0) + 1);
      }

      // Each value should appear roughly 10% of the time (±5%)
      for (const count of counts.values()) {
        expect(count).toBeGreaterThan(50); // At least 5%
        expect(count).toBeLessThan(150); // At most 15%
      }
    });
  });

  describe("secureRandomChoice", () => {
    it("returns element from array", () => {
      const array = ["a", "b", "c", "d"];
      const choice = secureRandomChoice(array);
      expect(array).toContain(choice);
    });

    it("throws on empty array", () => {
      expect(() => secureRandomChoice([])).toThrow("Cannot select from empty array");
    });

    it("returns the only element for single-element array", () => {
      expect(secureRandomChoice(["only"])).toBe("only");
    });

    it("works with different types", () => {
      const numbers = [1, 2, 3];
      const choice = secureRandomChoice(numbers);
      expect(typeof choice).toBe("number");
    });
  });

  describe("secureShuffleArray", () => {
    it("returns new array", () => {
      const original = [1, 2, 3, 4, 5];
      const shuffled = secureShuffleArray(original);
      expect(shuffled).not.toBe(original);
    });

    it("preserves all elements", () => {
      const original = [1, 2, 3, 4, 5];
      const shuffled = secureShuffleArray(original);
      expect(shuffled.sort()).toEqual(original.sort());
    });

    it("does not modify original array", () => {
      const original = [1, 2, 3, 4, 5];
      const copy = [...original];
      secureShuffleArray(original);
      expect(original).toEqual(copy);
    });

    it("handles empty array", () => {
      expect(secureShuffleArray([])).toEqual([]);
    });

    it("handles single element", () => {
      expect(secureShuffleArray([42])).toEqual([42]);
    });

    it("actually shuffles (statistical check)", () => {
      const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      let samePositionCount = 0;

      for (let i = 0; i < 100; i++) {
        const shuffled = secureShuffleArray(original);
        if (shuffled.every((val, idx) => val === original[idx])) {
          samePositionCount++;
        }
      }

      // Probability of no change is 1/n! which is essentially 0
      expect(samePositionCount).toBeLessThan(5);
    });
  });
});
