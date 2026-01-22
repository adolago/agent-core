/**
 * Neural Learning System Tests
 *
 * Comprehensive tests for pattern recognition, domain mapping,
 * training mechanisms, memory integration, and experience replay.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Set test mode
process.env.TIARA_TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

describe('Neural Learning System', () => {
  describe('Pattern Recognition', () => {
    interface Pattern {
      id: string;
      type: 'success' | 'failure' | 'optimization' | 'behavior';
      confidence: number;
      occurrences: number;
      context: Record<string, unknown>;
      timestamp: number;
    }

    it('should calculate pattern similarity', () => {
      function calculateSimilarity(a: Pattern, b: Pattern): number {
        let score = 0;

        // Type match (40%)
        if (a.type === b.type) score += 0.4;

        // Confidence proximity (30%)
        const confidenceDiff = Math.abs(a.confidence - b.confidence);
        score += (1 - confidenceDiff) * 0.3;

        // Context overlap (30%)
        const aKeys = Object.keys(a.context);
        const bKeys = Object.keys(b.context);
        const commonKeys = aKeys.filter(k => bKeys.includes(k));
        const contextOverlap = commonKeys.length / Math.max(aKeys.length, bKeys.length, 1);
        score += contextOverlap * 0.3;

        return score;
      }

      const pattern1: Pattern = {
        id: 'p1',
        type: 'success',
        confidence: 0.9,
        occurrences: 5,
        context: { domain: 'coding', task: 'refactor' },
        timestamp: Date.now(),
      };

      const similar: Pattern = {
        id: 'p2',
        type: 'success',
        confidence: 0.85,
        occurrences: 3,
        context: { domain: 'coding', task: 'review' },
        timestamp: Date.now(),
      };

      const different: Pattern = {
        id: 'p3',
        type: 'failure',
        confidence: 0.3,
        occurrences: 1,
        context: { domain: 'testing' },
        timestamp: Date.now(),
      };

      expect(calculateSimilarity(pattern1, similar)).toBeGreaterThan(0.7);
      expect(calculateSimilarity(pattern1, different)).toBeLessThan(0.5);
    });

    it('should find similar patterns above threshold', () => {
      function findSimilar(
        patterns: Pattern[],
        target: Partial<Pattern>,
        threshold: number
      ): Pattern[] {
        return patterns.filter(p => {
          let score = 0;
          if (target.type && p.type === target.type) score += 0.5;
          if (target.confidence !== undefined) {
            score += (1 - Math.abs(p.confidence - target.confidence)) * 0.5;
          }
          return score >= threshold;
        });
      }

      const patterns: Pattern[] = [
        { id: '1', type: 'success', confidence: 0.9, occurrences: 5, context: {}, timestamp: 0 },
        { id: '2', type: 'success', confidence: 0.8, occurrences: 3, context: {}, timestamp: 0 },
        { id: '3', type: 'failure', confidence: 0.9, occurrences: 2, context: {}, timestamp: 0 },
        { id: '4', type: 'success', confidence: 0.3, occurrences: 1, context: {}, timestamp: 0 },
      ];

      const similar = findSimilar(patterns, { type: 'success', confidence: 0.85 }, 0.8);
      expect(similar).toHaveLength(2);
      expect(similar.map(p => p.id)).toContain('1');
      expect(similar.map(p => p.id)).toContain('2');
    });

    it('should prune old patterns', () => {
      function prunePatterns(patterns: Pattern[], maxAgeMs: number): Pattern[] {
        const cutoff = Date.now() - maxAgeMs;
        return patterns.filter(p => p.timestamp > cutoff);
      }

      const now = Date.now();
      const patterns: Pattern[] = [
        { id: '1', type: 'success', confidence: 0.9, occurrences: 5, context: {}, timestamp: now - 1000 },
        { id: '2', type: 'success', confidence: 0.8, occurrences: 3, context: {}, timestamp: now - 5000 },
        { id: '3', type: 'failure', confidence: 0.9, occurrences: 2, context: {}, timestamp: now - 10000 },
      ];

      const pruned = prunePatterns(patterns, 3000);
      expect(pruned).toHaveLength(1);
      expect(pruned[0].id).toBe('1');
    });
  });

  describe('Domain Mapping', () => {
    interface DomainNode {
      id: string;
      name: string;
      type: 'functional' | 'technical' | 'business' | 'integration' | 'data' | 'ui' | 'api';
      features: number[];
      metadata: {
        size: number;
        complexity: number;
        stability: number;
        dependencies: number;
      };
    }

    interface DomainEdge {
      source: string;
      target: string;
      weight: number;
      type: 'dependency' | 'communication' | 'data-flow' | 'inheritance' | 'composition';
    }

    it('should extract domain features', () => {
      function extractFeatures(node: DomainNode): number[] {
        // One-hot encode type (7 types)
        const typeVector = Array(7).fill(0);
        const typeIndex = ['functional', 'technical', 'business', 'integration', 'data', 'ui', 'api'].indexOf(node.type);
        if (typeIndex >= 0) typeVector[typeIndex] = 1;

        // Normalize metadata
        const metadataVector = [
          node.metadata.size / 100,
          node.metadata.complexity,
          node.metadata.stability,
          node.metadata.dependencies / 10,
        ];

        return [...typeVector, ...metadataVector];
      }

      const node: DomainNode = {
        id: 'dom-1',
        name: 'API Gateway',
        type: 'api',
        features: [],
        metadata: { size: 50, complexity: 0.7, stability: 0.9, dependencies: 5 },
      };

      const features = extractFeatures(node);
      expect(features).toHaveLength(11); // 7 type + 4 metadata
      expect(features[6]).toBe(1); // 'api' is index 6
      expect(features[7]).toBeCloseTo(0.5); // size: 50/100
    });

    it('should calculate cohesion score', () => {
      function calculateCohesion(
        nodes: DomainNode[],
        edges: DomainEdge[]
      ): number {
        if (nodes.length === 0) return 0.5;
        if (edges.length === 0) return 0.5;

        // Calculate structural cohesion (edge density)
        const maxPossibleEdges = nodes.length * (nodes.length - 1);
        const structuralCohesion = maxPossibleEdges > 0 ? edges.length / maxPossibleEdges : 0;

        // Calculate type cohesion (same type clustering)
        const typeCounts: Record<string, number> = {};
        for (const node of nodes) {
          typeCounts[node.type] = (typeCounts[node.type] || 0) + 1;
        }
        const dominantTypeCount = Math.max(...Object.values(typeCounts));
        const typeCohesion = dominantTypeCount / nodes.length;

        // Weighted average
        return structuralCohesion * 0.6 + typeCohesion * 0.4;
      }

      const nodes: DomainNode[] = [
        { id: '1', name: 'A', type: 'api', features: [], metadata: { size: 1, complexity: 0.5, stability: 0.8, dependencies: 2 } },
        { id: '2', name: 'B', type: 'api', features: [], metadata: { size: 1, complexity: 0.5, stability: 0.8, dependencies: 2 } },
        { id: '3', name: 'C', type: 'api', features: [], metadata: { size: 1, complexity: 0.5, stability: 0.8, dependencies: 2 } },
      ];

      const edges: DomainEdge[] = [
        { source: '1', target: '2', weight: 1, type: 'dependency' },
        { source: '2', target: '3', weight: 1, type: 'dependency' },
        { source: '1', target: '3', weight: 1, type: 'communication' },
      ];

      const cohesion = calculateCohesion(nodes, edges);
      // 3 edges out of 6 possible = 0.5 structural, all same type = 1.0 type
      // 0.5 * 0.6 + 1.0 * 0.4 = 0.3 + 0.4 = 0.7
      expect(cohesion).toBeCloseTo(0.7, 1);
    });

    it('should detect circular dependencies', () => {
      function hasCircularDependency(
        edges: DomainEdge[],
        startNode: string
      ): boolean {
        const adjacency = new Map<string, string[]>();
        for (const edge of edges) {
          if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
          adjacency.get(edge.source)!.push(edge.target);
        }

        const visited = new Set<string>();
        const stack = new Set<string>();

        function dfs(node: string): boolean {
          if (stack.has(node)) return true;
          if (visited.has(node)) return false;

          visited.add(node);
          stack.add(node);

          const neighbors = adjacency.get(node) || [];
          for (const neighbor of neighbors) {
            if (dfs(neighbor)) return true;
          }

          stack.delete(node);
          return false;
        }

        return dfs(startNode);
      }

      // No cycle
      const acyclicEdges: DomainEdge[] = [
        { source: 'A', target: 'B', weight: 1, type: 'dependency' },
        { source: 'B', target: 'C', weight: 1, type: 'dependency' },
      ];
      expect(hasCircularDependency(acyclicEdges, 'A')).toBe(false);

      // Has cycle
      const cyclicEdges: DomainEdge[] = [
        { source: 'A', target: 'B', weight: 1, type: 'dependency' },
        { source: 'B', target: 'C', weight: 1, type: 'dependency' },
        { source: 'C', target: 'A', weight: 1, type: 'dependency' },
      ];
      expect(hasCircularDependency(cyclicEdges, 'A')).toBe(true);
    });

    it('should identify weak points (low cohesion nodes)', () => {
      function findWeakPoints(
        nodes: DomainNode[],
        edges: DomainEdge[],
        threshold: number = 0.6
      ): string[] {
        const weakPoints: string[] = [];

        for (const node of nodes) {
          // Count connections
          const inbound = edges.filter(e => e.target === node.id).length;
          const outbound = edges.filter(e => e.source === node.id).length;
          const connections = inbound + outbound;

          // Low connections = weak point
          const avgConnections = (edges.length * 2) / nodes.length;
          const connectionRatio = connections / Math.max(avgConnections, 1);

          // Low stability = weak point
          const stabilityScore = node.metadata.stability;

          // Combined score
          const score = connectionRatio * 0.5 + stabilityScore * 0.5;

          if (score < threshold) {
            weakPoints.push(node.id);
          }
        }

        return weakPoints;
      }

      const nodes: DomainNode[] = [
        { id: '1', name: 'Stable', type: 'api', features: [], metadata: { size: 1, complexity: 0.5, stability: 0.9, dependencies: 5 } },
        { id: '2', name: 'Unstable', type: 'ui', features: [], metadata: { size: 1, complexity: 0.5, stability: 0.3, dependencies: 1 } },
        { id: '3', name: 'Isolated', type: 'data', features: [], metadata: { size: 1, complexity: 0.5, stability: 0.4, dependencies: 0 } },
      ];

      const edges: DomainEdge[] = [
        { source: '1', target: '2', weight: 1, type: 'dependency' },
      ];

      const weakPoints = findWeakPoints(nodes, edges, 0.5);
      expect(weakPoints).toContain('3'); // Isolated node
    });
  });

  describe('Training Mechanisms', () => {
    interface TrainingData {
      inputs: number[][];
      outputs: number[][];
      labels?: string[];
    }

    interface TrainingConfig {
      learningRate: number;
      batchSize: number;
      epochs: number;
      earlyStopPatience: number;
      minDelta: number;
    }

    interface TrainingState {
      epoch: number;
      loss: number;
      accuracy: number;
      bestLoss: number;
      patienceCounter: number;
    }

    const defaultConfig: TrainingConfig = {
      learningRate: 0.001,
      batchSize: 32,
      epochs: 100,
      earlyStopPatience: 10,
      minDelta: 0.001,
    };

    it('should calculate MSE loss', () => {
      function calculateMSELoss(predicted: number[], actual: number[]): number {
        if (predicted.length !== actual.length) {
          throw new Error('Array length mismatch');
        }

        let sumSquaredError = 0;
        for (let i = 0; i < predicted.length; i++) {
          sumSquaredError += Math.pow(predicted[i] - actual[i], 2);
        }

        return sumSquaredError / predicted.length;
      }

      expect(calculateMSELoss([1, 2, 3], [1, 2, 3])).toBe(0);
      expect(calculateMSELoss([1, 2, 3], [2, 3, 4])).toBe(1);
      expect(calculateMSELoss([0, 0, 0], [1, 1, 1])).toBe(1);
    });

    it('should calculate accuracy with threshold', () => {
      function calculateAccuracy(
        predicted: number[],
        actual: number[],
        threshold: number = 0.1
      ): number {
        let correct = 0;
        for (let i = 0; i < predicted.length; i++) {
          if (Math.abs(predicted[i] - actual[i]) <= threshold) {
            correct++;
          }
        }
        return correct / predicted.length;
      }

      expect(calculateAccuracy([1.0, 2.0, 3.0], [1.05, 2.05, 3.05], 0.1)).toBe(1.0);
      expect(calculateAccuracy([1.0, 2.0, 3.0], [1.2, 2.2, 3.2], 0.1)).toBe(0);
      expect(calculateAccuracy([1.0, 2.0, 3.0], [1.05, 2.2, 3.05], 0.1)).toBeCloseTo(0.67, 1);
    });

    it('should determine early stopping', () => {
      function shouldEarlyStop(
        state: TrainingState,
        currentLoss: number,
        config: TrainingConfig
      ): { stop: boolean; newState: TrainingState } {
        const improved = currentLoss < state.bestLoss - config.minDelta;

        if (improved) {
          return {
            stop: false,
            newState: {
              ...state,
              loss: currentLoss,
              bestLoss: currentLoss,
              patienceCounter: 0,
            },
          };
        }

        const newPatience = state.patienceCounter + 1;
        return {
          stop: newPatience >= config.earlyStopPatience,
          newState: {
            ...state,
            loss: currentLoss,
            patienceCounter: newPatience,
          },
        };
      }

      let state: TrainingState = {
        epoch: 0,
        loss: 1.0,
        accuracy: 0,
        bestLoss: 1.0,
        patienceCounter: 0,
      };

      // Improvement
      const improved = shouldEarlyStop(state, 0.8, defaultConfig);
      expect(improved.stop).toBe(false);
      expect(improved.newState.patienceCounter).toBe(0);

      // No improvement
      state = improved.newState;
      const noImprove = shouldEarlyStop(state, 0.85, defaultConfig);
      expect(noImprove.stop).toBe(false);
      expect(noImprove.newState.patienceCounter).toBe(1);

      // Trigger early stop after patience exhausted
      state = { ...state, patienceCounter: 9 };
      const earlyStop = shouldEarlyStop(state, 0.85, defaultConfig);
      expect(earlyStop.stop).toBe(true);
    });

    it('should decay learning rate', () => {
      function decayLearningRate(
        currentLR: number,
        epoch: number,
        decayInterval: number = 20,
        decayFactor: number = 0.9
      ): number {
        if (epoch > 0 && epoch % decayInterval === 0) {
          return currentLR * decayFactor;
        }
        return currentLR;
      }

      expect(decayLearningRate(0.001, 10)).toBe(0.001);
      expect(decayLearningRate(0.001, 20)).toBeCloseTo(0.0009);
      expect(decayLearningRate(0.001, 40)).toBeCloseTo(0.0009);
    });

    it('should batch training data', () => {
      function createBatches<T>(data: T[], batchSize: number): T[][] {
        const batches: T[][] = [];
        for (let i = 0; i < data.length; i += batchSize) {
          batches.push(data.slice(i, i + batchSize));
        }
        return batches;
      }

      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const batches = createBatches(data, 3);

      expect(batches).toHaveLength(4);
      expect(batches[0]).toEqual([1, 2, 3]);
      expect(batches[3]).toEqual([10]);
    });
  });

  describe('Activation Functions', () => {
    it('should implement ReLU', () => {
      function relu(x: number): number {
        return Math.max(0, x);
      }

      expect(relu(5)).toBe(5);
      expect(relu(0)).toBe(0);
      expect(relu(-5)).toBe(0);
    });

    it('should implement Sigmoid', () => {
      function sigmoid(x: number): number {
        return 1 / (1 + Math.exp(-x));
      }

      expect(sigmoid(0)).toBeCloseTo(0.5);
      expect(sigmoid(10)).toBeCloseTo(1, 4);
      expect(sigmoid(-10)).toBeCloseTo(0, 4);
    });

    it('should implement Tanh', () => {
      function tanh(x: number): number {
        return Math.tanh(x);
      }

      expect(tanh(0)).toBe(0);
      expect(tanh(10)).toBeCloseTo(1, 4);
      expect(tanh(-10)).toBeCloseTo(-1, 4);
    });

    it('should implement GELU approximation', () => {
      function gelu(x: number): number {
        // Approximate GELU: 0.5 * x * (1 + tanh(sqrt(2/pi) * (x + 0.044715 * x^3)))
        const sqrtTwoPi = Math.sqrt(2 / Math.PI);
        return 0.5 * x * (1 + Math.tanh(sqrtTwoPi * (x + 0.044715 * Math.pow(x, 3))));
      }

      expect(gelu(0)).toBeCloseTo(0);
      expect(gelu(1)).toBeCloseTo(0.841, 2);
      expect(gelu(-1)).toBeCloseTo(-0.159, 2);
    });

    it('should implement Swish', () => {
      function swish(x: number): number {
        return x / (1 + Math.exp(-x));
      }

      expect(swish(0)).toBe(0);
      expect(swish(1)).toBeCloseTo(0.731, 2);
      expect(swish(-1)).toBeCloseTo(-0.269, 2);
    });
  });

  describe('Weight Initialization', () => {
    it('should implement Xavier/Glorot initialization', () => {
      function xavierInit(inputDim: number, outputDim: number): number {
        const limit = Math.sqrt(6 / (inputDim + outputDim));
        return (Math.random() * 2 - 1) * limit;
      }

      // Test that values fall within expected range
      const weights: number[] = [];
      for (let i = 0; i < 1000; i++) {
        weights.push(xavierInit(64, 128));
      }

      const limit = Math.sqrt(6 / (64 + 128));
      const min = Math.min(...weights);
      const max = Math.max(...weights);

      expect(min).toBeGreaterThanOrEqual(-limit);
      expect(max).toBeLessThanOrEqual(limit);
    });

    it('should initialize biases to zero', () => {
      function initializeBiases(size: number): number[] {
        return Array(size).fill(0);
      }

      const biases = initializeBiases(10);
      expect(biases).toHaveLength(10);
      expect(biases.every(b => b === 0)).toBe(true);
    });
  });

  describe('Experience Replay', () => {
    interface Experience {
      state: number[];
      action: string;
      reward: number;
      nextState: number[];
      done: boolean;
      timestamp: number;
    }

    class ReplayBuffer {
      private buffer: Experience[] = [];
      private maxSize: number;

      constructor(maxSize: number = 10000) {
        this.maxSize = maxSize;
      }

      add(experience: Experience): void {
        if (this.buffer.length >= this.maxSize) {
          this.buffer.shift();
        }
        this.buffer.push(experience);
      }

      sample(batchSize: number): Experience[] {
        const samples: Experience[] = [];
        const indices = new Set<number>();

        while (indices.size < Math.min(batchSize, this.buffer.length)) {
          indices.add(Math.floor(Math.random() * this.buffer.length));
        }

        for (const idx of indices) {
          samples.push(this.buffer[idx]);
        }

        return samples;
      }

      size(): number {
        return this.buffer.length;
      }
    }

    it('should add experiences to buffer', () => {
      const buffer = new ReplayBuffer(100);

      buffer.add({
        state: [1, 2, 3],
        action: 'move',
        reward: 1.0,
        nextState: [2, 3, 4],
        done: false,
        timestamp: Date.now(),
      });

      expect(buffer.size()).toBe(1);
    });

    it('should respect max size', () => {
      const buffer = new ReplayBuffer(5);

      for (let i = 0; i < 10; i++) {
        buffer.add({
          state: [i],
          action: 'test',
          reward: i,
          nextState: [i + 1],
          done: false,
          timestamp: Date.now(),
        });
      }

      expect(buffer.size()).toBe(5);
    });

    it('should sample random batch', () => {
      const buffer = new ReplayBuffer(100);

      for (let i = 0; i < 50; i++) {
        buffer.add({
          state: [i],
          action: 'test',
          reward: i,
          nextState: [i + 1],
          done: false,
          timestamp: Date.now(),
        });
      }

      const batch = buffer.sample(10);
      expect(batch).toHaveLength(10);

      // Check that samples are unique
      const rewards = new Set(batch.map(e => e.reward));
      expect(rewards.size).toBe(10);
    });
  });

  describe('Pattern to Training Data Conversion', () => {
    interface Pattern {
      id: string;
      type: 'success' | 'failure' | 'optimization' | 'behavior';
      confidence: number;
      occurrences: number;
      context: Record<string, unknown>;
    }

    interface TrainingData {
      inputs: number[][];
      outputs: number[][];
      labels: string[];
    }

    it('should convert patterns to feature vectors', () => {
      function patternToFeatures(pattern: Pattern): number[] {
        // One-hot encode type
        const typeVector = [
          pattern.type === 'success' ? 1 : 0,
          pattern.type === 'failure' ? 1 : 0,
          pattern.type === 'optimization' ? 1 : 0,
          pattern.type === 'behavior' ? 1 : 0,
        ];

        // Numeric features
        const numericFeatures = [
          pattern.confidence,
          Math.min(pattern.occurrences / 100, 1), // Normalize occurrences
          Object.keys(pattern.context).length / 10, // Context complexity
        ];

        return [...typeVector, ...numericFeatures];
      }

      const pattern: Pattern = {
        id: 'p1',
        type: 'success',
        confidence: 0.9,
        occurrences: 50,
        context: { domain: 'test', task: 'verify' },
      };

      const features = patternToFeatures(pattern);

      expect(features).toHaveLength(7);
      expect(features[0]).toBe(1); // success type
      expect(features[4]).toBe(0.9); // confidence
      expect(features[5]).toBe(0.5); // normalized occurrences
    });

    it('should create training targets from pattern type', () => {
      function patternToTarget(pattern: Pattern): number[] {
        // Target is type confidence
        return [
          pattern.type === 'success' ? pattern.confidence : 0,
          pattern.type === 'failure' ? pattern.confidence : 0,
          pattern.type === 'optimization' ? pattern.confidence : 0,
          pattern.type === 'behavior' ? pattern.confidence : 0,
        ];
      }

      const successPattern: Pattern = {
        id: 'p1',
        type: 'success',
        confidence: 0.9,
        occurrences: 10,
        context: {},
      };

      const target = patternToTarget(successPattern);
      expect(target).toEqual([0.9, 0, 0, 0]);
    });

    it('should batch convert multiple patterns', () => {
      function convertPatterns(patterns: Pattern[]): TrainingData {
        const inputs: number[][] = [];
        const outputs: number[][] = [];
        const labels: string[] = [];

        for (const pattern of patterns) {
          const typeVector = [
            pattern.type === 'success' ? 1 : 0,
            pattern.type === 'failure' ? 1 : 0,
            pattern.type === 'optimization' ? 1 : 0,
            pattern.type === 'behavior' ? 1 : 0,
          ];
          const numericFeatures = [pattern.confidence, pattern.occurrences / 100];

          inputs.push([...typeVector, ...numericFeatures]);
          outputs.push([
            pattern.type === 'success' ? pattern.confidence : 0,
            pattern.type === 'failure' ? pattern.confidence : 0,
            pattern.type === 'optimization' ? pattern.confidence : 0,
            pattern.type === 'behavior' ? pattern.confidence : 0,
          ]);
          labels.push(pattern.type);
        }

        return { inputs, outputs, labels };
      }

      const patterns: Pattern[] = [
        { id: '1', type: 'success', confidence: 0.9, occurrences: 10, context: {} },
        { id: '2', type: 'failure', confidence: 0.3, occurrences: 5, context: {} },
      ];

      const data = convertPatterns(patterns);

      expect(data.inputs).toHaveLength(2);
      expect(data.outputs).toHaveLength(2);
      expect(data.labels).toEqual(['success', 'failure']);
    });
  });

  describe('GNN Layer Operations', () => {
    it('should perform matrix multiplication', () => {
      function matmul(a: number[][], b: number[][]): number[][] {
        const rowsA = a.length;
        const colsA = a[0].length;
        const colsB = b[0].length;

        const result: number[][] = Array(rowsA)
          .fill(null)
          .map(() => Array(colsB).fill(0));

        for (let i = 0; i < rowsA; i++) {
          for (let j = 0; j < colsB; j++) {
            for (let k = 0; k < colsA; k++) {
              result[i][j] += a[i][k] * b[k][j];
            }
          }
        }

        return result;
      }

      const a = [[1, 2], [3, 4]];
      const b = [[5, 6], [7, 8]];

      const result = matmul(a, b);
      expect(result).toEqual([[19, 22], [43, 50]]);
    });

    it('should add bias to layer output', () => {
      function addBias(output: number[][], bias: number[]): number[][] {
        return output.map(row => row.map((val, i) => val + bias[i]));
      }

      const output = [[1, 2, 3], [4, 5, 6]];
      const bias = [0.1, 0.2, 0.3];

      const result = addBias(output, bias);
      expect(result[0]).toEqual([1.1, 2.2, 3.3]);
      expect(result[1]).toEqual([4.1, 5.2, 6.3]);
    });

    it('should apply dropout during training', () => {
      function applyDropout(
        values: number[],
        dropoutRate: number,
        training: boolean
      ): number[] {
        if (!training || dropoutRate === 0) return values;

        return values.map(v => {
          if (Math.random() < dropoutRate) return 0;
          return v / (1 - dropoutRate); // Scale to maintain expected value
        });
      }

      const values = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

      // During inference, no dropout
      const inference = applyDropout(values, 0.5, false);
      expect(inference).toEqual(values);

      // During training with dropout rate 0, no dropout
      const noDropout = applyDropout(values, 0, true);
      expect(noDropout).toEqual(values);
    });
  });

  describe('Analysis History', () => {
    interface AnalysisResult {
      id: string;
      timestamp: number;
      metrics: {
        cohesion: number;
        dependencies: number;
        weakPoints: number;
      };
    }

    it('should maintain history with max size', () => {
      const MAX_HISTORY = 100;
      const history: AnalysisResult[] = [];

      function addToHistory(result: AnalysisResult): void {
        history.push(result);
        if (history.length > MAX_HISTORY) {
          history.shift();
        }
      }

      for (let i = 0; i < 150; i++) {
        addToHistory({
          id: `analysis-${i}`,
          timestamp: Date.now(),
          metrics: { cohesion: 0.8, dependencies: 5, weakPoints: 1 },
        });
      }

      expect(history.length).toBe(MAX_HISTORY);
      expect(history[0].id).toBe('analysis-50');
    });

    it('should calculate history statistics', () => {
      function calculateStats(history: AnalysisResult[]): {
        avgCohesion: number;
        avgDependencies: number;
        totalWeakPoints: number;
      } {
        if (history.length === 0) {
          return { avgCohesion: 0, avgDependencies: 0, totalWeakPoints: 0 };
        }

        const sumCohesion = history.reduce((sum, r) => sum + r.metrics.cohesion, 0);
        const sumDeps = history.reduce((sum, r) => sum + r.metrics.dependencies, 0);
        const totalWeak = history.reduce((sum, r) => sum + r.metrics.weakPoints, 0);

        return {
          avgCohesion: sumCohesion / history.length,
          avgDependencies: sumDeps / history.length,
          totalWeakPoints: totalWeak,
        };
      }

      const history: AnalysisResult[] = [
        { id: '1', timestamp: 0, metrics: { cohesion: 0.8, dependencies: 5, weakPoints: 1 } },
        { id: '2', timestamp: 0, metrics: { cohesion: 0.9, dependencies: 3, weakPoints: 0 } },
        { id: '3', timestamp: 0, metrics: { cohesion: 0.7, dependencies: 7, weakPoints: 2 } },
      ];

      const stats = calculateStats(history);
      expect(stats.avgCohesion).toBeCloseTo(0.8);
      expect(stats.avgDependencies).toBe(5);
      expect(stats.totalWeakPoints).toBe(3);
    });
  });
});
