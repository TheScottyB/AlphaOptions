import { z } from 'zod'

/**
 * Core option types reflecting the 0DTE strategies from research
 * "Zero DTE options have minimal overnight risk and intense time decay"
 */

export const OptionTypeSchema = z.enum(['call', 'put'])
export type OptionType = z.infer<typeof OptionTypeSchema>

export const PositionSideSchema = z.enum(['long', 'short'])
export type PositionSide = z.infer<typeof PositionSideSchema>

export const UnderlyingTypeSchema = z.enum(['stock', 'index', 'etf'])
export type UnderlyingType = z.infer<typeof UnderlyingTypeSchema>

export const OptionContractSchema = z.object({
  symbol: z.string().min(1),
  underlyingSymbol: z.string().min(1),
  underlyingType: UnderlyingTypeSchema,
  optionType: OptionTypeSchema,
  strikePrice: z.number().positive(),
  expirationDate: z.date(),
  premium: z.number().nonnegative(),
  contractSize: z.number().int().positive().default(100),
})

export type OptionContract = z.infer<typeof OptionContractSchema>

export const OptionPositionSchema = z.object({
  contract: OptionContractSchema,
  side: PositionSideSchema,
  quantity: z.number().int().positive(),
  entryPrice: z.number().positive(),
  entryTime: z.date(),
})

export type OptionPosition = z.infer<typeof OptionPositionSchema>

// Greeks for options pricing
export const GreeksSchema = z.object({
  delta: z.number().min(-1).max(1),
  gamma: z.number(),
  theta: z.number(), // Time decay - critical for 0DTE
  vega: z.number(),
  rho: z.number().optional(),
})

export type Greeks = z.infer<typeof GreeksSchema>

// Market data snapshot
export const MarketSnapshotSchema = z.object({
  symbol: z.string(),
  bid: z.number().nonnegative(),
  ask: z.number().nonnegative(),
  last: z.number().nonnegative(),
  volume: z.number().int().nonnegative(),
  openInterest: z.number().int().nonnegative(),
  timestamp: z.date(),
})

export type MarketSnapshot = z.infer<typeof MarketSnapshotSchema>

/**
 * Risk profile as described in the hedge fund strategy research
 * "Risk limited to premium paid; profit potential unlimited/high"
 */
export const RiskProfileSchema = z.object({
  maxLoss: z.number(), // Premium paid for debit strategies
  maxProfit: z.number().or(z.literal('unlimited')),
  breakeven: z.number().or(z.array(z.number())),
  probabilityOfProfit: z.number().min(0).max(1).optional(),
})

export type RiskProfile = z.infer<typeof RiskProfileSchema>
