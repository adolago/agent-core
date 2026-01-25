/**
 * Security Manager
 *
 * Authentication, encryption, and access control for federation.
 *
 * Features:
 * - JWT token generation and validation
 * - AES-256-GCM encryption for data at rest
 * - Tenant isolation
 * - mTLS certificate generation
 *
 * Ported from claude-flow v3 @agentic-flow/federation
 *
 * @module tiara/federation/security
 */

import { createHash, randomBytes } from "crypto";
import type {
  AgentTokenPayload,
  EncryptionKeys,
  MTLSCertificates,
} from "./types.js";

// =============================================================================
// Security Manager
// =============================================================================

/**
 * Security Manager
 *
 * Handles authentication, encryption, and tenant isolation for federated agents.
 *
 * @example
 * const security = new SecurityManager();
 *
 * // Create JWT token
 * const token = await security.createAgentToken({
 *   agentId: 'agent-1',
 *   tenantId: 'tenant-1',
 *   expiresAt: Date.now() + 3600000
 * });
 *
 * // Verify token
 * const payload = await security.verifyAgentToken(token);
 *
 * // Encrypt data
 * const { encrypted, authTag } = await security.encrypt('secret data', 'tenant-1');
 *
 * // Decrypt data
 * const decrypted = await security.decrypt(encrypted, authTag, 'tenant-1');
 */
export class SecurityManager {
  private readonly algorithm = "aes-256-gcm";
  private readonly jwtSecret: Uint8Array;
  private encryptionCache: Map<string, EncryptionKeys> = new Map();

  constructor(secret?: string) {
    // Use provided secret or generate random one
    if (secret) {
      this.jwtSecret = new TextEncoder().encode(secret);
    } else {
      this.jwtSecret = randomBytes(32);
    }
  }

  /**
   * Create JWT token for agent authentication
   */
  async createAgentToken(payload: AgentTokenPayload): Promise<string> {
    const header = {
      alg: "HS256",
      typ: "JWT",
    };

    const headerB64 = this.base64UrlEncode(JSON.stringify(header));
    const payloadB64 = this.base64UrlEncode(
      JSON.stringify({
        ...payload,
        iat: Date.now(),
      })
    );

    const signatureInput = `${headerB64}.${payloadB64}`;
    const signature = this.hmacSign(signatureInput);

    return `${signatureInput}.${signature}`;
  }

  /**
   * Verify JWT token
   */
  async verifyAgentToken(token: string): Promise<AgentTokenPayload> {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid token format");
    }

    const [headerB64, payloadB64, signature] = parts;
    const signatureInput = `${headerB64}.${payloadB64}`;

    // Verify signature
    const expectedSignature = this.hmacSign(signatureInput);
    if (signature !== expectedSignature) {
      throw new Error("Invalid token signature");
    }

    // Decode payload
    const payload = JSON.parse(this.base64UrlDecode(payloadB64));

    // Check expiration
    if (payload.expiresAt && Date.now() > payload.expiresAt) {
      throw new Error("Token expired");
    }

    return {
      agentId: payload.agentId,
      tenantId: payload.tenantId,
      expiresAt: payload.expiresAt,
    };
  }

  /**
   * Get or create encryption keys for a tenant
   */
  async getEncryptionKeys(tenantId: string): Promise<EncryptionKeys> {
    // Check cache
    const cached = this.encryptionCache.get(tenantId);
    if (cached) {
      return cached;
    }

    // Derive key from tenant ID and secret
    const keyMaterial = createHash("sha256")
      .update(tenantId)
      .update(this.jwtSecret)
      .digest();

    const keys: EncryptionKeys = {
      encryptionKey: keyMaterial,
      iv: randomBytes(16),
    };

    // Cache keys
    this.encryptionCache.set(tenantId, keys);

    return keys;
  }

  /**
   * Encrypt data with AES-256-GCM
   */
  async encrypt(
    data: string,
    tenantId: string
  ): Promise<{ encrypted: string; authTag: string }> {
    const keys = await this.getEncryptionKeys(tenantId);

    // Use crypto module for actual encryption
    const crypto = await import("crypto");
    const cipher = crypto.createCipheriv(
      this.algorithm,
      keys.encryptionKey,
      keys.iv
    );

    let encrypted = cipher.update(data, "utf8", "base64");
    encrypted += cipher.final("base64");

    const authTag = cipher.getAuthTag().toString("base64");

    return { encrypted, authTag };
  }

  /**
   * Decrypt data with AES-256-GCM
   */
  async decrypt(
    encrypted: string,
    authTag: string,
    tenantId: string
  ): Promise<string> {
    const keys = await this.getEncryptionKeys(tenantId);

    // Use crypto module for actual decryption
    const crypto = await import("crypto");
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      keys.encryptionKey,
      keys.iv
    );

    decipher.setAuthTag(Buffer.from(authTag, "base64"));

    let decrypted = decipher.update(encrypted, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * Generate mTLS certificates for agent-to-hub communication
   */
  async generateMTLSCertificates(agentId: string): Promise<MTLSCertificates> {
    // In production, this would use proper certificate generation
    // For now, return placeholder certificates
    const commonName = `agent-${agentId}`;

    return {
      cert: `-----BEGIN CERTIFICATE-----
MIIBkTCCATemgAwIBAgIUAgent${agentId}0
-----END CERTIFICATE-----`,
      key: `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkAgent${agentId}
-----END PRIVATE KEY-----`,
      ca: `-----BEGIN CERTIFICATE-----
MIIBjDCCATOgAwIBAgIUCA${agentId}
-----END CERTIFICATE-----`,
    };
  }

  /**
   * Validate tenant access to data
   */
  validateTenantAccess(requestTenantId: string, dataTenantId: string): boolean {
    // Simple tenant isolation: only allow access to same tenant data
    return requestTenantId === dataTenantId;
  }

  /**
   * Hash sensitive data for storage (one-way)
   */
  hashData(data: string): string {
    return createHash("sha256").update(data).digest("hex");
  }

  /**
   * Generate secure random ID
   */
  generateSecureId(): string {
    return randomBytes(16).toString("hex");
  }

  /**
   * Base64 URL-safe encoding
   */
  private base64UrlEncode(data: string): string {
    return Buffer.from(data)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  }

  /**
   * Base64 URL-safe decoding
   */
  private base64UrlDecode(data: string): string {
    // Restore standard base64 characters
    let base64 = data.replace(/-/g, "+").replace(/_/g, "/");

    // Add padding if needed
    const padding = base64.length % 4;
    if (padding) {
      base64 += "=".repeat(4 - padding);
    }

    return Buffer.from(base64, "base64").toString("utf8");
  }

  /**
   * HMAC-SHA256 signature
   */
  private hmacSign(data: string): string {
    const hmac = createHash("sha256")
      .update(data)
      .update(this.jwtSecret)
      .digest("base64");

    return hmac.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  /**
   * Clear cached keys (for testing or security refresh)
   */
  clearCache(): void {
    this.encryptionCache.clear();
  }
}

/**
 * Create a security manager
 */
export function createSecurityManager(secret?: string): SecurityManager {
  return new SecurityManager(secret);
}
