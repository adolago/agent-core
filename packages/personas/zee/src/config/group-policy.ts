import type { ChannelId } from "../channels/plugins/types.js";
import { normalizeAccountId } from "../routing/session-key.js";
import type { ZeeConfig } from "./config.js";
import type { GroupToolPolicyConfig, SenderToolPolicyConfig } from "./types.tools.js";

export type GroupPolicyChannel = ChannelId;

export type ChannelGroupConfig = {
  requireMention?: boolean;
  tools?: GroupToolPolicyConfig;
  senders?: Record<string, SenderToolPolicyConfig>;
};

export type ChannelGroupPolicy = {
  allowlistEnabled: boolean;
  allowed: boolean;
  groupConfig?: ChannelGroupConfig;
  defaultConfig?: ChannelGroupConfig;
};

type ChannelGroups = Record<string, ChannelGroupConfig>;

function resolveChannelGroups(
  cfg: ZeeConfig,
  channel: GroupPolicyChannel,
  accountId?: string | null,
): ChannelGroups | undefined {
  const normalizedAccountId = normalizeAccountId(accountId);
  const channelConfig = cfg.channels?.[channel] as
    | {
        accounts?: Record<string, { groups?: ChannelGroups }>;
        groups?: ChannelGroups;
      }
    | undefined;
  if (!channelConfig) return undefined;
  const accountGroups =
    channelConfig.accounts?.[normalizedAccountId]?.groups ??
    channelConfig.accounts?.[
      Object.keys(channelConfig.accounts ?? {}).find(
        (key) => key.toLowerCase() === normalizedAccountId.toLowerCase(),
      ) ?? ""
    ]?.groups;
  return accountGroups ?? channelConfig.groups;
}

export function resolveChannelGroupPolicy(params: {
  cfg: ZeeConfig;
  channel: GroupPolicyChannel;
  groupId?: string | null;
  accountId?: string | null;
}): ChannelGroupPolicy {
  const { cfg, channel } = params;
  const groups = resolveChannelGroups(cfg, channel, params.accountId);
  const allowlistEnabled = Boolean(groups && Object.keys(groups).length > 0);
  const normalizedId = params.groupId?.trim();
  const groupConfig = normalizedId && groups ? groups[normalizedId] : undefined;
  const defaultConfig = groups?.["*"];
  const allowAll = allowlistEnabled && Boolean(groups && Object.hasOwn(groups, "*"));
  const allowed =
    !allowlistEnabled ||
    allowAll ||
    (normalizedId ? Boolean(groups && Object.hasOwn(groups, normalizedId)) : false);
  return {
    allowlistEnabled,
    allowed,
    groupConfig,
    defaultConfig,
  };
}

export function resolveChannelGroupRequireMention(params: {
  cfg: ZeeConfig;
  channel: GroupPolicyChannel;
  groupId?: string | null;
  accountId?: string | null;
  requireMentionOverride?: boolean;
  overrideOrder?: "before-config" | "after-config";
}): boolean {
  const { requireMentionOverride, overrideOrder = "after-config" } = params;
  const { groupConfig, defaultConfig } = resolveChannelGroupPolicy(params);
  const configMention =
    typeof groupConfig?.requireMention === "boolean"
      ? groupConfig.requireMention
      : typeof defaultConfig?.requireMention === "boolean"
        ? defaultConfig.requireMention
        : undefined;

  if (overrideOrder === "before-config" && typeof requireMentionOverride === "boolean") {
    return requireMentionOverride;
  }
  if (typeof configMention === "boolean") return configMention;
  if (overrideOrder !== "before-config" && typeof requireMentionOverride === "boolean") {
    return requireMentionOverride;
  }
  return true;
}

export function resolveChannelGroupToolsPolicy(params: {
  cfg: ZeeConfig;
  channel: GroupPolicyChannel;
  groupId?: string | null;
  accountId?: string | null;
}): GroupToolPolicyConfig | undefined {
  const { groupConfig, defaultConfig } = resolveChannelGroupPolicy(params);
  if (groupConfig?.tools) return groupConfig.tools;
  if (defaultConfig?.tools) return defaultConfig.tools;
  return undefined;
}

/**
 * Resolve per-sender tool policy overrides within a group.
 *
 * Sender policies allow fine-grained control over which tools are available
 * to specific users within a group. The effective policy is computed by:
 * 1. Starting with the group-level tool policy (from resolveChannelGroupToolsPolicy)
 * 2. Applying sender-specific allow/deny overrides
 *
 * Precedence: sender deny > sender allow > group deny > group allow
 *
 * @param params - Resolution parameters
 * @returns Combined tool policy for the sender, or undefined if none configured
 */
export function resolveSenderToolsPolicy(params: {
  cfg: ZeeConfig;
  channel: GroupPolicyChannel;
  groupId?: string | null;
  accountId?: string | null;
  senderId?: string | null;
}): GroupToolPolicyConfig | undefined {
  const { groupConfig, defaultConfig } = resolveChannelGroupPolicy(params);
  const senderId = params.senderId?.trim();

  // Get group-level tools policy
  const groupTools = groupConfig?.tools ?? defaultConfig?.tools;

  // Get sender config from group or default
  const senders = groupConfig?.senders ?? defaultConfig?.senders;
  if (!senderId || !senders) {
    return groupTools;
  }

  // Look up sender by exact match or case-insensitive
  const senderConfig =
    senders[senderId] ??
    senders[
      Object.keys(senders).find((key) => key.toLowerCase() === senderId.toLowerCase()) ?? ""
    ];

  if (!senderConfig) {
    return groupTools;
  }

  // Merge sender overrides with group policy
  // Sender deny takes highest precedence, then sender allow
  const mergedAllow = mergeAllowLists(groupTools?.allow, senderConfig.allow);
  const mergedDeny = mergeDenyLists(groupTools?.deny, senderConfig.deny);

  if (!mergedAllow && !mergedDeny) {
    return undefined;
  }

  return {
    ...(mergedAllow ? { allow: mergedAllow } : {}),
    ...(mergedDeny ? { deny: mergedDeny } : {}),
  };
}

/**
 * Merge allow lists: sender allow extends group allow
 */
function mergeAllowLists(
  groupAllow?: string[],
  senderAllow?: string[],
): string[] | undefined {
  if (!groupAllow && !senderAllow) return undefined;
  if (!groupAllow) return senderAllow;
  if (!senderAllow) return groupAllow;

  // Combine both lists, remove duplicates
  const combined = new Set([...groupAllow, ...senderAllow]);
  return [...combined];
}

/**
 * Merge deny lists: sender deny extends group deny (both apply)
 */
function mergeDenyLists(
  groupDeny?: string[],
  senderDeny?: string[],
): string[] | undefined {
  if (!groupDeny && !senderDeny) return undefined;
  if (!groupDeny) return senderDeny;
  if (!senderDeny) return groupDeny;

  // Combine both lists, remove duplicates
  const combined = new Set([...groupDeny, ...senderDeny]);
  return [...combined];
}
