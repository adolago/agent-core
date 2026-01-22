/**
 * ConsensusEngine Class
 *
 * Manages consensus mechanisms, voting, and collective decision-making
 * within the Hive Mind swarm.
 */

import { EventEmitter } from 'events';
import { QdrantStore, getQdrantStore, type CommunicationData, type ConsensusData, type MessagePriority } from '../core/QdrantStore.js';
import { MCPToolWrapper } from './MCPToolWrapper.js';
import {
  ConsensusProposal,
  ConsensusVote,
  ConsensusResult,
  VotingStrategy,
  ConsensusMetrics,
} from '../types.js';

export class ConsensusEngine extends EventEmitter {
  private threshold: number;
  private store: QdrantStore;
  private mcpWrapper: MCPToolWrapper;
  private activeProposals: Map<string, ConsensusProposal>;
  private votingStrategies: Map<string, VotingStrategy>;
  private metrics: ConsensusMetrics;
  private isActive: boolean = false;

  constructor(threshold: number = 0.66) {
    super();
    this.threshold = threshold;
    this.activeProposals = new Map();
    this.votingStrategies = new Map();
    this.metrics = {
      totalProposals: 0,
      achievedConsensus: 0,
      failedConsensus: 0,
      avgVotingTime: 0,
      avgParticipation: 0,
    };

    this.initializeVotingStrategies();
  }

  /**
   * Initialize consensus engine
   */
  async initialize(): Promise<void> {
    this.store = await getQdrantStore();
    this.mcpWrapper = new MCPToolWrapper();

    // Start consensus monitoring
    this.startProposalMonitor();
    this.startTimeoutChecker();
    this.startMetricsCollector();

    this.isActive = true;
    this.emit('initialized');
  }

  /**
   * Create a new consensus proposal
   */
  async createProposal(proposal: ConsensusProposal): Promise<string> {
    // Store in Qdrant
    await this.store.createConsensusProposal({
      swarmId: proposal.swarmId,
      taskId: proposal.taskId,
      proposal: proposal.proposal,
      requiredThreshold: proposal.requiredThreshold,
      deadline: proposal.deadline?.getTime() ?? Date.now() + 3600000,
    });

    // Add to active proposals
    this.activeProposals.set(proposal.id, proposal);

    // Update metrics
    this.metrics.totalProposals++;

    // Initiate voting
    await this.initiateVoting(proposal);

    this.emit('proposalCreated', proposal);

    return proposal.id;
  }

  /**
   * Submit a vote for a proposal
   */
  async submitVote(vote: ConsensusVote): Promise<void> {
    const proposal = this.activeProposals.get(vote.proposalId);
    if (!proposal) {
      throw new Error('Proposal not found or no longer active');
    }

    // Validate vote
    if (!this.validateVote(vote, proposal)) {
      throw new Error('Invalid vote');
    }

    // Store vote
    await this.store.submitConsensusVote(vote.proposalId, vote.agentId, vote.vote, vote.reason);

    // Check if consensus achieved
    await this.checkConsensus(proposal);

    this.emit('voteSubmitted', vote);
  }

  /**
   * Get proposal status
   */
  async getProposalStatus(proposalId: string): Promise<any> {
    const dbProposal = await this.store.getConsensusProposal(proposalId);
    if (!dbProposal) {
      throw new Error('Proposal not found');
    }

    const votes = dbProposal.votes || {};
    const voteCount = Object.keys(votes).length;
    const positiveVotes = Object.values(votes).filter((v: any) => v.vote).length;

    return {
      id: proposalId,
      status: dbProposal.status,
      proposal: dbProposal.proposal,
      requiredThreshold: dbProposal.requiredThreshold,
      currentVotes: dbProposal.currentVotes,
      totalVoters: dbProposal.totalVoters,
      currentRatio: voteCount > 0 ? positiveVotes / voteCount : 0,
      votes: votes,
      deadline: dbProposal.deadline,
      timeRemaining: dbProposal.deadline - Date.now(),
    };
  }

  /**
   * Get voting recommendation for an agent
   */
  async getVotingRecommendation(
    proposalId: string,
    agentId: string,
    agentType: string,
  ): Promise<any> {
    const proposal = this.activeProposals.get(proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }

    // Analyze proposal using neural patterns
    const analysis = await this.mcpWrapper.analyzePattern({
      action: 'analyze',
      operation: 'consensus_proposal',
      metadata: {
        proposal: proposal.proposal,
        agentType,
        requiredThreshold: proposal.requiredThreshold,
      },
    });

    // Get strategy recommendation
    const strategy = this.selectVotingStrategy(proposal, agentType);
    const recommendation = strategy.recommend(proposal, analysis);

    return {
      proposalId,
      recommendation: recommendation.vote,
      confidence: recommendation.confidence,
      reasoning: recommendation.reasoning,
      factors: recommendation.factors,
    };
  }

  /**
   * Force consensus check (for testing or manual intervention)
   */
  async forceConsensusCheck(proposalId: string): Promise<ConsensusResult> {
    const proposal = this.activeProposals.get(proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }

    return this.checkConsensus(proposal);
  }

  /**
   * Get consensus metrics
   */
  getMetrics(): ConsensusMetrics {
    return { ...this.metrics };
  }

  /**
   * Initialize voting strategies
   */
  private initializeVotingStrategies(): void {
    // Simple majority strategy
    this.votingStrategies.set('simple_majority', {
      name: 'Simple Majority',
      description: 'Requires more than 50% positive votes',
      threshold: 0.5,
      recommend: (proposal, analysis) => ({
        vote: analysis.data?.recommendation || true,
        confidence: 0.7,
        reasoning: 'Based on simple majority principle',
        factors: ['proposal_quality', 'impact_assessment'],
      }),
    });

    // Supermajority strategy
    this.votingStrategies.set('supermajority', {
      name: 'Supermajority',
      description: 'Requires 2/3 or more positive votes',
      threshold: 0.66,
      recommend: (proposal, analysis) => ({
        vote: analysis.data?.strongRecommendation || false,
        confidence: 0.8,
        reasoning: 'Requires strong consensus for critical decisions',
        factors: ['criticality', 'risk_assessment', 'broad_support'],
      }),
    });

    // Unanimous strategy
    this.votingStrategies.set('unanimous', {
      name: 'Unanimous',
      description: 'Requires 100% agreement',
      threshold: 1.0,
      recommend: (proposal, analysis) => ({
        vote: analysis.data?.perfectAlignment || false,
        confidence: 0.9,
        reasoning: 'All agents must agree for this decision',
        factors: ['absolute_necessity', 'zero_dissent'],
      }),
    });

    // Qualified majority strategy
    this.votingStrategies.set('qualified_majority', {
      name: 'Qualified Majority',
      description: 'Weighted voting based on agent expertise',
      threshold: 0.6,
      recommend: (proposal, analysis) => {
        const expertise = analysis.data?.expertiseAlignment || 0.5;
        return {
          vote: expertise > 0.6,
          confidence: expertise,
          reasoning: 'Based on agent expertise and proposal alignment',
          factors: ['expertise_level', 'domain_knowledge', 'past_performance'],
        };
      },
    });
  }

  /**
   * Initiate voting process
   */
  private async initiateVoting(proposal: ConsensusProposal): Promise<void> {
    // Broadcast proposal to all eligible voters
    await this.store.createCommunication({
      fromAgentId: 'consensus-engine',
      toAgentId: undefined, // broadcast
      swarmId: proposal.swarmId,
      messageType: 'consensus_vote',
      content: JSON.stringify({
        type: 'voting_request',
        proposal,
      }),
      priority: 'high',
      requiresResponse: true,
    });

    // Set up voting deadline monitoring
    if (proposal.deadline) {
      const timeUntilDeadline = proposal.deadline.getTime() - Date.now();

      setTimeout(async () => {
        await this.handleVotingDeadline(proposal.id);
      }, timeUntilDeadline);
    }
  }

  /**
   * Validate a vote
   */
  private validateVote(vote: ConsensusVote, proposal: ConsensusProposal): boolean {
    // Check if voting is still open
    if (proposal.deadline && new Date() > proposal.deadline) {
      return false;
    }

    // Check if agent already voted
    // This would be checked in the database layer

    // Validate vote structure
    if (typeof vote.vote !== 'boolean') {
      return false;
    }

    return true;
  }

  /**
   * Check if consensus has been achieved
   */
  private async checkConsensus(proposal: ConsensusProposal): Promise<ConsensusResult> {
    const status = await this.getProposalStatus(proposal.id);

    const result: ConsensusResult = {
      proposalId: proposal.id,
      achieved: false,
      finalRatio: status.currentRatio,
      totalVotes: status.currentVotes,
      positiveVotes: Math.round(status.currentVotes * status.currentRatio),
      negativeVotes: status.currentVotes - Math.round(status.currentVotes * status.currentRatio),
      participationRate: status.totalVoters > 0 ? status.currentVotes / status.totalVoters : 0,
    };

    // Check if threshold met
    if (status.currentRatio >= proposal.requiredThreshold) {
      result.achieved = true;
      await this.handleConsensusAchieved(proposal, result);
    } else if (status.currentVotes === status.totalVoters) {
      // All votes are in but consensus not achieved
      await this.handleConsensusFailed(proposal, result);
    }

    return result;
  }

  /**
   * Handle consensus achieved
   */
  private async handleConsensusAchieved(
    proposal: ConsensusProposal,
    result: ConsensusResult,
  ): Promise<void> {
    // Update proposal status
    await this.store.updateConsensusStatus(proposal.id, 'achieved');

    // Remove from active proposals
    this.activeProposals.delete(proposal.id);

    // Update metrics
    this.metrics.achievedConsensus++;
    this.updateAverageMetrics(result);

    // Notify all agents
    await this.broadcastConsensusResult(proposal, result, true);

    // Execute consensus decision if applicable
    if (proposal.taskId) {
      await this.executeConsensusDecision(proposal, result);
    }

    this.emit('consensusAchieved', { proposal, result });
  }

  /**
   * Handle consensus failed
   */
  private async handleConsensusFailed(
    proposal: ConsensusProposal,
    result: ConsensusResult,
  ): Promise<void> {
    // Update proposal status
    await this.store.updateConsensusStatus(proposal.id, 'rejected');

    // Remove from active proposals
    this.activeProposals.delete(proposal.id);

    // Update metrics
    this.metrics.failedConsensus++;
    this.updateAverageMetrics(result);

    // Notify all agents
    await this.broadcastConsensusResult(proposal, result, false);

    this.emit('consensusFailed', { proposal, result });
  }

  /**
   * Handle voting deadline
   */
  private async handleVotingDeadline(proposalId: string): Promise<void> {
    const proposal = this.activeProposals.get(proposalId);
    if (!proposal) return;

    const result = await this.checkConsensus(proposal);

    if (!result.achieved) {
      await this.handleConsensusFailed(proposal, result);
    }
  }

  /**
   * Select voting strategy
   */
  private selectVotingStrategy(proposal: ConsensusProposal, agentType: string): VotingStrategy {
    // Select strategy based on threshold
    if (proposal.requiredThreshold >= 1.0) {
      return this.votingStrategies.get('unanimous')!;
    } else if (proposal.requiredThreshold >= 0.66) {
      return this.votingStrategies.get('supermajority')!;
    } else {
      return this.votingStrategies.get('simple_majority')!;
    }
  }

  /**
   * Update average metrics
   */
  private updateAverageMetrics(result: ConsensusResult): void {
    // Update average participation rate
    const totalDecisions = this.metrics.achievedConsensus + this.metrics.failedConsensus;
    this.metrics.avgParticipation =
      (this.metrics.avgParticipation * (totalDecisions - 1) + result.participationRate) /
      totalDecisions;
  }

  /**
   * Broadcast consensus result
   */
  private async broadcastConsensusResult(
    proposal: ConsensusProposal,
    result: ConsensusResult,
    achieved: boolean,
  ): Promise<void> {
    await this.store.createCommunication({
      fromAgentId: 'consensus-engine',
      toAgentId: undefined, // broadcast
      swarmId: proposal.swarmId,
      messageType: 'broadcast',
      content: JSON.stringify({
        type: 'consensus_result',
        proposal,
        result,
        achieved,
      }),
      priority: 'high',
      requiresResponse: false,
    });
  }

  /**
   * Execute consensus decision
   */
  private async executeConsensusDecision(
    proposal: ConsensusProposal,
    result: ConsensusResult,
  ): Promise<void> {
    if (!proposal.taskId) return;

    // Update task based on consensus decision
    const decision = proposal.proposal;

    if (decision.action === 'approve_task') {
      await this.store.updateTaskStatus(proposal.taskId, 'in_progress');
    } else if (decision.action === 'modify_task') {
      await this.store.updateTask(proposal.taskId, decision.modifications);
    } else if (decision.action === 'cancel_task') {
      await this.store.updateTaskStatus(proposal.taskId, 'cancelled');
    }

    this.emit('consensusExecuted', { proposal, result, taskId: proposal.taskId });
  }

  /**
   * Start proposal monitor
   */
  private startProposalMonitor(): void {
    setInterval(async () => {
      if (!this.isActive) return;

      try {
        // Check active proposals for updates
        for (const proposal of this.activeProposals.values()) {
          await this.checkConsensus(proposal);
        }
      } catch (error) {
        this.emit('error', error);
      }
    }, 5000); // Every 5 seconds
  }

  /**
   * Start timeout checker
   */
  private startTimeoutChecker(): void {
    setInterval(async () => {
      if (!this.isActive) return;

      try {
        const now = Date.now();

        for (const proposal of this.activeProposals.values()) {
          if (proposal.deadline && proposal.deadline.getTime() < now) {
            await this.handleVotingDeadline(proposal.id);
          }
        }
      } catch (error) {
        this.emit('error', error);
      }
    }, 1000); // Every second
  }

  /**
   * Start metrics collector
   */
  private startMetricsCollector(): void {
    setInterval(async () => {
      if (!this.isActive) return;

      try {
        // Calculate average voting time from active proposals' swarm
        const activeSwarmId = await this.store.getActiveSwarmId();
        if (!activeSwarmId) return;

        const recentProposals = await this.store.getRecentConsensusProposals(activeSwarmId, 10);

        if (recentProposals.length > 0) {
          const votingTimes = recentProposals
            .filter((p) => p.resolvedAt)
            .map((p) => (p.resolvedAt ?? p.createdAt) - p.createdAt);

          if (votingTimes.length > 0) {
            this.metrics.avgVotingTime =
              votingTimes.reduce((a, b) => a + b, 0) / votingTimes.length;
          }
        }

        // Store metrics
        await this.storeMetrics();
      } catch (error) {
        this.emit('error', error);
      }
    }, 60000); // Every minute
  }

  /**
   * Store consensus metrics
   */
  private async storeMetrics(): Promise<void> {
    await this.mcpWrapper.storeMemory({
      action: 'store',
      key: 'consensus-metrics',
      value: JSON.stringify(this.metrics),
      namespace: 'performance-metrics',
      ttl: 86400 * 30, // 30 days
    });
  }

  /**
   * Shutdown consensus engine
   */
  async shutdown(): Promise<void> {
    this.isActive = false;

    // Clear active proposals
    this.activeProposals.clear();

    this.emit('shutdown');
  }
}
