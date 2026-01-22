
import { describe, it, expect } from '@jest/globals';
import { CryptographicCore } from '../verification/security.js';

describe('CryptographicCore (Async)', () => {
  it('should encrypt and decrypt data correctly', async () => {
    const core = new CryptographicCore();
    const message = 'This is a super secret message for verification';
    const password = 'my-secure-password';

    const encryptPromise = core.encrypt(message, password);

    // Verify it returns a promise (async check)
    expect(encryptPromise).toBeInstanceOf(Promise);

    const encryptedData = await encryptPromise;

    expect(encryptedData).toHaveProperty('encrypted');
    expect(encryptedData).toHaveProperty('iv');
    expect(encryptedData).toHaveProperty('tag');
    expect(encryptedData).toHaveProperty('salt');

    const decryptPromise = core.decrypt(encryptedData, password);
    expect(decryptPromise).toBeInstanceOf(Promise);

    const decrypted = await decryptPromise;

    expect(decrypted).toBe(message);
  });

  it('should produce different ciphertexts for same data (due to random IV/salt)', async () => {
    const core = new CryptographicCore();
    const message = 'Same message';
    const password = 'same-password';

    const result1 = await core.encrypt(message, password);
    const result2 = await core.encrypt(message, password);

    expect(result1.encrypted).not.toBe(result2.encrypted);
    expect(result1.iv).not.toBe(result2.iv);
    expect(result1.salt).not.toBe(result2.salt);
  });

  it('should fail decryption with wrong password', async () => {
    const core = new CryptographicCore();
    const message = 'Secret';
    const password = 'correct-password';
    const wrongPassword = 'wrong-password';

    const encryptedData = await core.encrypt(message, password);

    await expect(core.decrypt(encryptedData, wrongPassword)).rejects.toThrow();
  });

  it('should generate key pairs asynchronously', async () => {
    const core = new CryptographicCore();
    const keyPairPromise = core.generateKeyPair();

    expect(keyPairPromise).toBeInstanceOf(Promise);

    const keyPair = await keyPairPromise;
    expect(keyPair).toHaveProperty('publicKey');
    expect(keyPair).toHaveProperty('privateKey');

    // Stricter checks
    expect(typeof keyPair.publicKey).toBe('string');
    expect(typeof keyPair.privateKey).toBe('string');
    expect(keyPair.publicKey.length).toBeGreaterThan(0);
    expect(keyPair.privateKey.length).toBeGreaterThan(0);
    expect(keyPair.publicKey).toContain('BEGIN PUBLIC KEY');
    expect(keyPair.privateKey).toContain('BEGIN PRIVATE KEY');
  });
});
