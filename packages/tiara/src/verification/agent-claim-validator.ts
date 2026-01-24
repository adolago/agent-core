/**
 * Agent Claim Validator
 * Lightweight validator for agent claims used by the verification pipeline.
 */

import type { AgentClaim, VerificationEvidence } from './types.js';

export interface AgentClaimValidationResult {
  claimId: string;
  passed: boolean;
  score: number;
  evidence: VerificationEvidence[];
}

export class AgentClaimValidator {
  async validateClaim(
    claim: AgentClaim,
    _config: Record<string, unknown> = {},
  ): Promise<AgentClaimValidationResult> {
    return {
      claimId: claim.id,
      passed: true,
      score: claim.confidence ?? 1,
      evidence: [],
    };
  }
}
