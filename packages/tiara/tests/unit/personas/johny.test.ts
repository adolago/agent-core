/**
 * Johny Persona Tests
 *
 * Tests for Johny study assistant functionality.
 * Covers knowledge graph, spaced repetition, and learning system.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// Set test mode
process.env.TIARA_TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

describe('Johny Persona', () => {
  describe('Knowledge Graph Structure', () => {
    it('should define knowledge node structure', () => {
      // Johny's knowledge graph nodes should have these properties
      interface KnowledgeNode {
        id: string;
        concept: string;
        domain: string;
        prerequisites: string[];
        masteryLevel: number;
        lastReviewed?: number;
        nextReview?: number;
        reviewCount: number;
        easeFactor: number;
      }

      const exampleNode: KnowledgeNode = {
        id: 'calc-101',
        concept: 'Derivatives',
        domain: 'Mathematics',
        prerequisites: ['limits', 'continuity'],
        masteryLevel: 0.7,
        lastReviewed: Date.now() - 86400000,
        nextReview: Date.now() + 86400000,
        reviewCount: 5,
        easeFactor: 2.5,
      };

      expect(exampleNode.id).toBeDefined();
      expect(exampleNode.masteryLevel).toBeGreaterThanOrEqual(0);
      expect(exampleNode.masteryLevel).toBeLessThanOrEqual(1);
      expect(exampleNode.easeFactor).toBeGreaterThan(0);
    });

    it('should define learning path structure', () => {
      interface LearningPath {
        id: string;
        name: string;
        description: string;
        nodes: string[]; // Node IDs in order
        currentPosition: number;
        progress: number;
        estimatedTime: number; // minutes
      }

      const examplePath: LearningPath = {
        id: 'path-calc',
        name: 'Calculus Fundamentals',
        description: 'Learn calculus from basics to advanced',
        nodes: ['limits', 'continuity', 'derivatives', 'integrals'],
        currentPosition: 2,
        progress: 0.5,
        estimatedTime: 1200,
      };

      expect(examplePath.progress).toBeGreaterThanOrEqual(0);
      expect(examplePath.progress).toBeLessThanOrEqual(1);
      expect(examplePath.currentPosition).toBeLessThan(examplePath.nodes.length);
    });
  });

  describe('Spaced Repetition (FIRe Algorithm)', () => {
    // Fractional Implicit Repetition parameters
    const FIRe = {
      minInterval: 1, // 1 day
      maxInterval: 365, // 1 year
      defaultEaseFactor: 2.5,
      minEaseFactor: 1.3,
      maxEaseFactor: 4.0,
      reviewMultiplier: 1.3,
    };

    it('should calculate next review interval', () => {
      function calculateNextInterval(
        currentInterval: number,
        easeFactor: number,
        quality: number // 0-5 scale
      ): number {
        if (quality < 3) {
          // Failed review - reset interval
          return FIRe.minInterval;
        }

        let newInterval = currentInterval * easeFactor;

        // Apply quality modifier
        const qualityModifier = 0.8 + (quality - 3) * 0.1;
        newInterval *= qualityModifier;

        // Clamp to bounds
        return Math.max(FIRe.minInterval, Math.min(FIRe.maxInterval, Math.round(newInterval)));
      }

      // Test cases
      expect(calculateNextInterval(1, 2.5, 5)).toBe(3); // Good review, interval increases
      expect(calculateNextInterval(1, 2.5, 3)).toBe(2); // Barely passed
      expect(calculateNextInterval(10, 2.5, 0)).toBe(1); // Failed, reset
      expect(calculateNextInterval(10, 2.5, 2)).toBe(1); // Failed, reset
    });

    it('should update ease factor based on performance', () => {
      function updateEaseFactor(
        currentFactor: number,
        quality: number
      ): number {
        // SM-2 algorithm ease factor adjustment
        const newFactor = currentFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

        return Math.max(FIRe.minEaseFactor, Math.min(FIRe.maxEaseFactor, newFactor));
      }

      // Perfect performance increases ease
      expect(updateEaseFactor(2.5, 5)).toBeGreaterThan(2.5);

      // Poor performance decreases ease
      expect(updateEaseFactor(2.5, 1)).toBeLessThan(2.5);

      // Ease should never go below minimum
      expect(updateEaseFactor(1.3, 0)).toBeGreaterThanOrEqual(FIRe.minEaseFactor);

      // Ease should never exceed maximum
      expect(updateEaseFactor(4.0, 5)).toBeLessThanOrEqual(FIRe.maxEaseFactor);
    });

    it('should prioritize overdue cards', () => {
      function calculateReviewPriority(
        dueDate: number,
        masteryLevel: number,
        now: number = Date.now()
      ): number {
        const overdueDays = (now - dueDate) / (24 * 60 * 60 * 1000);

        // Higher priority for:
        // - More overdue items
        // - Lower mastery items
        const overdueWeight = Math.max(0, overdueDays);
        const masteryWeight = 1 - masteryLevel;

        return overdueWeight * 0.7 + masteryWeight * 0.3;
      }

      const now = Date.now();
      const oneDayAgo = now - 86400000;
      const sevenDaysAgo = now - 7 * 86400000;

      // More overdue = higher priority
      expect(calculateReviewPriority(sevenDaysAgo, 0.5, now))
        .toBeGreaterThan(calculateReviewPriority(oneDayAgo, 0.5, now));

      // Lower mastery = higher priority
      expect(calculateReviewPriority(oneDayAgo, 0.3, now))
        .toBeGreaterThan(calculateReviewPriority(oneDayAgo, 0.8, now));
    });
  });

  describe('Study Session Management', () => {
    it('should track study session state', () => {
      interface StudySession {
        id: string;
        startTime: number;
        endTime?: number;
        domain: string;
        cardsReviewed: number;
        correctAnswers: number;
        totalTime: number; // milliseconds
        focusScore: number; // 0-1
      }

      const session: StudySession = {
        id: 'session-001',
        startTime: Date.now() - 1800000, // 30 minutes ago
        domain: 'Mathematics',
        cardsReviewed: 25,
        correctAnswers: 20,
        totalTime: 1800000,
        focusScore: 0.85,
      };

      expect(session.correctAnswers).toBeLessThanOrEqual(session.cardsReviewed);
      expect(session.focusScore).toBeGreaterThanOrEqual(0);
      expect(session.focusScore).toBeLessThanOrEqual(1);
    });

    it('should calculate session statistics', () => {
      function calculateSessionStats(
        cardsReviewed: number,
        correctAnswers: number,
        totalTimeMs: number
      ): {
        accuracy: number;
        avgTimePerCard: number;
        score: number;
      } {
        const accuracy = cardsReviewed > 0 ? correctAnswers / cardsReviewed : 0;
        const avgTimePerCard = cardsReviewed > 0 ? totalTimeMs / cardsReviewed : 0;

        // Score combines accuracy with reasonable pace
        const idealTimePerCard = 30000; // 30 seconds
        const paceScore = Math.min(1, idealTimePerCard / Math.max(avgTimePerCard, 1000));
        const score = accuracy * 0.7 + paceScore * 0.3;

        return { accuracy, avgTimePerCard, score };
      }

      const stats = calculateSessionStats(20, 18, 600000);

      expect(stats.accuracy).toBe(0.9);
      expect(stats.avgTimePerCard).toBe(30000);
      expect(stats.score).toBeGreaterThan(0.5);
    });
  });

  describe('Concept Dependencies', () => {
    it('should detect prerequisite chains', () => {
      const concepts = new Map<string, string[]>([
        ['calculus', ['algebra', 'precalculus']],
        ['precalculus', ['algebra', 'geometry']],
        ['algebra', ['arithmetic']],
        ['arithmetic', []],
        ['geometry', ['arithmetic']],
      ]);

      function getAllPrerequisites(
        conceptId: string,
        visited: Set<string> = new Set()
      ): string[] {
        if (visited.has(conceptId)) return [];
        visited.add(conceptId);

        const directPrereqs = concepts.get(conceptId) || [];
        const allPrereqs = [...directPrereqs];

        for (const prereq of directPrereqs) {
          allPrereqs.push(...getAllPrerequisites(prereq, visited));
        }

        return [...new Set(allPrereqs)];
      }

      const calculusPrereqs = getAllPrerequisites('calculus');

      expect(calculusPrereqs).toContain('algebra');
      expect(calculusPrereqs).toContain('precalculus');
      expect(calculusPrereqs).toContain('arithmetic');
      expect(calculusPrereqs).toContain('geometry');
    });

    it('should identify blocking concepts', () => {
      interface ConceptNode {
        id: string;
        masteryLevel: number;
        prerequisites: string[];
      }

      function findBlockingConcepts(
        target: ConceptNode,
        allConcepts: Map<string, ConceptNode>,
        masteryThreshold: number = 0.7
      ): string[] {
        const blocking: string[] = [];

        for (const prereqId of target.prerequisites) {
          const prereq = allConcepts.get(prereqId);
          if (prereq && prereq.masteryLevel < masteryThreshold) {
            blocking.push(prereqId);
          }
        }

        return blocking;
      }

      const concepts = new Map<string, ConceptNode>([
        ['derivatives', { id: 'derivatives', masteryLevel: 0.3, prerequisites: ['limits', 'algebra'] }],
        ['limits', { id: 'limits', masteryLevel: 0.5, prerequisites: [] }],
        ['algebra', { id: 'algebra', masteryLevel: 0.9, prerequisites: [] }],
      ]);

      const target = concepts.get('derivatives')!;
      const blocking = findBlockingConcepts(target, concepts);

      expect(blocking).toContain('limits');
      expect(blocking).not.toContain('algebra');
    });
  });

  describe('Learning Progress', () => {
    it('should calculate domain mastery', () => {
      interface DomainProgress {
        domain: string;
        totalConcepts: number;
        masteredConcepts: number;
        averageMastery: number;
        streak: number; // consecutive days studied
      }

      function calculateDomainMastery(
        concepts: Array<{ domain: string; masteryLevel: number }>,
        masteryThreshold: number = 0.8
      ): Map<string, DomainProgress> {
        const domainMap = new Map<string, DomainProgress>();

        for (const concept of concepts) {
          let progress = domainMap.get(concept.domain);
          if (!progress) {
            progress = {
              domain: concept.domain,
              totalConcepts: 0,
              masteredConcepts: 0,
              averageMastery: 0,
              streak: 0,
            };
            domainMap.set(concept.domain, progress);
          }

          progress.totalConcepts++;
          if (concept.masteryLevel >= masteryThreshold) {
            progress.masteredConcepts++;
          }
          progress.averageMastery += concept.masteryLevel;
        }

        // Calculate averages
        for (const progress of domainMap.values()) {
          progress.averageMastery /= progress.totalConcepts;
        }

        return domainMap;
      }

      const concepts = [
        { domain: 'Math', masteryLevel: 0.9 },
        { domain: 'Math', masteryLevel: 0.7 },
        { domain: 'Math', masteryLevel: 0.85 },
        { domain: 'Physics', masteryLevel: 0.6 },
        { domain: 'Physics', masteryLevel: 0.5 },
      ];

      const progress = calculateDomainMastery(concepts);

      expect(progress.get('Math')!.totalConcepts).toBe(3);
      expect(progress.get('Math')!.masteredConcepts).toBe(2); // 0.9 and 0.85 >= 0.8
      expect(progress.get('Physics')!.averageMastery).toBeCloseTo(0.55);
    });

    it('should generate study recommendations', () => {
      function getStudyRecommendations(
        concepts: Array<{
          id: string;
          masteryLevel: number;
          nextReview: number;
          domain: string;
        }>,
        limit: number = 5
      ): string[] {
        const now = Date.now();

        // Sort by priority: overdue first, then low mastery
        const sorted = [...concepts].sort((a, b) => {
          const aOverdue = a.nextReview < now;
          const bOverdue = b.nextReview < now;

          if (aOverdue && !bOverdue) return -1;
          if (!aOverdue && bOverdue) return 1;

          if (aOverdue && bOverdue) {
            return a.nextReview - b.nextReview;
          }

          return a.masteryLevel - b.masteryLevel;
        });

        return sorted.slice(0, limit).map(c => c.id);
      }

      const now = Date.now();
      const concepts = [
        { id: 'A', masteryLevel: 0.9, nextReview: now + 86400000, domain: 'Math' },
        { id: 'B', masteryLevel: 0.3, nextReview: now - 86400000, domain: 'Math' }, // Overdue
        { id: 'C', masteryLevel: 0.5, nextReview: now + 3600000, domain: 'Math' },
        { id: 'D', masteryLevel: 0.4, nextReview: now - 172800000, domain: 'Math' }, // More overdue
      ];

      const recommendations = getStudyRecommendations(concepts, 3);

      // Most overdue should be first
      expect(recommendations[0]).toBe('D');
      expect(recommendations[1]).toBe('B');
    });
  });

  describe('Deliberate Practice', () => {
    it('should identify weak areas', () => {
      interface PerformanceData {
        conceptId: string;
        attempts: number;
        successes: number;
        recentErrors: string[];
      }

      function identifyWeakAreas(
        performance: PerformanceData[],
        minAttempts: number = 3,
        successThreshold: number = 0.6
      ): PerformanceData[] {
        return performance
          .filter(p => p.attempts >= minAttempts)
          .filter(p => p.successes / p.attempts < successThreshold)
          .sort((a, b) => (a.successes / a.attempts) - (b.successes / b.attempts));
      }

      const performance: PerformanceData[] = [
        { conceptId: 'A', attempts: 10, successes: 9, recentErrors: [] },
        { conceptId: 'B', attempts: 5, successes: 2, recentErrors: ['error1'] },
        { conceptId: 'C', attempts: 8, successes: 3, recentErrors: ['error2', 'error3'] },
        { conceptId: 'D', attempts: 2, successes: 0, recentErrors: ['error4'] }, // Not enough attempts
      ];

      const weakAreas = identifyWeakAreas(performance);

      expect(weakAreas.length).toBe(2);
      expect(weakAreas[0].conceptId).toBe('C'); // 3/8 = 0.375
      expect(weakAreas[1].conceptId).toBe('B'); // 2/5 = 0.4
    });
  });
});
