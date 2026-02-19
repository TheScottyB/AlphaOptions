import type { StrategyName, StrategyRecommendation } from '../types/strategies.js'

export interface AgentConfig {
  /** Underlying symbols to scan (e.g., ['SPY']) */
  underlyings: string[]
  /** Which strategies to evaluate */
  strategies: StrategyName[]
  /** How often to scan for opportunities (ms) */
  scanIntervalMs: number
  /** Maximum simultaneous positions */
  maxPositions: number
  /** Maximum daily loss in dollars before stopping */
  maxDailyLoss: number
  /** Maximum contracts per trade */
  maxPositionSize: number
  /** Stop loss as percentage of premium paid */
  stopLossPct: number
  /** Take profit as percentage of premium paid */
  takeProfitPct: number
  /** Minimum recommendation level to enter a trade */
  minRecommendation: StrategyRecommendation
  /** Paper trading mode (default: true) */
  paper: boolean
  /** Log trades without executing */
  dryRun: boolean
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  underlyings: ['SPY'],
  strategies: ['long_call_stock', 'long_put_stock', 'straddle_stock'],
  scanIntervalMs: 60_000,
  maxPositions: 2,
  maxDailyLoss: 500,
  maxPositionSize: 1,
  stopLossPct: 50,
  takeProfitPct: 100,
  minRecommendation: 'buy',
  paper: true,
  dryRun: false,
}

/** Recommendation levels ordered from best to worst */
const RECOMMENDATION_ORDER: StrategyRecommendation[] = [
  'strong_buy',
  'buy',
  'hold',
  'avoid',
  'strong_avoid',
]

/** Check if a recommendation meets the minimum threshold */
export function meetsMinRecommendation(
  actual: StrategyRecommendation,
  minimum: StrategyRecommendation
): boolean {
  return RECOMMENDATION_ORDER.indexOf(actual) <= RECOMMENDATION_ORDER.indexOf(minimum)
}
