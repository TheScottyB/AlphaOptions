import { z } from 'zod'
import type { OptionContract, RiskProfile } from './options.js'

/**
 * Strategy definitions based on hedge fund 0DTE research
 *
 * From the research:
 * "10 potential strategies hedge funds might use, all debit-only and suitable for 0 DTE options"
 */

export const StrategyNameSchema = z.enum([
  // Single-leg strategies
  'long_call_stock',
  'long_put_stock',
  'long_call_index',
  'long_put_index',
  // Multi-leg strategies
  'straddle_stock',
  'strangle_stock',
  'straddle_index',
  'strangle_index',
  // OTM speculation
  'otm_call_speculation',
  'otm_put_speculation',
  // Spreads (from the video analysis)
  'short_put_vertical',
  'long_call_vertical',
])

export type StrategyName = z.infer<typeof StrategyNameSchema>

export const StrategyCategorySchema = z.enum([
  'directional_bullish',
  'directional_bearish',
  'neutral_volatility',
  'speculation',
  'income',
])

export type StrategyCategory = z.infer<typeof StrategyCategorySchema>

export interface Strategy {
  name: StrategyName
  displayName: string
  category: StrategyCategory
  description: string
  legs: StrategyLeg[]
  isDebitOnly: boolean
  suitable0DTE: boolean
}

export interface StrategyLeg {
  side: 'long' | 'short'
  optionType: 'call' | 'put'
  strikeOffset: 'atm' | 'otm_high' | 'otm_low' | 'itm' | number // number = delta offset
  quantity: number
}

export interface StrategyAnalysis {
  strategy: Strategy
  contracts: OptionContract[]
  riskProfile: RiskProfile
  greeks: {
    netDelta: number
    netGamma: number
    netTheta: number
    netVega: number
  }
  margin: number
  recommendation: StrategyRecommendation
}

export type StrategyRecommendation = 'strong_buy' | 'buy' | 'hold' | 'avoid' | 'strong_avoid'

/**
 * Trade signal from market analysis
 * "Identifying technical indicators, like double bottoms, supports profitable timing"
 */
export const TradeSignalSchema = z.object({
  symbol: z.string(),
  direction: z.enum(['bullish', 'bearish', 'neutral']),
  confidence: z.number().min(0).max(1),
  suggestedStrategies: z.array(StrategyNameSchema),
  technicalIndicators: z.array(z.string()),
  timestamp: z.date(),
})

export type TradeSignal = z.infer<typeof TradeSignalSchema>

/**
 * Trade execution parameters
 * "Alpaca enforces a 3:15 p.m. ET cutoff for submitting orders for broad-based ETFs"
 */
export const TradeExecutionSchema = z.object({
  strategy: StrategyNameSchema,
  symbol: z.string(),
  quantity: z.number().int().positive(),
  limitPrice: z.number().positive().optional(),
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
  expirationTime: z.date().optional(), // For GTC orders
})

export type TradeExecution = z.infer<typeof TradeExecutionSchema>
