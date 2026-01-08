/**
 * Google Antigravity OAuth Authentication
 *
 * Provides free Gemini access via Google OAuth authentication.
 * Based on opencode-google-antigravity-auth plugin pattern.
 *
 * Features:
 * - Google OAuth 2.0 device code flow
 * - Multi-account support with load balancing
 * - Token refresh and persistence
 * - Rate limit handling across accounts
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { ensureDir } from "../../utils.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG_DIR = path.join(os.homedir(), ".zee");
const ANTIGRAVITY_DIR = path.join(CONFIG_DIR, "credentials", "google-antigravity");
const ACCOUNTS_FILE = path.join(ANTIGRAVITY_DIR, "accounts.json");

// Google OAuth endpoints (using Antigravity proxy)
const ANTIGRAVITY_AUTH_URL = "https://antigravity.opencode.ai/auth";
const ANTIGRAVITY_TOKEN_URL = "https://antigravity.opencode.ai/token";
const ANTIGRAVITY_API_URL = "https://antigravity.opencode.ai/v1";

// Google OAuth client (public - Antigravity shared client)
const GOOGLE_CLIENT_ID = "opencode-antigravity";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * OAuth token data for a Google account.
 */
export interface GoogleOAuthToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
}

/**
 * A single Google account for Antigravity.
 */
export interface AntigravityAccount {
  id: string;
  email: string;
  token: GoogleOAuthToken;
  addedAt: number;
  lastUsed?: number;
  requestCount: number;
  rateLimitedUntil?: number;
}

/**
 * Antigravity accounts storage.
 */
export interface AntigravityAccounts {
  version: number;
  accounts: AntigravityAccount[];
  activeAccountId?: string;
  loadBalanceMode: "round_robin" | "least_used" | "random";
}

/**
 * Device code response from OAuth flow.
 */
export interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the path to the Antigravity accounts file.
 */
export function getAntigravityAccountsPath(): string {
  return ACCOUNTS_FILE;
}

/**
 * Load Antigravity accounts from disk.
 */
export async function loadAntigravityAccounts(): Promise<AntigravityAccounts> {
  try {
    const content = await fs.readFile(ACCOUNTS_FILE, "utf-8");
    const parsed = JSON.parse(content) as AntigravityAccounts;
    return {
      version: parsed.version ?? 1,
      accounts: parsed.accounts ?? [],
      activeAccountId: parsed.activeAccountId,
      loadBalanceMode: parsed.loadBalanceMode ?? "round_robin",
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        version: 1,
        accounts: [],
        loadBalanceMode: "round_robin",
      };
    }
    throw err;
  }
}

/**
 * Load Antigravity accounts synchronously.
 */
export function loadAntigravityAccountsSync(): AntigravityAccounts {
  try {
    const content = fsSync.readFileSync(ACCOUNTS_FILE, "utf-8");
    const parsed = JSON.parse(content) as AntigravityAccounts;
    return {
      version: parsed.version ?? 1,
      accounts: parsed.accounts ?? [],
      activeAccountId: parsed.activeAccountId,
      loadBalanceMode: parsed.loadBalanceMode ?? "round_robin",
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        version: 1,
        accounts: [],
        loadBalanceMode: "round_robin",
      };
    }
    throw err;
  }
}

/**
 * Save Antigravity accounts to disk with secure permissions.
 */
export async function saveAntigravityAccounts(
  accounts: AntigravityAccounts,
): Promise<void> {
  await ensureDir(ANTIGRAVITY_DIR);
  const content = JSON.stringify(accounts, null, 2);
  await fs.writeFile(ACCOUNTS_FILE, content, { mode: 0o600 });
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth Flow Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start the device code OAuth flow.
 * Returns user code and verification URL for user to complete.
 */
export async function startDeviceCodeFlow(): Promise<DeviceCodeResponse> {
  const response = await fetch(`${ANTIGRAVITY_AUTH_URL}/device`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: GOOGLE_CLIENT_ID,
      scope: "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/generative-language.retriever",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to start device code flow: ${response.status} - ${error}`);
  }

  const data = await response.json() as {
    device_code: string;
    user_code: string;
    verification_url: string;
    expires_in: number;
    interval: number;
  };

  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUrl: data.verification_url,
    expiresIn: data.expires_in,
    interval: data.interval,
  };
}

/**
 * Poll for token after user completes OAuth flow.
 */
export async function pollForToken(
  deviceCode: string,
  interval: number,
  timeout: number,
): Promise<GoogleOAuthToken | null> {
  const startTime = Date.now();
  const pollInterval = Math.max(interval * 1000, 5000); // At least 5 seconds

  while (Date.now() - startTime < timeout * 1000) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const response = await fetch(`${ANTIGRAVITY_TOKEN_URL}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: GOOGLE_CLIENT_ID,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    if (response.ok) {
      const data = await response.json() as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
        scope: string;
      };

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
        scope: data.scope,
      };
    }

    const errorData = await response.json() as { error?: string };
    if (errorData.error === "authorization_pending") {
      // User hasn't completed auth yet, keep polling
      continue;
    } else if (errorData.error === "slow_down") {
      // Back off
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    } else if (errorData.error === "expired_token") {
      // Device code expired
      return null;
    } else {
      throw new Error(`OAuth error: ${errorData.error}`);
    }
  }

  return null; // Timeout
}

/**
 * Refresh an access token using refresh token.
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<GoogleOAuthToken | null> {
  const response = await fetch(`${ANTIGRAVITY_TOKEN_URL}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: GOOGLE_CLIENT_ID,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json() as {
    access_token: string;
    expires_in: number;
    scope: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: refreshToken, // Refresh token stays the same
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Account Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add a new account after successful OAuth.
 */
export async function addAntigravityAccount(
  email: string,
  token: GoogleOAuthToken,
): Promise<AntigravityAccount> {
  const accounts = await loadAntigravityAccounts();

  // Check if account already exists
  const existingIndex = accounts.accounts.findIndex((a) => a.email === email);
  if (existingIndex >= 0) {
    // Update existing account
    accounts.accounts[existingIndex].token = token;
    accounts.accounts[existingIndex].lastUsed = Date.now();
    await saveAntigravityAccounts(accounts);
    return accounts.accounts[existingIndex];
  }

  // Create new account
  const account: AntigravityAccount = {
    id: `ag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    email,
    token,
    addedAt: Date.now(),
    requestCount: 0,
  };

  accounts.accounts.push(account);

  // Set as active if first account
  if (accounts.accounts.length === 1) {
    accounts.activeAccountId = account.id;
  }

  await saveAntigravityAccounts(accounts);
  return account;
}

/**
 * Remove an account.
 */
export async function removeAntigravityAccount(accountId: string): Promise<boolean> {
  const accounts = await loadAntigravityAccounts();
  const index = accounts.accounts.findIndex((a) => a.id === accountId);

  if (index < 0) {
    return false;
  }

  accounts.accounts.splice(index, 1);

  // Update active account if needed
  if (accounts.activeAccountId === accountId) {
    accounts.activeAccountId = accounts.accounts[0]?.id;
  }

  await saveAntigravityAccounts(accounts);
  return true;
}

/**
 * List all configured accounts.
 */
export async function listAntigravityAccounts(): Promise<AntigravityAccount[]> {
  const accounts = await loadAntigravityAccounts();
  return accounts.accounts;
}

/**
 * Get the best account for making a request (load balancing).
 */
export async function getBestAccount(): Promise<AntigravityAccount | null> {
  const data = await loadAntigravityAccounts();
  const { accounts, loadBalanceMode, activeAccountId } = data;

  if (accounts.length === 0) {
    return null;
  }

  // Filter out rate-limited accounts
  const now = Date.now();
  const available = accounts.filter(
    (a) => !a.rateLimitedUntil || a.rateLimitedUntil < now,
  );

  if (available.length === 0) {
    // All accounts rate-limited, return the one that will be available soonest
    return accounts.reduce((prev, curr) =>
      (prev.rateLimitedUntil ?? 0) < (curr.rateLimitedUntil ?? 0) ? prev : curr,
    );
  }

  switch (loadBalanceMode) {
    case "round_robin": {
      // Find the active account, then use the next one
      const activeIndex = available.findIndex((a) => a.id === activeAccountId);
      const nextIndex = (activeIndex + 1) % available.length;
      return available[nextIndex];
    }

    case "least_used":
      // Return account with lowest request count
      return available.reduce((prev, curr) =>
        prev.requestCount < curr.requestCount ? prev : curr,
      );

    case "random":
    default:
      return available[Math.floor(Math.random() * available.length)];
  }
}

/**
 * Get a valid access token for making requests.
 * Refreshes if needed.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const account = await getBestAccount();
  if (!account) {
    return null;
  }

  // Check if token needs refresh (5 min buffer)
  if (account.token.expiresAt < Date.now() + 5 * 60 * 1000) {
    const newToken = await refreshAccessToken(account.token.refreshToken);
    if (newToken) {
      account.token = newToken;
      const accounts = await loadAntigravityAccounts();
      const index = accounts.accounts.findIndex((a) => a.id === account.id);
      if (index >= 0) {
        accounts.accounts[index] = account;
        await saveAntigravityAccounts(accounts);
      }
    } else {
      return null; // Refresh failed
    }
  }

  // Update stats
  const accounts = await loadAntigravityAccounts();
  const index = accounts.accounts.findIndex((a) => a.id === account.id);
  if (index >= 0) {
    accounts.accounts[index].lastUsed = Date.now();
    accounts.accounts[index].requestCount++;
    accounts.activeAccountId = account.id;
    await saveAntigravityAccounts(accounts);
  }

  return account.token.accessToken;
}

/**
 * Mark an account as rate-limited.
 */
export async function markAccountRateLimited(
  accountId: string,
  retryAfterMs: number = 60000,
): Promise<void> {
  const accounts = await loadAntigravityAccounts();
  const index = accounts.accounts.findIndex((a) => a.id === accountId);

  if (index >= 0) {
    accounts.accounts[index].rateLimitedUntil = Date.now() + retryAfterMs;
    await saveAntigravityAccounts(accounts);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Status and Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if Google Antigravity is configured (has at least one account).
 */
export async function isAntigravityConfigured(): Promise<boolean> {
  const accounts = await loadAntigravityAccounts();
  return accounts.accounts.length > 0;
}

/**
 * Get a summary of Antigravity configuration status.
 */
export async function getAntigravityStatus(): Promise<{
  configured: boolean;
  accountCount: number;
  accounts: Array<{
    id: string;
    email: string;
    isActive: boolean;
    requestCount: number;
    lastUsed?: number;
    isRateLimited: boolean;
  }>;
  loadBalanceMode: string;
}> {
  const data = await loadAntigravityAccounts();
  const now = Date.now();

  return {
    configured: data.accounts.length > 0,
    accountCount: data.accounts.length,
    accounts: data.accounts.map((a) => ({
      id: a.id,
      email: a.email,
      isActive: a.id === data.activeAccountId,
      requestCount: a.requestCount,
      lastUsed: a.lastUsed,
      isRateLimited: Boolean(a.rateLimitedUntil && a.rateLimitedUntil > now),
    })),
    loadBalanceMode: data.loadBalanceMode,
  };
}

/**
 * Get the Antigravity API base URL.
 */
export function getAntigravityApiUrl(): string {
  return ANTIGRAVITY_API_URL;
}

/**
 * Clear all Antigravity accounts.
 */
export async function clearAllAntigravityAccounts(): Promise<void> {
  try {
    await fs.rm(ACCOUNTS_FILE, { force: true });
  } catch {
    // Ignore errors
  }
}
