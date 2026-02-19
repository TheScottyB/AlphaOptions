import { describe, expect, it } from 'vitest'
import {
  OptionTypeSchema,
  PositionSideSchema,
  UnderlyingTypeSchema,
  OptionContractSchema,
  OptionPositionSchema,
  GreeksSchema,
  MarketSnapshotSchema,
  RiskProfileSchema,
} from './options.js'
import {
  StrategyNameSchema,
  StrategyCategorySchema,
  TradeSignalSchema,
  TradeExecutionSchema,
} from './strategies.js'

describe('Option Type Schemas', () => {
  describe('OptionTypeSchema', () => {
    it('accepts call', () => {
      expect(OptionTypeSchema.parse('call')).toBe('call')
    })

    it('accepts put', () => {
      expect(OptionTypeSchema.parse('put')).toBe('put')
    })

    it('rejects invalid type', () => {
      expect(OptionTypeSchema.safeParse('straddle').success).toBe(false)
    })
  })

  describe('PositionSideSchema', () => {
    it('accepts long', () => {
      expect(PositionSideSchema.parse('long')).toBe('long')
    })

    it('accepts short', () => {
      expect(PositionSideSchema.parse('short')).toBe('short')
    })

    it('rejects invalid side', () => {
      expect(PositionSideSchema.safeParse('neutral').success).toBe(false)
    })
  })

  describe('UnderlyingTypeSchema', () => {
    it('accepts stock', () => {
      expect(UnderlyingTypeSchema.parse('stock')).toBe('stock')
    })

    it('accepts index', () => {
      expect(UnderlyingTypeSchema.parse('index')).toBe('index')
    })

    it('accepts etf', () => {
      expect(UnderlyingTypeSchema.parse('etf')).toBe('etf')
    })

    it('rejects invalid type', () => {
      expect(UnderlyingTypeSchema.safeParse('bond').success).toBe(false)
    })
  })
})

describe('OptionContractSchema', () => {
  const validContract = {
    symbol: 'SPY240315C00500000',
    underlyingSymbol: 'SPY',
    underlyingType: 'etf',
    optionType: 'call',
    strikePrice: 500,
    expirationDate: new Date('2024-03-15'),
    premium: 2.5,
    contractSize: 100,
  }

  it('validates a complete contract', () => {
    const result = OptionContractSchema.safeParse(validContract)
    expect(result.success).toBe(true)
  })

  it('rejects empty symbol', () => {
    const result = OptionContractSchema.safeParse({
      ...validContract,
      symbol: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative strike price', () => {
    const result = OptionContractSchema.safeParse({
      ...validContract,
      strikePrice: -100,
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative premium', () => {
    const result = OptionContractSchema.safeParse({
      ...validContract,
      premium: -1,
    })
    expect(result.success).toBe(false)
  })

  it('defaults contractSize to 100', () => {
    const { contractSize, ...rest } = validContract
    const result = OptionContractSchema.parse(rest)
    expect(result.contractSize).toBe(100)
  })

  it('rejects zero strike price', () => {
    const result = OptionContractSchema.safeParse({
      ...validContract,
      strikePrice: 0,
    })
    expect(result.success).toBe(false)
  })
})

describe('OptionPositionSchema', () => {
  const validPosition = {
    contract: {
      symbol: 'SPY240315C00500000',
      underlyingSymbol: 'SPY',
      underlyingType: 'etf',
      optionType: 'call',
      strikePrice: 500,
      expirationDate: new Date('2024-03-15'),
      premium: 2.5,
      contractSize: 100,
    },
    side: 'long',
    quantity: 5,
    entryPrice: 2.5,
    entryTime: new Date(),
  }

  it('validates a complete position', () => {
    const result = OptionPositionSchema.safeParse(validPosition)
    expect(result.success).toBe(true)
  })

  it('rejects negative quantity', () => {
    const result = OptionPositionSchema.safeParse({
      ...validPosition,
      quantity: -1,
    })
    expect(result.success).toBe(false)
  })

  it('rejects zero quantity', () => {
    const result = OptionPositionSchema.safeParse({
      ...validPosition,
      quantity: 0,
    })
    expect(result.success).toBe(false)
  })
})

describe('GreeksSchema', () => {
  it('validates complete Greeks', () => {
    const result = GreeksSchema.safeParse({
      delta: 0.5,
      gamma: 0.05,
      theta: -0.15,
      vega: 0.1,
    })
    expect(result.success).toBe(true)
  })

  it('accepts rho as optional', () => {
    const result = GreeksSchema.safeParse({
      delta: 0.5,
      gamma: 0.05,
      theta: -0.15,
      vega: 0.1,
      rho: 0.02,
    })
    expect(result.success).toBe(true)
  })

  it('rejects delta > 1', () => {
    const result = GreeksSchema.safeParse({
      delta: 1.5,
      gamma: 0.05,
      theta: -0.15,
      vega: 0.1,
    })
    expect(result.success).toBe(false)
  })

  it('rejects delta < -1', () => {
    const result = GreeksSchema.safeParse({
      delta: -1.5,
      gamma: 0.05,
      theta: -0.15,
      vega: 0.1,
    })
    expect(result.success).toBe(false)
  })

  it('accepts boundary values', () => {
    const result = GreeksSchema.safeParse({
      delta: -1,
      gamma: 0,
      theta: 0,
      vega: 0,
    })
    expect(result.success).toBe(true)
  })
})

describe('MarketSnapshotSchema', () => {
  it('validates a complete snapshot', () => {
    const result = MarketSnapshotSchema.safeParse({
      symbol: 'SPY240315C00500000',
      bid: 2.4,
      ask: 2.6,
      last: 2.5,
      volume: 1000,
      openInterest: 5000,
      timestamp: new Date(),
    })
    expect(result.success).toBe(true)
  })

  it('rejects negative bid', () => {
    const result = MarketSnapshotSchema.safeParse({
      symbol: 'SPY',
      bid: -1,
      ask: 2.6,
      last: 2.5,
      volume: 1000,
      openInterest: 5000,
      timestamp: new Date(),
    })
    expect(result.success).toBe(false)
  })
})

describe('RiskProfileSchema', () => {
  it('validates numeric max profit', () => {
    const result = RiskProfileSchema.safeParse({
      maxLoss: 250,
      maxProfit: 500,
      breakeven: 502.5,
    })
    expect(result.success).toBe(true)
  })

  it('validates unlimited max profit', () => {
    const result = RiskProfileSchema.safeParse({
      maxLoss: 250,
      maxProfit: 'unlimited',
      breakeven: 502.5,
    })
    expect(result.success).toBe(true)
  })

  it('validates array breakevens', () => {
    const result = RiskProfileSchema.safeParse({
      maxLoss: 500,
      maxProfit: 'unlimited',
      breakeven: [495, 505],
    })
    expect(result.success).toBe(true)
  })

  it('accepts optional probabilityOfProfit', () => {
    const result = RiskProfileSchema.safeParse({
      maxLoss: 250,
      maxProfit: 'unlimited',
      breakeven: 502.5,
      probabilityOfProfit: 0.65,
    })
    expect(result.success).toBe(true)
  })

  it('rejects probability out of range', () => {
    const result = RiskProfileSchema.safeParse({
      maxLoss: 250,
      maxProfit: 'unlimited',
      breakeven: 502.5,
      probabilityOfProfit: 1.5,
    })
    expect(result.success).toBe(false)
  })
})

describe('Strategy Type Schemas', () => {
  describe('StrategyNameSchema', () => {
    it('accepts all 12 strategy names', () => {
      const names = [
        'long_call_stock', 'long_put_stock', 'long_call_index', 'long_put_index',
        'straddle_stock', 'strangle_stock', 'straddle_index', 'strangle_index',
        'otm_call_speculation', 'otm_put_speculation',
        'short_put_vertical', 'long_call_vertical',
      ]
      for (const name of names) {
        expect(StrategyNameSchema.safeParse(name).success).toBe(true)
      }
    })

    it('rejects invalid name', () => {
      expect(StrategyNameSchema.safeParse('invalid_strategy').success).toBe(false)
    })
  })

  describe('StrategyCategorySchema', () => {
    it('accepts all categories', () => {
      const categories = [
        'directional_bullish', 'directional_bearish',
        'neutral_volatility', 'speculation', 'income',
      ]
      for (const cat of categories) {
        expect(StrategyCategorySchema.safeParse(cat).success).toBe(true)
      }
    })

    it('rejects invalid category', () => {
      expect(StrategyCategorySchema.safeParse('hedging').success).toBe(false)
    })
  })

  describe('TradeSignalSchema', () => {
    it('validates a complete signal', () => {
      const result = TradeSignalSchema.safeParse({
        symbol: 'SPY',
        direction: 'bullish',
        confidence: 0.75,
        suggestedStrategies: ['long_call_stock'],
        technicalIndicators: ['double_bottom', 'rsi_oversold'],
        timestamp: new Date(),
      })
      expect(result.success).toBe(true)
    })

    it('rejects confidence > 1', () => {
      const result = TradeSignalSchema.safeParse({
        symbol: 'SPY',
        direction: 'bullish',
        confidence: 1.5,
        suggestedStrategies: ['long_call_stock'],
        technicalIndicators: [],
        timestamp: new Date(),
      })
      expect(result.success).toBe(false)
    })

    it('rejects invalid direction', () => {
      const result = TradeSignalSchema.safeParse({
        symbol: 'SPY',
        direction: 'sideways',
        confidence: 0.5,
        suggestedStrategies: ['long_call_stock'],
        technicalIndicators: [],
        timestamp: new Date(),
      })
      expect(result.success).toBe(false)
    })
  })

  describe('TradeExecutionSchema', () => {
    it('validates a complete execution', () => {
      const result = TradeExecutionSchema.safeParse({
        strategy: 'long_call_stock',
        symbol: 'SPY240315C00500000',
        quantity: 5,
        limitPrice: 2.5,
        stopLoss: 1.25,
        takeProfit: 5.0,
      })
      expect(result.success).toBe(true)
    })

    it('rejects zero quantity', () => {
      const result = TradeExecutionSchema.safeParse({
        strategy: 'long_call_stock',
        symbol: 'SPY240315C00500000',
        quantity: 0,
      })
      expect(result.success).toBe(false)
    })

    it('accepts without optional fields', () => {
      const result = TradeExecutionSchema.safeParse({
        strategy: 'long_call_stock',
        symbol: 'SPY240315C00500000',
        quantity: 1,
      })
      expect(result.success).toBe(true)
    })

    it('rejects invalid strategy name', () => {
      const result = TradeExecutionSchema.safeParse({
        strategy: 'invalid',
        symbol: 'SPY240315C00500000',
        quantity: 1,
      })
      expect(result.success).toBe(false)
    })
  })
})
