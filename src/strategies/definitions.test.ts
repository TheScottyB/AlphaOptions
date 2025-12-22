import { describe, expect, it } from 'vitest'
import {
  STRATEGY_DEFINITIONS,
  getStrategy,
  getDebitOnlyStrategies,
  get0DTESuitableStrategies,
  getStrategiesByCategory,
} from './definitions.js'

describe('Strategy Definitions', () => {
  describe('STRATEGY_DEFINITIONS', () => {
    it('contains all 12 strategies', () => {
      expect(Object.keys(STRATEGY_DEFINITIONS)).toHaveLength(12)
    })

    it('all strategies have required fields', () => {
      for (const strategy of Object.values(STRATEGY_DEFINITIONS)) {
        expect(strategy.name).toBeDefined()
        expect(strategy.displayName).toBeDefined()
        expect(strategy.category).toBeDefined()
        expect(strategy.description).toBeDefined()
        expect(strategy.legs).toBeDefined()
        expect(strategy.legs.length).toBeGreaterThan(0)
        expect(typeof strategy.isDebitOnly).toBe('boolean')
        expect(typeof strategy.suitable0DTE).toBe('boolean')
      }
    })

    it('all legs have required fields', () => {
      for (const strategy of Object.values(STRATEGY_DEFINITIONS)) {
        for (const leg of strategy.legs) {
          expect(['long', 'short']).toContain(leg.side)
          expect(['call', 'put']).toContain(leg.optionType)
          expect(leg.strikeOffset).toBeDefined()
          expect(leg.quantity).toBeGreaterThan(0)
        }
      }
    })
  })

  describe('getStrategy', () => {
    it('returns correct strategy by name', () => {
      const strategy = getStrategy('long_call_stock')

      expect(strategy.name).toBe('long_call_stock')
      expect(strategy.displayName).toBe('Long Call (Stock)')
      expect(strategy.category).toBe('directional_bullish')
    })
  })

  describe('getDebitOnlyStrategies', () => {
    it('returns only debit strategies', () => {
      const debitStrategies = getDebitOnlyStrategies()

      for (const strategy of debitStrategies) {
        expect(strategy.isDebitOnly).toBe(true)
      }
    })

    it('excludes credit strategies', () => {
      const debitStrategies = getDebitOnlyStrategies()
      const debitNames = debitStrategies.map((s) => s.name)

      // short_put_vertical is a credit strategy
      expect(debitNames).not.toContain('short_put_vertical')
    })
  })

  describe('get0DTESuitableStrategies', () => {
    it('returns strategies suitable for 0DTE', () => {
      const strategies = get0DTESuitableStrategies()

      for (const strategy of strategies) {
        expect(strategy.suitable0DTE).toBe(true)
      }
    })

    it('includes all 12 strategies (all are 0DTE suitable)', () => {
      const strategies = get0DTESuitableStrategies()
      expect(strategies).toHaveLength(12)
    })
  })

  describe('getStrategiesByCategory', () => {
    it('filters bullish strategies', () => {
      const bullish = getStrategiesByCategory('directional_bullish')

      expect(bullish.length).toBeGreaterThan(0)
      for (const strategy of bullish) {
        expect(strategy.category).toBe('directional_bullish')
      }
    })

    it('filters bearish strategies', () => {
      const bearish = getStrategiesByCategory('directional_bearish')

      expect(bearish.length).toBeGreaterThan(0)
      for (const strategy of bearish) {
        expect(strategy.category).toBe('directional_bearish')
      }
    })

    it('filters volatility strategies', () => {
      const volatility = getStrategiesByCategory('neutral_volatility')

      expect(volatility.length).toBeGreaterThan(0)
      for (const strategy of volatility) {
        expect(strategy.category).toBe('neutral_volatility')
      }
    })
  })

  describe('strategy specifics', () => {
    it('straddle has two legs at same strike', () => {
      const straddle = getStrategy('straddle_stock')

      expect(straddle.legs).toHaveLength(2)
      expect(straddle.legs[0]?.optionType).toBe('call')
      expect(straddle.legs[1]?.optionType).toBe('put')
      expect(straddle.legs[0]?.strikeOffset).toBe('atm')
      expect(straddle.legs[1]?.strikeOffset).toBe('atm')
    })

    it('strangle has two legs at different strikes', () => {
      const strangle = getStrategy('strangle_stock')

      expect(strangle.legs).toHaveLength(2)
      expect(strangle.legs[0]?.strikeOffset).toBe('otm_high')
      expect(strangle.legs[1]?.strikeOffset).toBe('otm_low')
    })

    it('vertical spreads have two legs', () => {
      const vertical = getStrategy('long_call_vertical')

      expect(vertical.legs).toHaveLength(2)
      expect(vertical.legs[0]?.side).toBe('long')
      expect(vertical.legs[1]?.side).toBe('short')
    })
  })
})
