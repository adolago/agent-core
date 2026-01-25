/**
 * Security Module
 *
 * Shared security utilities for Tiara orchestration engine.
 * Provides cryptographically secure ID generation, input validation,
 * and sanitization utilities.
 *
 * Ported from claude-flow v3 @claude-flow/shared/security
 *
 * @module tiara/security
 */

// Secure random generation
export {
  generateSecureId,
  generateUUID,
  generateSecureToken,
  generateShortId,
  generateSessionId,
  generateAgentId,
  generateTaskId,
  generateMemoryId,
  generateEventId,
  generateSwarmId,
  generatePatternId,
  generateTrajectoryId,
  secureRandomInt,
  secureRandomChoice,
  secureShuffleArray,
} from "./secure-random.js";

// Input validation
export {
  validateInput,
  sanitizeString,
  validatePath,
  validateCommand,
  validateTags,
  isValidIdentifier,
  escapeForSql,
} from "./input-validation.js";

// Types
export type { ValidationResult, ValidationOptions } from "./input-validation.js";
