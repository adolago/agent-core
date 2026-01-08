/**
 * Council Credential Storage
 *
 * Securely stores and retrieves API keys for council providers.
 * Credentials are stored in ~/.zee/credentials/council/providers.json
 * with restrictive file permissions (0o600).
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";

import { ensureDir } from "../../utils.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG_DIR = path.join(os.homedir(), ".zee");
const COUNCIL_CREDS_DIR = path.join(CONFIG_DIR, "credentials", "council");
const PROVIDERS_FILE = path.join(COUNCIL_CREDS_DIR, "providers.json");

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Supported council provider types.
 */
export type CouncilProviderType =
  | "openrouter"
  | "opencode_zen"
  | "google_antigravity" // Free Gemini via Google OAuth
  | "anthropic"
  | "openai"
  | "google"
  | "zai"
  | "custom";

/**
 * Stored credential for a single provider.
 */
export interface ProviderCredential {
  apiKey: string;
  baseUrl?: string;
  addedAt: number;
  lastUsed?: number;
}

/**
 * Full credentials store structure.
 */
export interface CouncilCredentials {
  version: number;
  providers: Partial<Record<CouncilProviderType, ProviderCredential>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the path to the council credentials file.
 */
export function getCouncilCredsPath(): string {
  return PROVIDERS_FILE;
}

/**
 * Get the path to the council credentials directory.
 */
export function getCouncilCredsDir(): string {
  return COUNCIL_CREDS_DIR;
}

/**
 * Load council credentials from disk.
 * Returns empty credentials if file doesn't exist.
 */
export async function loadCouncilCredentials(): Promise<CouncilCredentials> {
  try {
    const content = await fs.readFile(PROVIDERS_FILE, "utf-8");
    const parsed = JSON.parse(content) as CouncilCredentials;
    return {
      version: parsed.version ?? 1,
      providers: parsed.providers ?? {},
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, providers: {} };
    }
    throw err;
  }
}

/**
 * Load council credentials synchronously.
 * Returns empty credentials if file doesn't exist.
 */
export function loadCouncilCredentialsSync(): CouncilCredentials {
  try {
    const content = fsSync.readFileSync(PROVIDERS_FILE, "utf-8");
    const parsed = JSON.parse(content) as CouncilCredentials;
    return {
      version: parsed.version ?? 1,
      providers: parsed.providers ?? {},
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, providers: {} };
    }
    throw err;
  }
}

/**
 * Save council credentials to disk with secure permissions.
 */
export async function saveCouncilCredentials(
  creds: CouncilCredentials,
): Promise<void> {
  await ensureDir(COUNCIL_CREDS_DIR);
  const content = JSON.stringify(creds, null, 2);
  await fs.writeFile(PROVIDERS_FILE, content, { mode: 0o600 });
}

/**
 * Save a single provider credential.
 */
export async function saveProviderCredential(
  provider: CouncilProviderType,
  credential: Omit<ProviderCredential, "addedAt">,
): Promise<void> {
  const creds = await loadCouncilCredentials();
  creds.providers[provider] = {
    ...credential,
    addedAt: Date.now(),
  };
  await saveCouncilCredentials(creds);
}

/**
 * Get a single provider credential.
 */
export async function getProviderCredential(
  provider: CouncilProviderType,
): Promise<ProviderCredential | null> {
  const creds = await loadCouncilCredentials();
  return creds.providers[provider] ?? null;
}

/**
 * Get a provider's API key, checking credentials file then environment.
 * Returns null if not found.
 */
export async function resolveProviderApiKey(
  provider: CouncilProviderType,
): Promise<string | null> {
  // Check environment first (higher priority)
  const envKey = getEnvKeyForProvider(provider);
  if (envKey && process.env[envKey]?.trim()) {
    return process.env[envKey]!.trim();
  }

  // Fall back to stored credentials
  const cred = await getProviderCredential(provider);
  return cred?.apiKey ?? null;
}

/**
 * Get a provider's API key synchronously.
 */
export function resolveProviderApiKeySync(
  provider: CouncilProviderType,
): string | null {
  // Check environment first
  const envKey = getEnvKeyForProvider(provider);
  if (envKey && process.env[envKey]?.trim()) {
    return process.env[envKey]!.trim();
  }

  // Fall back to stored credentials
  const creds = loadCouncilCredentialsSync();
  return creds.providers[provider]?.apiKey ?? null;
}

/**
 * Delete a provider credential.
 */
export async function deleteProviderCredential(
  provider: CouncilProviderType,
): Promise<boolean> {
  const creds = await loadCouncilCredentials();
  if (!creds.providers[provider]) {
    return false;
  }
  delete creds.providers[provider];
  await saveCouncilCredentials(creds);
  return true;
}

/**
 * List all configured providers.
 */
export async function listConfiguredProviders(): Promise<CouncilProviderType[]> {
  const creds = await loadCouncilCredentials();
  return Object.keys(creds.providers) as CouncilProviderType[];
}

/**
 * Check if a provider is configured (either in credentials or environment).
 */
export async function isProviderConfigured(
  provider: CouncilProviderType,
): Promise<boolean> {
  const apiKey = await resolveProviderApiKey(provider);
  return apiKey !== null && apiKey.length > 0;
}

/**
 * Update last used timestamp for a provider.
 */
export async function updateProviderLastUsed(
  provider: CouncilProviderType,
): Promise<void> {
  const creds = await loadCouncilCredentials();
  if (creds.providers[provider]) {
    creds.providers[provider]!.lastUsed = Date.now();
    await saveCouncilCredentials(creds);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Environment Variable Mapping
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDER_ENV_VARS: Record<CouncilProviderType, string | null> = {
  openrouter: "OPENROUTER_API_KEY",
  opencode_zen: "OPENCODE_ZEN_API_KEY",
  google_antigravity: "GOOGLE_OAUTH_TOKEN", // OAuth token, not API key
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  zai: "ZAI_API_KEY",
  custom: null,
};

/**
 * Get the environment variable name for a provider.
 */
export function getEnvKeyForProvider(
  provider: CouncilProviderType,
): string | null {
  return PROVIDER_ENV_VARS[provider];
}

/**
 * Get provider status summary (for display).
 */
export async function getProviderStatus(): Promise<
  Array<{
    provider: CouncilProviderType;
    configured: boolean;
    source: "env" | "credentials" | "none";
    lastUsed?: number;
  }>
> {
  const creds = await loadCouncilCredentials();
  const providers: CouncilProviderType[] = [
    "openrouter",
    "opencode_zen",
    "google_antigravity",
    "anthropic",
    "openai",
    "google",
    "zai",
  ];

  return providers.map((provider) => {
    const envKey = getEnvKeyForProvider(provider);
    const hasEnv = envKey ? Boolean(process.env[envKey]?.trim()) : false;
    const hasCreds = Boolean(creds.providers[provider]?.apiKey);

    return {
      provider,
      configured: hasEnv || hasCreds,
      source: hasEnv ? "env" : hasCreds ? "credentials" : "none",
      lastUsed: creds.providers[provider]?.lastUsed,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate an OpenRouter API key format.
 * OpenRouter keys start with "sk-or-"
 */
export function validateOpenRouterKey(key: string): boolean {
  return key.startsWith("sk-or-") && key.length > 10;
}

/**
 * Validate an Anthropic API key format.
 * Anthropic keys start with "sk-ant-"
 */
export function validateAnthropicKey(key: string): boolean {
  return key.startsWith("sk-ant-") && key.length > 10;
}

/**
 * Validate an OpenAI API key format.
 * OpenAI keys start with "sk-"
 */
export function validateOpenAIKey(key: string): boolean {
  return key.startsWith("sk-") && key.length > 10;
}

/**
 * Validate a Google AI API key format.
 * Google AI keys start with "AIzaSy"
 */
export function validateGoogleKey(key: string): boolean {
  return key.startsWith("AIzaSy") && key.length > 30;
}

/**
 * Validate an OpenCode Zen API key format.
 * OpenCode Zen keys start with "sk-"
 */
export function validateOpenCodeZenKey(key: string): boolean {
  return key.startsWith("sk-") && key.length > 20;
}

/**
 * Validate a ZAI API key format.
 * ZAI keys have format: uuid.token
 */
export function validateZaiKey(key: string): boolean {
  return key.includes(".") && key.length > 20;
}

/**
 * Validate an API key format for a specific provider.
 */
export function validateApiKeyFormat(
  provider: CouncilProviderType,
  key: string,
): { valid: boolean; error?: string } {
  if (!key || key.trim().length === 0) {
    return { valid: false, error: "API key is required" };
  }

  switch (provider) {
    case "openrouter":
      if (!validateOpenRouterKey(key)) {
        return {
          valid: false,
          error: 'OpenRouter API key should start with "sk-or-"',
        };
      }
      break;
    case "opencode_zen":
      if (!validateOpenCodeZenKey(key)) {
        return {
          valid: false,
          error: 'OpenCode Zen API key should start with "sk-"',
        };
      }
      break;
    case "anthropic":
      if (!validateAnthropicKey(key)) {
        return {
          valid: false,
          error: 'Anthropic API key should start with "sk-ant-"',
        };
      }
      break;
    case "openai":
      if (!validateOpenAIKey(key)) {
        return {
          valid: false,
          error: 'OpenAI API key should start with "sk-"',
        };
      }
      break;
    case "google":
      if (!validateGoogleKey(key)) {
        return {
          valid: false,
          error: 'Google AI API key should start with "AIzaSy"',
        };
      }
      break;
    case "zai":
      if (!validateZaiKey(key)) {
        return {
          valid: false,
          error: 'ZAI API key should be in format "uuid.token"',
        };
      }
      break;
  }

  return { valid: true };
}

/**
 * Clear all council credentials.
 */
export async function clearAllCredentials(): Promise<void> {
  try {
    await fs.rm(PROVIDERS_FILE, { force: true });
  } catch {
    // Ignore errors if file doesn't exist
  }
}
