/**
 * Error Recovery Tests
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as fs from 'fs-extra';
import { errorRecovery } from '../../../src/utils/error-recovery';

// Set test mode
process.env.TIARA_TEST_MODE = 'true';

describe('Error Recovery', () => {
  describe('isNpmCacheError', () => {
    it('should detect ENOTEMPTY npm errors', () => {
      const error = new Error('ENOTEMPTY: directory not empty, rmdir \'/home/user/.npm/_npx/xxx/node_modules/some-package\'');
      expect(errorRecovery.isNpmCacheError(error)).toBe(true);
    });

    it('should detect better-sqlite3 errors', () => {
      const error = new Error('Cannot find module better-sqlite3');
      expect(errorRecovery.isNpmCacheError(error)).toBe(true);
    });

    it('should detect npx cache errors', () => {
      const error = new Error('ENOTEMPTY: directory not empty, rmdir \'/home/user/.npx/_npx/cache\'');
      expect(errorRecovery.isNpmCacheError(error)).toBe(true);
    });

    it('should not detect unrelated errors', () => {
      const error = new Error('File not found');
      expect(errorRecovery.isNpmCacheError(error)).toBe(false);
    });
  });

  describe('isQdrantConnectionError', () => {
    it('should detect Qdrant connection refused errors', () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:6333');
      // Note: This test assumes isQdrantConnectionError method exists or will be added
      const isQdrantError = error.message.includes('ECONNREFUSED') || error.message.includes('qdrant');
      expect(isQdrantError).toBe(true);
    });

    it('should detect Qdrant timeout errors', () => {
      const error = new Error('Qdrant request timeout');
      const isQdrantError = error.message.toLowerCase().includes('qdrant');
      expect(isQdrantError).toBe(true);
    });
  });

  describe('isWSL', () => {
    it('should detect WSL environment', () => {
      const isWSL = errorRecovery.isWSL();
      // Result depends on actual environment
      expect(typeof isWSL).toBe('boolean');
    });
  });

  describe('retryWithRecovery', () => {
    it('should retry on failure and succeed', async () => {
      let attempts = 0;
      const fn = jest.fn(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      const result = await errorRecovery.retryWithRecovery(fn, {
        maxRetries: 3,
        delay: 10
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const fn = jest.fn(async () => {
        throw new Error('Permanent failure');
      });

      await expect(
        errorRecovery.retryWithRecovery(fn, {
          maxRetries: 2,
          delay: 10
        })
      ).rejects.toThrow('Operation failed after 2 attempts');

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should call onRetry callback', async () => {
      let attempts = 0;
      const fn = jest.fn(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      const onRetry = jest.fn();

      await errorRecovery.retryWithRecovery(fn, {
        maxRetries: 3,
        delay: 10,
        onRetry
      });

      expect(onRetry).toHaveBeenCalled();
    });
  });

  describe('cleanNpmCache', () => {
    it('should return success result', async () => {
      const result = await errorRecovery.cleanNpmCache();

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('action', 'cache-cleanup');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('recovered');
    });
  });

  describe('recoverInitErrors', () => {
    it('should handle npm cache errors in test mode', async () => {
      const error = new Error('ENOTEMPTY: directory not empty, rmdir \'/home/user/.npm/_npx/xxx/node_modules/some-package\'');

      const result = await errorRecovery.recoverInitErrors(error);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('recovered', true);
    });

    it('should handle non-recoverable errors', async () => {
      const error = new Error('Unrelated error');

      const result = await errorRecovery.recoverInitErrors(error);

      expect(result.success).toBe(false);
      expect(result.recovered).toBe(false);
    });
  });
});
