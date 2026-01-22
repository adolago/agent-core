
import { KeyRedactor } from '../key-redactor';

describe('KeyRedactor', () => {
  describe('redact', () => {
    it('should return original text if empty', () => {
      expect(KeyRedactor.redact('')).toBe('');
    });

    it('should not modify text with no sensitive data', () => {
      const text = 'This is a safe message.';
      expect(KeyRedactor.redact(text)).toBe(text);
    });

    it('should redact Anthropic keys', () => {
      const key = 'sk-ant-api03-jksd89234jksd89234jksd89234jksd89234jksd89234jksd89234jksd89234jksd89234jksd89234jksd89234-123456AA';
      const text = `Key: ${key}`;
      const redacted = KeyRedactor.redact(text);
      expect(redacted).not.toContain(key);
      expect(redacted).toContain('sk-ant-a...[REDACTED]');
    });

    it('should redact OpenRouter keys', () => {
      const key = 'sk-or-v1-1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const text = `Key: ${key}`;
      const redacted = KeyRedactor.redact(text);
      expect(redacted).not.toContain(key);
      expect(redacted).toContain('sk-or-v1...[REDACTED]');
    });

    it('should redact Bearer tokens', () => {
      const token = 'Bearer abcdef1234567890abcdef1234567890';
      const text = `Auth: ${token}`;
      const redacted = KeyRedactor.redact(text);
      expect(redacted).not.toContain('abcdef1234567890abcdef1234567890');
      expect(redacted).toContain('Bearer a...[REDACTED]');
    });

    it('should redact environment variable assignments', () => {
      const text = "MY_API_KEY='abcdef1234567890abcdef'";
      const redacted = KeyRedactor.redact(text);
      expect(redacted).not.toContain('abcdef1234567890abcdef');
      expect(redacted).toContain('MY_API_K...[REDACTED]');
    });

    it('should redact multiple keys in one string', () => {
      const text = "Key1: sk-ant-api03-jksd89234jksd89234jksd89234jksd89234jksd89234jksd89234jksd89234jksd89234jksd89234jksd89234-123456AA, Key2: MY_SECRET='supersecrettoken12345'";
      const redacted = KeyRedactor.redact(text);
      expect(redacted).not.toContain('jksd89234');
      expect(redacted).not.toContain('supersecrettoken12345');
      expect(redacted).toContain('sk-ant-a...[REDACTED]');
      expect(redacted).toContain('MY_SECRE...[REDACTED]');
    });

    it('should handle showPrefix=false', () => {
       const text = "MY_API_KEY='abcdef1234567890abcdef'";
       const redacted = KeyRedactor.redact(text, false);
       expect(redacted).toBe('[REDACTED_API_KEY]');
    });
  });

  describe('containsSensitiveData', () => {
    it('should return false for safe text', () => {
      expect(KeyRedactor.containsSensitiveData('Hello world')).toBe(false);
    });

    it('should return true for text with API key', () => {
      const key = 'sk-ant-api03-jksd89234jksd89234jksd89234jksd89234jksd89234jksd89234jksd89234jksd89234jksd89234jksd89234-123456AA';
      expect(KeyRedactor.containsSensitiveData(key)).toBe(true);
    });
  });

  describe('validate', () => {
    it('should return safe for safe text', () => {
      const result = KeyRedactor.validate('Hello world');
      expect(result.safe).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should return warnings for sensitive text', () => {
      const key = 'sk-ant-api03-jksd89234jksd89234jksd89234jksd89234jksd89234jksd89234jksd89234jksd89234jksd89234jksd89234-123456AA';
      const result = KeyRedactor.validate(key);
      expect(result.safe).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
