import { z } from 'zod'

/**
 * Alpaca API configuration
 *
 * From research:
 * "Alpaca enforces a 3:15 p.m. ET cutoff for submitting orders for broad-based ETFs"
 * "The provided code is only for demonstration and requires further adaptation before live trading"
 */

export const AlpacaConfigSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  secretKey: z.string().min(1, 'Secret key is required'),
  paper: z.boolean().default(true), // Default to paper trading for safety
  baseUrl: z.string().url().optional(),
})

export type AlpacaConfig = z.infer<typeof AlpacaConfigSchema>

export const DEFAULT_PAPER_URL = 'https://paper-api.alpaca.markets'
export const DEFAULT_LIVE_URL = 'https://api.alpaca.markets'
export const OPTIONS_DATA_URL = 'https://data.alpaca.markets'

/**
 * Trading time constraints
 * "Alpaca enforces a 3:15 p.m. ET cutoff for submitting orders"
 */
export const TRADING_CONSTRAINTS = {
  // Market hours (ET)
  marketOpen: { hour: 9, minute: 30 },
  marketClose: { hour: 16, minute: 0 },

  // 0DTE specific cutoffs
  etfOrderCutoff: { hour: 15, minute: 15 }, // 3:15 PM ET
  optionsExerciseCutoff: { hour: 15, minute: 30 }, // 3:30 PM ET

  // Pre-market and after-hours
  preMarketOpen: { hour: 4, minute: 0 },
  afterHoursClose: { hour: 20, minute: 0 },
} as const

/**
 * Check if we're within trading hours
 */
export function isWithinTradingHours(now: Date = new Date()): boolean {
  // Convert to ET (simplified - production should use proper timezone lib)
  const etHour = now.getUTCHours() - 5 // Rough ET offset
  const etMinute = now.getUTCMinutes()

  const { marketOpen, marketClose } = TRADING_CONSTRAINTS

  const afterOpen =
    etHour > marketOpen.hour || (etHour === marketOpen.hour && etMinute >= marketOpen.minute)

  const beforeClose =
    etHour < marketClose.hour || (etHour === marketClose.hour && etMinute < marketClose.minute)

  return afterOpen && beforeClose
}

/**
 * Check if we can still submit 0DTE orders for broad-based ETFs
 */
export function canSubmitETFOrder(now: Date = new Date()): boolean {
  const etHour = now.getUTCHours() - 5
  const etMinute = now.getUTCMinutes()

  const { etfOrderCutoff } = TRADING_CONSTRAINTS

  return (
    etHour < etfOrderCutoff.hour ||
    (etHour === etfOrderCutoff.hour && etMinute < etfOrderCutoff.minute)
  )
}

/**
 * Get time until next market event
 */
export function getTimeUntilCutoff(cutoffType: 'etf' | 'exercise' | 'close'): number {
  const now = new Date()
  const etHour = now.getUTCHours() - 5
  const etMinute = now.getUTCMinutes()

  const cutoffs = {
    etf: TRADING_CONSTRAINTS.etfOrderCutoff,
    exercise: TRADING_CONSTRAINTS.optionsExerciseCutoff,
    close: TRADING_CONSTRAINTS.marketClose,
  }

  const target = cutoffs[cutoffType]
  const minutesUntil = (target.hour - etHour) * 60 + (target.minute - etMinute)

  return Math.max(0, minutesUntil * 60 * 1000) // Return milliseconds
}
