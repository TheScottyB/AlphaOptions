import { describe, expect, it } from 'vitest'
import { StrategyAnalyzer, analyzeStrategy } from './analyzer.js'
import { getStrategy } from './definitions.js'
import type { Greeks, OptionContract } from '../types/options.js'

describe('StrategyAnalyzer', () => {
  const defaultConfig = {
    riskFreeRate: 0.05,
    impliedVolatility: 0.25,
    underlyingPrice: 500,
    timeToExpiry: 0.003, // ~1 hour for 0DTE
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

  const mockGreeks: Greeks = {
    delta: 0.5,
    gamma: 0.05,
    theta: -0.15,
    vega: 0.1,
  }

  describe('calculateRiskProfile', () => {
    it('calculates risk profile for long call', () => {
      const analyzer = new StrategyAnalyzer(defaultConfig)
      const strategy = getStrategy('long_call_stock')

      const riskProfile = analyzer.calculateRiskProfile(strategy, [mockCallContract])

      // Max loss = premium * contract size
      expect(riskProfile.maxLoss).toBe(250) // 2.5 * 100
      expect(riskProfile.maxProfit).toBe('unlimited')
      expect(riskProfile.breakeven).toBe(502.5) // strike + premium
    })

    it('calculates risk profile for long put', () => {
      const analyzer = new StrategyAnalyzer(defaultConfig)
      const strategy = getStrategy('long_put_stock')

      const riskProfile = analyzer.calculateRiskProfile(strategy, [mockPutContract])

      expect(riskProfile.maxLoss).toBe(250)
      expect(riskProfile.maxProfit).toBe('unlimited')
      expect(riskProfile.breakeven).toBe(497.5) // strike - premium
    })

    it('calculates risk profile for straddle', () => {
      const analyzer = new StrategyAnalyzer(defaultConfig)
      const strategy = getStrategy('straddle_stock')

      const riskProfile = analyzer.calculateRiskProfile(strategy, [
        mockCallContract,
        mockPutContract,
      ])

      // Max loss = total premium
      expect(riskProfile.maxLoss).toBe(500) // (2.5 + 2.5) * 100
      expect(riskProfile.maxProfit).toBe('unlimited')

      // Straddle has two breakevens
      expect(Array.isArray(riskProfile.breakeven)).toBe(true)
      const breakevens = riskProfile.breakeven as number[]
      expect(breakevens[0]).toBe(495) // strike - total premium
      expect(breakevens[1]).toBe(505) // strike + total premium
    })
  })

  describe('calculateNetGreeks', () => {
    it('calculates net greeks for single leg', () => {
      const analyzer = new StrategyAnalyzer(defaultConfig)

      const netGreeks = analyzer.calculateNetGreeks([mockCallContract], [mockGreeks])

      expect(netGreeks.netDelta).toBe(50) // 0.5 * 100
      expect(netGreeks.netGamma).toBe(5) // 0.05 * 100
      expect(netGreeks.netTheta).toBe(-15) // -0.15 * 100
      expect(netGreeks.netVega).toBe(10) // 0.1 * 100
    })

    it('calculates net greeks for straddle', () => {
      const analyzer = new StrategyAnalyzer(defaultConfig)

      const callGreeks: Greeks = { delta: 0.5, gamma: 0.05, theta: -0.15, vega: 0.1 }
      const putGreeks: Greeks = { delta: -0.5, gamma: 0.05, theta: -0.15, vega: 0.1 }

      const netGreeks = analyzer.calculateNetGreeks(
        [mockCallContract, mockPutContract],
        [callGreeks, putGreeks]
      )

      // Delta should net to ~0 for ATM straddle
      expect(netGreeks.netDelta).toBe(0)
      // Gamma adds up
      expect(netGreeks.netGamma).toBe(10)
      // Theta adds up (more time decay)
      expect(netGreeks.netTheta).toBe(-30)
      // Vega adds up
      expect(netGreeks.netVega).toBe(20)
    })
  })

  describe('generateRecommendation', () => {
    it('recommends buy for good risk/reward', () => {
      const analyzer = new StrategyAnalyzer(defaultConfig)

      const riskProfile = {
        maxLoss: 100,
        maxProfit: 'unlimited' as const,
        breakeven: 505,
      }

      const netGreeks = {
        netDelta: 50,
        netGamma: 5,
        netTheta: -10,
        netVega: 10,
      }

      const recommendation = analyzer.generateRecommendation(
        riskProfile,
        netGreeks,
        'high'
      )

      expect(['strong_buy', 'buy']).toContain(recommendation)
    })

    it('recommends avoid for poor risk/reward in low volatility', () => {
      const analyzer = new StrategyAnalyzer(defaultConfig)

      const riskProfile = {
        maxLoss: 500,
        maxProfit: 200,
        breakeven: 510,
      }

      const netGreeks = {
        netDelta: 50,
        netGamma: 5,
        netTheta: -100, // High theta burn
        netVega: 10,
      }

      const recommendation = analyzer.generateRecommendation(
        riskProfile,
        netGreeks,
        'low'
      )

      expect(['avoid', 'strong_avoid']).toContain(recommendation)
    })
  })

  describe('full analysis', () => {
    it('produces complete analysis for long call', () => {
      const strategy = getStrategy('long_call_stock')

      const analysis = analyzeStrategy(
        strategy,
        [mockCallContract],
        [mockGreeks],
        defaultConfig,
        'normal'
      )

      expect(analysis.strategy.name).toBe('long_call_stock')
      expect(analysis.contracts).toHaveLength(1)
      expect(analysis.riskProfile.maxLoss).toBeGreaterThan(0)
      expect(analysis.greeks.netDelta).toBeGreaterThan(0)
      expect(analysis.margin).toBeGreaterThan(0)
      expect(analysis.recommendation).toBeDefined()
    })
  })
})
