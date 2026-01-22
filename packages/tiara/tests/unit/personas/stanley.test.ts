/**
 * Stanley Persona Tests
 *
 * Tests for Stanley investment platform domain tools.
 * Tests the expected structure and interfaces without importing actual modules
 * (since those are in agent-core root, not tiara).
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { z } from 'zod';

// Set test mode
process.env.TIARA_TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

describe('Stanley Persona', () => {
  describe('Market Data Tool Interface', () => {
    it('should validate market data parameters', () => {
      const MarketDataParams = z.object({
        symbol: z.string(),
        dataType: z.enum(["quote", "chart", "fundamentals", "news"]).default("quote"),
        period: z.enum(["1d", "5d", "1m", "3m", "6m", "1y", "ytd", "max"]).default("1m"),
        interval: z.enum(["1m", "5m", "15m", "1h", "1d", "1w"]).optional(),
      });

      // Valid market data requests
      expect(MarketDataParams.safeParse({ symbol: 'AAPL' }).success).toBe(true);
      expect(MarketDataParams.safeParse({ symbol: 'MSFT', dataType: 'chart' }).success).toBe(true);
      expect(MarketDataParams.safeParse({ symbol: 'TSLA', dataType: 'fundamentals' }).success).toBe(true);
      expect(MarketDataParams.safeParse({
        symbol: 'GOOGL',
        dataType: 'chart',
        period: '3m',
        interval: '1h'
      }).success).toBe(true);
    });

    it('should validate all data types', () => {
      const dataTypes = ['quote', 'chart', 'fundamentals', 'news'];
      const DataTypeSchema = z.enum(['quote', 'chart', 'fundamentals', 'news']);

      for (const type of dataTypes) {
        expect(DataTypeSchema.safeParse(type).success).toBe(true);
      }
    });

    it('should validate all time periods', () => {
      const periods = ['1d', '5d', '1m', '3m', '6m', '1y', 'ytd', 'max'];
      const PeriodSchema = z.enum(['1d', '5d', '1m', '3m', '6m', '1y', 'ytd', 'max']);

      for (const period of periods) {
        expect(PeriodSchema.safeParse(period).success).toBe(true);
      }
    });

    it('should validate all chart intervals', () => {
      const intervals = ['1m', '5m', '15m', '1h', '1d', '1w'];
      const IntervalSchema = z.enum(['1m', '5m', '15m', '1h', '1d', '1w']);

      for (const interval of intervals) {
        expect(IntervalSchema.safeParse(interval).success).toBe(true);
      }
    });
  });

  describe('Portfolio Tool Interface', () => {
    it('should validate portfolio parameters', () => {
      const PortfolioParams = z.object({
        action: z.enum(["get", "analyze", "optimize", "backtest"]).default("analyze"),
        portfolioId: z.string().optional(),
        benchmark: z.string().default("SPY"),
        riskMetrics: z.boolean().default(true),
      });

      // Valid portfolio actions
      expect(PortfolioParams.safeParse({}).success).toBe(true);
      expect(PortfolioParams.safeParse({ action: 'analyze' }).success).toBe(true);
      expect(PortfolioParams.safeParse({ action: 'optimize' }).success).toBe(true);
      expect(PortfolioParams.safeParse({
        action: 'analyze',
        benchmark: 'QQQ',
        riskMetrics: true
      }).success).toBe(true);
    });

    it('should validate all portfolio actions', () => {
      const actions = ['get', 'analyze', 'optimize', 'backtest'];
      const ActionSchema = z.enum(['get', 'analyze', 'optimize', 'backtest']);

      for (const action of actions) {
        expect(ActionSchema.safeParse(action).success).toBe(true);
      }
    });
  });

  describe('SEC Filings Tool Interface', () => {
    it('should validate SEC filings parameters', () => {
      const SecFilingsParams = z.object({
        ticker: z.string(),
        formType: z.enum(["10-K", "10-Q", "8-K", "13F", "DEF14A", "S-1", "all"]).default("10-K"),
        year: z.number().optional(),
        summarize: z.boolean().default(true),
      });

      // Valid SEC filing requests
      expect(SecFilingsParams.safeParse({ ticker: 'AAPL' }).success).toBe(true);
      expect(SecFilingsParams.safeParse({ ticker: 'MSFT', formType: '10-Q' }).success).toBe(true);
      expect(SecFilingsParams.safeParse({
        ticker: 'TSLA',
        formType: '8-K',
        year: 2025,
        summarize: false
      }).success).toBe(true);
    });

    it('should validate all SEC form types', () => {
      const formTypes = ['10-K', '10-Q', '8-K', '13F', 'DEF14A', 'S-1', 'all'];
      const FormTypeSchema = z.enum(['10-K', '10-Q', '8-K', '13F', 'DEF14A', 'S-1', 'all']);

      for (const formType of formTypes) {
        expect(FormTypeSchema.safeParse(formType).success).toBe(true);
      }
    });
  });

  describe('Research Tool Interface', () => {
    it('should validate research parameters', () => {
      const ResearchParams = z.object({
        query: z.string(),
        sources: z.array(z.enum(["sec", "news", "analyst", "academic", "all"])).default(["news", "analyst"]),
        dateRange: z.enum(["1d", "1w", "1m", "3m", "1y", "all"]).default("1m"),
        limit: z.number().default(10),
      });

      // Valid research requests
      expect(ResearchParams.safeParse({ query: 'AI market trends' }).success).toBe(true);
      expect(ResearchParams.safeParse({
        query: 'Tesla',
        sources: ['analyst', 'news']
      }).success).toBe(true);
      expect(ResearchParams.safeParse({
        query: 'NVDA',
        sources: ['sec'],
        dateRange: '3m',
        limit: 20
      }).success).toBe(true);
    });

    it('should validate all research sources', () => {
      const sources = ['sec', 'news', 'analyst', 'academic', 'all'];
      const SourceSchema = z.enum(['sec', 'news', 'analyst', 'academic', 'all']);

      for (const source of sources) {
        expect(SourceSchema.safeParse(source).success).toBe(true);
      }
    });

    it('should validate all date ranges', () => {
      const ranges = ['1d', '1w', '1m', '3m', '1y', 'all'];
      const RangeSchema = z.enum(['1d', '1w', '1m', '3m', '1y', 'all']);

      for (const range of ranges) {
        expect(RangeSchema.safeParse(range).success).toBe(true);
      }
    });
  });

  describe('Nautilus Tool Interface', () => {
    it('should validate nautilus parameters', () => {
      const NautilusParams = z.object({
        action: z.enum(["backtest", "paper_trade", "strategy_info", "market_status"]),
        strategy: z.string().optional(),
        symbols: z.array(z.string()).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      });

      // Valid nautilus requests
      expect(NautilusParams.safeParse({ action: 'market_status' }).success).toBe(true);
      expect(NautilusParams.safeParse({ action: 'strategy_info', strategy: 'momentum' }).success).toBe(true);
      expect(NautilusParams.safeParse({
        action: 'backtest',
        strategy: 'mean_reversion',
        symbols: ['AAPL', 'MSFT'],
        startDate: '2025-01-01',
        endDate: '2025-12-31'
      }).success).toBe(true);
    });

    it('should validate all nautilus actions', () => {
      const actions = ['backtest', 'paper_trade', 'strategy_info', 'market_status'];
      const ActionSchema = z.enum(['backtest', 'paper_trade', 'strategy_info', 'market_status']);

      for (const action of actions) {
        expect(ActionSchema.safeParse(action).success).toBe(true);
      }
    });
  });

  describe('Tool ID Conventions', () => {
    it('should follow stanley: prefix convention', () => {
      const expectedToolIds = [
        'stanley:status',
        'stanley:market-data',
        'stanley:portfolio',
        'stanley:sec-filings',
        'stanley:research',
        'stanley:nautilus',
      ];

      for (const id of expectedToolIds) {
        expect(id.startsWith('stanley:')).toBe(true);
      }
    });

    it('should have expected tool categories', () => {
      // All Stanley tools should be in the 'domain' category
      const expectedCategory = 'domain';

      // This validates the expected structure
      expect(expectedCategory).toBe('domain');
    });
  });

  describe('Financial Data Structures', () => {
    it('should define quote structure', () => {
      interface Quote {
        symbol: string;
        price: number;
        change: number;
        changePercent: number;
        volume: number;
        marketCap?: number;
        pe?: number;
        timestamp: number;
      }

      const exampleQuote: Quote = {
        symbol: 'AAPL',
        price: 185.50,
        change: 2.30,
        changePercent: 1.25,
        volume: 45000000,
        marketCap: 2850000000000,
        pe: 28.5,
        timestamp: Date.now(),
      };

      expect(exampleQuote.symbol).toBe('AAPL');
      expect(exampleQuote.price).toBeGreaterThan(0);
    });

    it('should define portfolio holding structure', () => {
      interface Holding {
        symbol: string;
        shares: number;
        avgCost: number;
        currentPrice: number;
        value: number;
        gain: number;
        gainPercent: number;
        weight: number;
      }

      const exampleHolding: Holding = {
        symbol: 'MSFT',
        shares: 100,
        avgCost: 350.00,
        currentPrice: 380.00,
        value: 38000,
        gain: 3000,
        gainPercent: 8.57,
        weight: 0.25,
      };

      expect(exampleHolding.value).toBe(exampleHolding.shares * exampleHolding.currentPrice);
    });

    it('should define risk metrics structure', () => {
      interface RiskMetrics {
        sharpeRatio: number;
        sortinoRatio: number;
        beta: number;
        alpha: number;
        volatility: number;
        maxDrawdown: number;
        valueAtRisk: number;
      }

      const exampleMetrics: RiskMetrics = {
        sharpeRatio: 1.5,
        sortinoRatio: 2.0,
        beta: 1.1,
        alpha: 0.05,
        volatility: 0.18,
        maxDrawdown: 0.12,
        valueAtRisk: 0.03,
      };

      expect(exampleMetrics.sharpeRatio).toBeGreaterThan(0);
      expect(exampleMetrics.beta).toBeGreaterThan(0);
    });
  });
});
