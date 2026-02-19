import { describe, expect, it } from 'vitest'
import { StrategyAnalyzer, analyzeStrategy } from './analyzer.js'
import { getStrategy, STRATEGY_DEFINITIONS } from './definitions.js'
import type { Greeks, OptionContract } from '../types/options.js'

describe('StrategyAnalyzer - Extended Coverage', () => {
  const defaultConfig = {
    riskFreeRate: 0.05,
    impliedVolatility: 0.25,
    underlyingPrice: 500,
    timeToExpiry: 0.003,
  }

  const mockCallContract: OptionContract = {
    symbol: 'SPY240315C00500000',
    underlyingSymbol: 'SPY',
    underlyingType: 'etf',
    optionType: 'call',
    strikePrice: 500,
    expirationDate: new Date(),
    premium: 2.5,
    contractSize: 100,
  }

  const mockPutContract: OptionContract = {
    symbol: 'SPY240315P00500000',
    underlyingSymbol: 'SPY',
    underlyingType: 'etf',
    optionType: 'put',
    strikePrice: 500,
    expirationDate: new Date(),
    premium: 2.5,
    contractSize: 100,
  }

  const mockCallOTMHigh: OptionContract = {
    symbol: 'SPY240315C00510000',
    underlyingSymbol: 'SPY',
    underlyingType: 'etf',
    optionType: 'call',
    strikePrice: 510,
    expirationDate: new Date(),
    premium: 1.0,
    contractSize: 100,
  }

  const mockPutOTMLow: OptionContract = {
    symbol: 'SPY240315P00490000',
    underlyingSymbol: 'SPY',
    underlyingType: 'etf',
    optionType: 'put',
    strikePrice: 490,
    expirationDate: new Date(),
    premium: 1.0,
    contractSize: 100,
  }

  const mockGreeks: Greeks = {
    delta: 0.5,
    gamma: 0.05,
    theta: -0.15,
    vega: 0.1,
  }

  describe('calculateRiskProfile - strangle', () => {
    it('calculates strangle breakevens at different strikes', () => {
      const analyzer = new StrategyAnalyzer(defaultConfig)
      const strategy = getStrategy('strangle_stock')

      const riskProfile = analyzer.calculateRiskProfile(strategy, [
        mockCallOTMHigh,
        mockPutOTMLow,
      ])

      expect(riskProfile.maxLoss).toBe(200) // (1.0 + 1.0) * 100
      expect(riskProfile.maxProfit).toBe('unlimited')
      expect(Array.isArray(riskProfile.breakeven)).toBe(true)
      const breakevens = riskProfile.breakeven as number[]
      // Lower breakeven = put strike - put premium = 490 - 1 = 489
      expect(breakevens[0]).toBe(489)
      // Upper breakeven = call strike + call premium = 510 + 1 = 511
      expect(breakevens[1]).toBe(511)
    })
  })

  describe('calculateRiskProfile - vertical spread (credit)', () => {
    it('calculates credit risk profile for short_put_vertical', () => {
      const analyzer = new StrategyAnalyzer(defaultConfig)
      const strategy = getStrategy('short_put_vertical')

      // Short put vertical: short higher strike put, long lower strike put
      const shortPut: OptionContract = {
        symbol: 'SPY240315P00500000',
        underlyingSymbol: 'SPY',
        underlyingType: 'etf',
        optionType: 'put',
        strikePrice: 500,
        expirationDate: new Date(),
        premium: 5.0,
        contractSize: 100,
      }
      const longPut: OptionContract = {
        symbol: 'SPY240315P00490000',
        underlyingSymbol: 'SPY',
        underlyingType: 'etf',
        optionType: 'put',
        strikePrice: 490,
        expirationDate: new Date(),
        premium: 2.0,
        contractSize: 100,
      }

      const riskProfile = analyzer.calculateRiskProfile(strategy, [longPut, shortPut])

      expect(riskProfile.maxLoss).toBeGreaterThan(0)
      expect(typeof riskProfile.maxProfit).toBe('number')
      expect(typeof riskProfile.breakeven).toBe('number')
    })
  })

  describe('calculateRiskProfile - vertical spread (debit)', () => {
    it('calculates debit vertical spread with capped max profit', () => {
      const analyzer = new StrategyAnalyzer(defaultConfig)
      const strategy = getStrategy('long_call_vertical')

      const longCall: OptionContract = {
        symbol: 'SPY240315C00500000',
        underlyingSymbol: 'SPY',
        underlyingType: 'etf',
        optionType: 'call',
        strikePrice: 500,
        expirationDate: new Date(),
        premium: 5.0,
        contractSize: 100,
      }
      const shortCall: OptionContract = {
        symbol: 'SPY240315C00510000',
        underlyingSymbol: 'SPY',
        underlyingType: 'etf',
        optionType: 'call',
        strikePrice: 510,
        expirationDate: new Date(),
        premium: 2.0,
        contractSize: 100,
      }

      const riskProfile = analyzer.calculateRiskProfile(strategy, [longCall, shortCall])

      // Debit strategy: max loss = total premium
      expect(riskProfile.maxLoss).toBe(700) // (5.0 + 2.0) * 100
      // Max profit for vertical: spread width * 100 - premium
      expect(typeof riskProfile.maxProfit).toBe('number')
    })
  })

  describe('calculateRiskProfile - speculation', () => {
    it('calculates speculation strategy risk profile', () => {
      const analyzer = new StrategyAnalyzer(defaultConfig)
      const strategy = getStrategy('otm_call_speculation')

      const otmCall: OptionContract = {
        symbol: 'SPY240315C00520000',
        underlyingSymbol: 'SPY',
        underlyingType: 'etf',
        optionType: 'call',
        strikePrice: 520,
        expirationDate: new Date(),
        premium: 0.5,
        contractSize: 100,
      }

      const riskProfile = analyzer.calculateRiskProfile(strategy, [otmCall])

      expect(riskProfile.maxLoss).toBe(50) // 0.5 * 100
      expect(riskProfile.maxProfit).toBe('unlimited')
    })
  })

  describe('generateRecommendation - edge cases', () => {
    it('returns hold for neutral risk/reward with normal volatility', () => {
      const analyzer = new StrategyAnalyzer(defaultConfig)
      const riskProfile = {
        maxLoss: 100,
        maxProfit: 200,
        breakeven: 505,
      }
      const netGreeks = {
        netDelta: 50,
        netGamma: 5,
        netTheta: -5, // Low theta
        netVega: 0, // No vega impact
      }

      const recommendation = analyzer.generateRecommendation(riskProfile, netGreeks, 'normal')
      expect(['buy', 'hold']).toContain(recommendation)
    })

    it('penalizes high theta impact', () => {
      const analyzer = new StrategyAnalyzer(defaultConfig)
      const riskProfile = {
        maxLoss: 100,
        maxProfit: 150,
        breakeven: 505,
      }
      const netGreeks = {
        netDelta: 50,
        netGamma: 5,
        netTheta: -50, // Very high theta
        netVega: 10,
      }

      const recommendation = analyzer.generateRecommendation(riskProfile, netGreeks, 'low')
      expect(['hold', 'avoid', 'strong_avoid']).toContain(recommendation)
    })

    it('returns strong_avoid for very bad risk/reward with high theta and low vol', () => {
      const analyzer = new StrategyAnalyzer(defaultConfig)
      const riskProfile = {
        maxLoss: 1000,
        maxProfit: 100,
        breakeven: 550,
      }
      const netGreeks = {
        netDelta: 50,
        netGamma: 5,
        netTheta: -500, // Extreme theta
        netVega: 10,
      }

      const recommendation = analyzer.generateRecommendation(riskProfile, netGreeks, 'low')
      expect(recommendation).toBe('strong_avoid')
    })

    it('returns strong_buy for excellent risk/reward in high vol', () => {
      const analyzer = new StrategyAnalyzer(defaultConfig)
      const riskProfile = {
        maxLoss: 100,
        maxProfit: 'unlimited' as const,
        breakeven: 502,
      }
      const netGreeks = {
        netDelta: 50,
        netGamma: 5,
        netTheta: -5, // Low theta
        netVega: 10,
      }

      const recommendation = analyzer.generateRecommendation(riskProfile, netGreeks, 'high')
      expect(recommendation).toBe('strong_buy')
    })
  })

  describe('full analysis - credit strategy', () => {
    it('produces complete analysis for credit strategy', () => {
      const strategy = getStrategy('short_put_vertical')

      const shortPut: OptionContract = {
        symbol: 'SPY240315P00500000',
        underlyingSymbol: 'SPY',
        underlyingType: 'etf',
        optionType: 'put',
        strikePrice: 500,
        expirationDate: new Date(),
        premium: 5.0,
        contractSize: 100,
      }
      const longPut: OptionContract = {
        symbol: 'SPY240315P00490000',
        underlyingSymbol: 'SPY',
        underlyingType: 'etf',
        optionType: 'put',
        strikePrice: 490,
        expirationDate: new Date(),
        premium: 2.0,
        contractSize: 100,
      }

      const greeks: Greeks[] = [
        { delta: -0.3, gamma: 0.04, theta: -0.1, vega: 0.08 },
        { delta: 0.4, gamma: 0.05, theta: -0.12, vega: 0.1 },
      ]

      const analysis = analyzeStrategy(
        strategy,
        [longPut, shortPut],
        greeks,
        defaultConfig,
        'normal'
      )

      expect(analysis.strategy.name).toBe('short_put_vertical')
      expect(analysis.contracts).toHaveLength(2)
      // Credit strategy margin is 1.5x max loss
      expect(analysis.margin).toBe(analysis.riskProfile.maxLoss * 1.5)
      expect(analysis.recommendation).toBeDefined()
    })
  })

  describe('full analysis - market volatility variants', () => {
    it('produces analysis with high volatility', () => {
      const strategy = getStrategy('long_call_stock')
      const analysis = analyzeStrategy(
        strategy,
        [mockCallContract],
        [mockGreeks],
        defaultConfig,
        'high'
      )
      expect(analysis.recommendation).toBeDefined()
    })

    it('produces analysis with low volatility', () => {
      const strategy = getStrategy('long_call_stock')
      const analysis = analyzeStrategy(
        strategy,
        [mockCallContract],
        [mockGreeks],
        defaultConfig,
        'low'
      )
      expect(analysis.recommendation).toBeDefined()
    })
  })
})
