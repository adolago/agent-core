
import { KeyRedactor } from '../key-redactor';

describe('KeyRedactor Object', () => {
  describe('redactObject', () => {
    it('should return original object if clean', () => {
      const obj = { name: 'safe', count: 123 };
      const redacted = KeyRedactor.redactObject(obj);
      expect(redacted).toBe(obj); // Identity check - verify lazy clone optimization
      expect(redacted).toEqual(obj);
    });

    it('should redact sensitive keys (shallow)', () => {
      const obj = { apiKey: 'secret', name: 'safe' };
      const redacted = KeyRedactor.redactObject(obj);
      expect(redacted).not.toBe(obj);
      expect(redacted.apiKey).toBe('[REDACTED]');
      expect(redacted.name).toBe('safe');
    });

    it('should redact sensitive keys (deep)', () => {
      const obj = { nested: { apiKey: 'secret' }, name: 'safe' };
      const redacted = KeyRedactor.redactObject(obj);
      expect(redacted).not.toBe(obj);
      expect(redacted.nested).not.toBe(obj.nested);
      expect(redacted.nested.apiKey).toBe('[REDACTED]');
    });

    it('should redact sensitive values in clean keys', () => {
      const obj = { description: 'Here is my key: sk-ant-12345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345' };
      const redacted = KeyRedactor.redactObject(obj);
      expect(redacted).not.toBe(obj);
      expect(redacted.description).toContain('[REDACTED]');
    });

    it('should handle arrays correctly', () => {
      const arr = ['safe', 'sk-ant-12345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345'];
      const redacted = KeyRedactor.redactObject(arr as any);
      expect(Array.isArray(redacted)).toBe(true);
      expect(redacted).not.toBe(arr);
      expect(redacted[0]).toBe('safe');
      expect(redacted[1]).toContain('[REDACTED]');
    });

    it('should return original array if clean', () => {
      const arr = ['safe', 'also safe'];
      const redacted = KeyRedactor.redactObject(arr as any);
      expect(Array.isArray(redacted)).toBe(true);
      expect(redacted).toBe(arr); // Identity check
    });

    it('should handle mixed nested arrays and objects', () => {
      const obj = {
        list: [
          { id: 1, secret: 'hidden' },
          { id: 2, name: 'visible' }
        ]
      };
      const redacted = KeyRedactor.redactObject(obj);
      expect(redacted).not.toBe(obj);
      expect(redacted.list).not.toBe(obj.list);
      expect(Array.isArray(redacted.list)).toBe(true);
      expect(redacted.list[0].secret).toBe('[REDACTED]');
      expect(redacted.list[1]).toBe(obj.list[1]); // Should preserve identity of clean children?
    });

    it('should handle complex nested sensitive keys case insensitive', () => {
      const obj = {
        myPrivateKey: 'secret123', // should match 'privateKey' pattern
        API_KEY: 'secret456'       // should match 'api_key' pattern normalized?
      };
      // Note: 'API_KEY' vs 'api_key'. Regex is case insensitive /.../i.
      // SENSITIVE_FIELDS has 'api_key'.
      // API_KEY contains API_KEY? No.
      // But Regex matches substrings. 'API_KEY' contains 'API_KEY'.
      // Wait, 'api_key' is in the list.
      // 'API_KEY' contains 'api_key' (case insensitive)? YES.

      const redacted = KeyRedactor.redactObject(obj);
      // Value > 8 chars is partially redacted
      expect(redacted.myPrivateKey).toContain('[REDACTED]');
      expect(redacted.API_KEY).toContain('[REDACTED]');
    });
  });
});
