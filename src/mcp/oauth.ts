/**
 * MCP OAuth Manager
 *
 * Manages OAuth tokens and credentials for remote MCP servers.
 * Handles PKCE flow, token storage, and refresh.
 */

import type { McpRemoteConfig } from './types';

// ============================================================================
// OAuth Types
// ============================================================================

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
}

export interface OAuthClientInfo {
  clientId: string;
  clientSecret?: string;
  clientIdIssuedAt?: number;
  clientSecretExpiresAt?: number;
}

export interface McpOAuthConfig {
  callbackPort?: number;
  callbackPath?: string;
}

// ============================================================================
// MCP OAuth Manager
// ============================================================================

/**
 * Manages OAuth tokens and credentials for MCP servers
 */
export class McpOAuthManager {
  private tokens: Map<string, OAuthTokens> = new Map();
  private clientInfo: Map<string, OAuthClientInfo> = new Map();
  private pendingFlows: Map<string, { state: string; codeVerifier: string }> = new Map();
  private callbackPort: number;
  private callbackPath: string;

  constructor(config?: McpOAuthConfig) {
    this.callbackPort = config?.callbackPort ?? 19876;
    this.callbackPath = config?.callbackPath ?? '/mcp/oauth/callback';
  }

  /**
   * Get redirect URL for OAuth
   */
  get redirectUrl(): string {
    return `http://127.0.0.1:${this.callbackPort}${this.callbackPath}`;
  }

  /**
   * Start OAuth flow
   */
  async startAuth(serverId: string, config: McpRemoteConfig): Promise<{ authorizationUrl: string }> {
    if (config.oauth === false) {
      throw new Error(`OAuth disabled for server ${serverId}`);
    }

    // Generate PKCE parameters
    const state = this.generateRandomString(32);
    const codeVerifier = this.generateRandomString(64);

    this.pendingFlows.set(serverId, { state, codeVerifier });

    // Build authorization URL
    const oauthConfig = typeof config.oauth === 'object' ? config.oauth : {};
    const baseUrl = new URL(config.url);
    const authUrl = new URL('/oauth/authorize', baseUrl);

    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', this.redirectUrl);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', await this.generateCodeChallenge(codeVerifier));
    authUrl.searchParams.set('code_challenge_method', 'S256');

    if (oauthConfig.clientId) {
      authUrl.searchParams.set('client_id', oauthConfig.clientId);
    }
    if (oauthConfig.scope) {
      authUrl.searchParams.set('scope', oauthConfig.scope);
    }

    return { authorizationUrl: authUrl.toString() };
  }

  /**
   * Complete OAuth flow with authorization code
   */
  async finishAuth(serverId: string, _authorizationCode: string): Promise<void> {
    const flow = this.pendingFlows.get(serverId);
    if (!flow) {
      throw new Error(`No pending OAuth flow for server ${serverId}`);
    }

    // In production, exchange code for tokens
    // This is a placeholder - implementation would use the codeVerifier
    this.pendingFlows.delete(serverId);
  }

  /**
   * Get stored tokens
   */
  getTokens(serverId: string): OAuthTokens | undefined {
    return this.tokens.get(serverId);
  }

  /**
   * Store tokens
   */
  setTokens(serverId: string, tokens: OAuthTokens): void {
    this.tokens.set(serverId, tokens);
  }

  /**
   * Get client info
   */
  getClientInfo(serverId: string): OAuthClientInfo | undefined {
    return this.clientInfo.get(serverId);
  }

  /**
   * Store client info (from dynamic registration)
   */
  setClientInfo(serverId: string, info: OAuthClientInfo): void {
    this.clientInfo.set(serverId, info);
  }

  /**
   * Remove auth credentials
   */
  async removeAuth(serverId: string): Promise<void> {
    this.tokens.delete(serverId);
    this.clientInfo.delete(serverId);
    this.pendingFlows.delete(serverId);
  }

  /**
   * Check if tokens are expired
   */
  isTokenExpired(serverId: string): boolean {
    const tokens = this.tokens.get(serverId);
    if (!tokens?.expiresAt) return false;
    return tokens.expiresAt < Date.now() / 1000;
  }

  /**
   * Check if we have valid tokens for a server
   */
  hasValidTokens(serverId: string): boolean {
    return this.tokens.has(serverId) && !this.isTokenExpired(serverId);
  }

  // --------------------------------------------------------------------------
  // Crypto Helpers (PKCE)
  // --------------------------------------------------------------------------

  private generateRandomString(length: number): string {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}
