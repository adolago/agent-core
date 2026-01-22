/**
 * Command Gating Security Module
 *
 * Provides access control for slash/control commands across messaging providers.
 * Ported from upstream clawdbot security fixes.
 */

export type CommandAuthorizer = {
  configured: boolean;
  allowed: boolean;
};

export type CommandGatingModeWhenAccessGroupsOff =
  | "allow"
  | "deny"
  | "configured";

/**
 * Resolves whether a command is authorized based on access groups and authorizers.
 *
 * @param useAccessGroups - Whether access groups are enabled (default: true)
 * @param authorizers - List of authorizers with configured/allowed status
 * @param modeWhenAccessGroupsOff - Behavior when access groups are disabled
 * @returns Whether the command is authorized
 */
export function resolveCommandAuthorizedFromAuthorizers(params: {
  useAccessGroups: boolean;
  authorizers: CommandAuthorizer[];
  modeWhenAccessGroupsOff?: CommandGatingModeWhenAccessGroupsOff;
}): boolean {
  const { useAccessGroups, authorizers } = params;
  const mode = params.modeWhenAccessGroupsOff ?? "allow";

  if (!useAccessGroups) {
    if (mode === "allow") return true;
    if (mode === "deny") return false;
    // "configured" mode: check if any authorizer is configured
    const anyConfigured = authorizers.some((entry) => entry.configured);
    if (!anyConfigured) return true;
    return authorizers.some((entry) => entry.configured && entry.allowed);
  }

  // With access groups enabled, require explicit authorization
  return authorizers.some((entry) => entry.configured && entry.allowed);
}

export type ProviderCommandGatingConfig = {
  /** Whether useAccessGroups is enabled globally */
  useAccessGroups?: boolean;
  /** Provider-specific allowFrom list */
  allowFrom?: string[];
  /** Whether native commands are enabled */
  nativeEnabled?: boolean;
  /** Whether native skills are enabled */
  nativeSkillsEnabled?: boolean;
};

export type CommandGatingFinding = {
  checkId: string;
  severity: "info" | "warn" | "critical";
  title: string;
  detail: string;
  remediation?: string;
};

/**
 * Audits command gating configuration for a provider.
 * Returns security findings if misconfigured.
 */
export function auditProviderCommandGating(params: {
  providerId: string;
  config: ProviderCommandGatingConfig;
  hasUserAllowlist?: boolean;
}): CommandGatingFinding[] {
  const { providerId, config, hasUserAllowlist } = params;
  const findings: CommandGatingFinding[] = [];

  const commandsEnabled = config.nativeEnabled || config.nativeSkillsEnabled;
  if (!commandsEnabled) return findings;

  const useAccessGroups = config.useAccessGroups !== false;
  const hasAllowFrom = (config.allowFrom?.length ?? 0) > 0;

  if (!useAccessGroups && !hasUserAllowlist) {
    findings.push({
      checkId: `channels.${providerId}.commands.native.unrestricted`,
      severity: "critical",
      title: `${providerId} slash commands are unrestricted`,
      detail: `commands.useAccessGroups=false disables sender allowlists for ${providerId} slash commands; any user can invoke /… commands.`,
      remediation: `Set commands.useAccessGroups=true (recommended), or configure ${providerId} allowFrom list.`,
    });
  } else if (useAccessGroups && !hasAllowFrom && !hasUserAllowlist) {
    findings.push({
      checkId: `channels.${providerId}.commands.native.no_allowlists`,
      severity: "warn",
      title: `${providerId} slash commands have no allowlists`,
      detail: `${providerId} slash commands are enabled, but no allowlist is configured; /… commands will be rejected for everyone.`,
      remediation: `Add user IDs to ${providerId} allowFrom configuration.`,
    });
  }

  return findings;
}

/**
 * Checks if a sender is authorized for command execution.
 */
export function isSenderAuthorizedForCommands(params: {
  senderId: string;
  allowFromList: string[];
  useAccessGroups?: boolean;
}): boolean {
  const { senderId, allowFromList, useAccessGroups = true } = params;

  if (!useAccessGroups) return true;
  if (allowFromList.length === 0) return false;
  if (allowFromList.includes("*")) return true;

  const normalizedSender = senderId.toLowerCase().trim();
  return allowFromList.some((allowed) => {
    const normalizedAllowed = allowed.toLowerCase().trim();
    return (
      normalizedSender === normalizedAllowed ||
      normalizedSender.endsWith(normalizedAllowed) ||
      normalizedAllowed.endsWith(normalizedSender)
    );
  });
}
