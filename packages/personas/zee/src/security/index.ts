/**
 * Security Module
 *
 * Provides security auditing and command gating functionality.
 */

export {
  auditProviderCommandGating,
  type CommandAuthorizer,
  type CommandGatingFinding,
  type CommandGatingModeWhenAccessGroupsOff,
  isSenderAuthorizedForCommands,
  type ProviderCommandGatingConfig,
  resolveCommandAuthorizedFromAuthorizers,
} from "./command-gating.js";
