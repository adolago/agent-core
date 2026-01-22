import type { ZeeConfig } from "../config/config.js";
import type { TelegramAccountConfig } from "../config/types.js";
import {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
} from "../routing/session-key.js";
import { resolveTelegramToken } from "./token.js";

/**
 * Check if telegram user mode is enabled
 */
export function isTelegramUserModeEnabled(cfg: ZeeConfig): boolean {
  return cfg.telegram?.user?.enabled === true;
}

/**
 * Get telegram user config
 */
export function getTelegramUserConfig(cfg: ZeeConfig): {
  enabled: boolean;
  phoneNumber: string | null;
  password: string | null;
} {
  const userConfig = cfg.telegram?.user;
  return {
    enabled: userConfig?.enabled === true,
    phoneNumber:
      userConfig?.phoneNumber || process.env.TELEGRAM_USER_PHONE || null,
    password: userConfig?.password || process.env.TELEGRAM_USER_2FA || null,
  };
}

export type ResolvedTelegramAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  token: string;
  tokenSource: "env" | "tokenFile" | "config" | "none";
  config: TelegramAccountConfig;
};

function listConfiguredAccountIds(cfg: ZeeConfig): string[] {
  const accounts = cfg.telegram?.accounts;
  if (!accounts || typeof accounts !== "object") return [];
  return Object.keys(accounts).filter(Boolean);
}

export function listTelegramAccountIds(cfg: ZeeConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) return [DEFAULT_ACCOUNT_ID];
  return ids.sort((a, b) => a.localeCompare(b));
}

export function resolveDefaultTelegramAccountId(cfg: ZeeConfig): string {
  const ids = listTelegramAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) return DEFAULT_ACCOUNT_ID;
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function resolveAccountConfig(
  cfg: ZeeConfig,
  accountId: string,
): TelegramAccountConfig | undefined {
  const accounts = cfg.telegram?.accounts;
  if (!accounts || typeof accounts !== "object") return undefined;
  return accounts[accountId] as TelegramAccountConfig | undefined;
}

function mergeTelegramAccountConfig(
  cfg: ZeeConfig,
  accountId: string,
): TelegramAccountConfig {
  const { accounts: _ignored, ...base } = (cfg.telegram ??
    {}) as TelegramAccountConfig & { accounts?: unknown };
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account };
}

export function resolveTelegramAccount(params: {
  cfg: ZeeConfig;
  accountId?: string | null;
}): ResolvedTelegramAccount {
  const accountId = normalizeAccountId(params.accountId);
  const baseEnabled = params.cfg.telegram?.enabled !== false;
  const merged = mergeTelegramAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;
  const tokenResolution = resolveTelegramToken(params.cfg, { accountId });
  return {
    accountId,
    enabled,
    name: merged.name?.trim() || undefined,
    token: tokenResolution.token,
    tokenSource: tokenResolution.source,
    config: merged,
  };
}

export function listEnabledTelegramAccounts(
  cfg: ZeeConfig,
): ResolvedTelegramAccount[] {
  return listTelegramAccountIds(cfg)
    .map((accountId) => resolveTelegramAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}
