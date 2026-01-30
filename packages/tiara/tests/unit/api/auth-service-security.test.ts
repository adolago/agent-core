import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { AuthService, AuthConfig } from '../../../src/api/auth-service';
import { ILogger } from '../../../src/core/logger';
import { createHmac } from 'crypto';

describe('AuthService Security Vulnerability', () => {
  let authService: AuthService;
  let mockLogger: ILogger;
  const config: AuthConfig = {
    jwtSecret: 'test-secret',
    sessionTimeout: 3600000
  };

  beforeEach(() => {
    mockLogger = {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      configure: mock(() => {}),
    } as unknown as ILogger;

    authService = new AuthService(config, mockLogger);
  });

  it('should REJECT a JWT with a forged signature even if length matches (CVE-202X-XXXX)', async () => {
    // 1. Create a valid user and session to generate a valid token structure
    const user = await authService.createUser({
      email: 'victim@example.com',
      password: 'password123',
      role: 'developer'
    });

    const { token: validToken } = await authService.authenticateUser('victim@example.com', 'password123');

    // 2. Extract header and payload
    const [header, payload, signature] = validToken.split('.');

    // 3. Create a forged signature
    // The vulnerability is that Buffer.from(base64urlStr, 'hex') produces empty/wrong buffers for non-hex chars.
    // Base64url chars are A-Z, a-z, 0-9, -, _
    // Hex chars are 0-9, a-f, A-F
    // 'G', 'H', ..., 'Z', '-', '_' are NOT hex.

    // If the original signature contains non-hex chars, Buffer.from(sig, 'hex') is corrupted.
    // If we replace it with another string of same length that produces the SAME corrupted buffer (e.g. empty),
    // it effectively bypasses the check.

    // Let's create a forged signature using only non-hex characters (e.g. 'Z')
    // This will produce an empty buffer when parsed as hex.
    // If the valid signature also produces an empty buffer (or we get lucky with partial matches), this might fail.
    // BUT, the vulnerability allows ANY signature that parses to the same buffer.
    // If the valid signature has non-hex chars, it's ALREADY parsed incorrectly by the vulnerable code.
    // So comparing it to a forged signature of 'Z's (which parses to empty) might match if the valid one also parses to empty.

    // However, usually the valid signature has SOME hex chars (0-9, a-f).
    // So Buffer.from(validSig, 'hex') will NOT be empty, it will be partial bytes.
    // Example: "abZcd" -> "ab" (valid) + "cd" (valid) -> <ab cd>
    // "abQcd" -> <ab cd>
    // So we just need to preserve the hex characters and replace the non-hex characters?
    // No, Buffer.from('non-hex', 'hex') behavior is: "If the string contains characters that are not valid hex characters, they are ignored." (Node < 10)
    // OR "The string is truncated at the first invalid character." (Node >= 10, often).
    // Let's check Node behavior.

    // In current Node (v20+), Buffer.from('abZcd', 'hex') -> <ab>. It stops at 'Z'.
    // So if the signature starts with a non-hex char (e.g. 'G...'), Buffer is empty.
    // If the signature is '4aG...', Buffer is <4a>.

    // ATTACK STRATEGY:
    // If we forge a signature that produces the SAME hex buffer as the valid signature, it passes.
    // Since we don't know the valid signature without the key, we can't easily forge it unless:
    // 1. The valid signature produces an empty buffer (starts with non-hex). Probability ~ (26+26+2 - 22)/64 = 42/64 = 65% for first char.
    // 2. We can brute force the signature by sending signatures that start with non-hex chars.

    // But here we verify if the implementation handles base64url correctly.
    // If we pass a completely different signature (but with same length), it SHOULD fail.

    const forgedSignature = 'Z'.repeat(signature.length); // Z is not hex. Buffer.from('Z...', 'hex') -> <>.
    const forgedToken = `${header}.${payload}.${forgedSignature}`;

    // Expect verification to fail
    await expect(authService.verifyJWT(forgedToken)).rejects.toThrow('Invalid token signature');
  });

  it('should authenticate a valid token', async () => {
    const user = await authService.createUser({
      email: 'user@example.com',
      password: 'password123',
      role: 'viewer'
    });

    const { token } = await authService.authenticateUser('user@example.com', 'password123');
    const { user: verifiedUser } = await authService.verifyJWT(token);

    expect(verifiedUser.id).toBe(user.id);
  });
});
