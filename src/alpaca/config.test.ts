import { describe, expect, it } from 'vitest'
import {
  AlpacaConfigSchema,
  DEFAULT_PAPER_URL,
  DEFAULT_LIVE_URL,
  OPTIONS_DATA_URL,
  TRADING_CONSTRAINTS,
  isWithinTradingHours,
  canSubmitETFOrder,
  getTimeUntilCutoff,
} from './config.js'

describe('AlpacaConfig', () => {
  describe('AlpacaConfigSchema', () => {
    it('validates a valid config', () => {
      const result = AlpacaConfigSchema.safeParse({
        apiKey: 'test-key',
        secretKey: 'test-secret',
        paper: true,
      })
      expect(result.success).toBe(true)
    })

    it('rejects empty apiKey', () => {
      const result = AlpacaConfigSchema.safeParse({
        apiKey: '',
        secretKey: 'test-secret',
      })
      expect(result.success).toBe(false)
    })

    it('rejects empty secretKey', () => {
      const result = AlpacaConfigSchema.safeParse({
        apiKey: 'test-key',
        secretKey: '',
      })
      expect(result.success).toBe(false)
    })

    it('defaults paper to true', () => {
      const result = AlpacaConfigSchema.parse({
        apiKey: 'test-key',
        secretKey: 'test-secret',
      })
      expect(result.paper).toBe(true)
    })

    it('accepts optional baseUrl', () => {
      const result = AlpacaConfigSchema.safeParse({
        apiKey: 'test-key',
        secretKey: 'test-secret',
        baseUrl: 'https://custom.api.example.com',
      })
      expect(result.success).toBe(true)
    })

    it('rejects invalid baseUrl', () => {
      const result = AlpacaConfigSchema.safeParse({
        apiKey: 'test-key',
        secretKey: 'test-secret',
        baseUrl: 'not-a-url',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('URL constants', () => {
    it('has correct paper URL', () => {
      expect(DEFAULT_PAPER_URL).toBe('https://paper-api.alpaca.markets')
    })

    it('has correct live URL', () => {
      expect(DEFAULT_LIVE_URL).toBe('https://api.alpaca.markets')
    })

    it('has correct data URL', () => {
      expect(OPTIONS_DATA_URL).toBe('https://data.alpaca.markets')
    })
  })

  describe('TRADING_CONSTRAINTS', () => {
    it('has correct market hours', () => {
      expect(TRADING_CONSTRAINTS.marketOpen).toEqual({ hour: 9, minute: 30 })
      expect(TRADING_CONSTRAINTS.marketClose).toEqual({ hour: 16, minute: 0 })
    })

    it('has correct ETF order cutoff', () => {
      expect(TRADING_CONSTRAINTS.etfOrderCutoff).toEqual({ hour: 15, minute: 15 })
    })

    it('has correct options exercise cutoff', () => {
      expect(TRADING_CONSTRAINTS.optionsExerciseCutoff).toEqual({ hour: 15, minute: 30 })
    })

    it('has correct pre-market and after-hours', () => {
      expect(TRADING_CONSTRAINTS.preMarketOpen).toEqual({ hour: 4, minute: 0 })
      expect(TRADING_CONSTRAINTS.afterHoursClose).toEqual({ hour: 20, minute: 0 })
    })
  })

  describe('isWithinTradingHours', () => {
    it('returns true during market hours', () => {
      // 12:00 PM ET = 17:00 UTC
      const midday = new Date('2024-03-15T17:00:00Z')
      expect(isWithinTradingHours(midday)).toBe(true)
    })

    it('returns false before market open', () => {
      // 8:00 AM ET = 13:00 UTC
      const earlyMorning = new Date('2024-03-15T13:00:00Z')
      expect(isWithinTradingHours(earlyMorning)).toBe(false)
    })

    it('returns false after market close', () => {
      // 5:00 PM ET = 22:00 UTC
      const afterClose = new Date('2024-03-15T22:00:00Z')
      expect(isWithinTradingHours(afterClose)).toBe(false)
    })

    it('returns true at market open', () => {
      // 9:30 AM ET = 14:30 UTC
      const marketOpen = new Date('2024-03-15T14:30:00Z')
      expect(isWithinTradingHours(marketOpen)).toBe(true)
    })
  })

  describe('canSubmitETFOrder', () => {
    it('returns true before ETF cutoff', () => {
      // 10:00 AM ET = 15:00 UTC
      const morning = new Date('2024-03-15T15:00:00Z')
      expect(canSubmitETFOrder(morning)).toBe(true)
    })

    it('returns false after ETF cutoff', () => {
      // 3:30 PM ET = 20:30 UTC
      const afterCutoff = new Date('2024-03-15T20:30:00Z')
      expect(canSubmitETFOrder(afterCutoff)).toBe(false)
    })

    it('returns false at exactly cutoff time', () => {
      // 3:15 PM ET = 20:15 UTC
      const atCutoff = new Date('2024-03-15T20:15:00Z')
      expect(canSubmitETFOrder(atCutoff)).toBe(false)
    })
  })

  describe('getTimeUntilCutoff', () => {
    it('returns positive milliseconds for ETF cutoff', () => {
      const result = getTimeUntilCutoff('etf')
      expect(typeof result).toBe('number')
      expect(result).toBeGreaterThanOrEqual(0)
    })

    it('returns positive milliseconds for exercise cutoff', () => {
      const result = getTimeUntilCutoff('exercise')
      expect(typeof result).toBe('number')
      expect(result).toBeGreaterThanOrEqual(0)
    })

    it('returns positive milliseconds for close cutoff', () => {
      const result = getTimeUntilCutoff('close')
      expect(typeof result).toBe('number')
      expect(result).toBeGreaterThanOrEqual(0)
    })
  })
})
