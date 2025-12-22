import type { Strategy, StrategyName } from '../types/strategies.js'

/**
 * Strategy definitions based on hedge fund 0DTE research
 *
 * Key insight from research:
 * "These strategies, while simple, require precise timing due to the short lifespan
 * of 0 DTE options, making them more speculative than longer-term options strategies."
 */

export const STRATEGY_DEFINITIONS: Record<StrategyName, Strategy> = {
  /**
   * Long Call on Individual Stocks
   * "Buying a call option to profit if the stock price rises by the end of the day.
   * Risk is the premium paid; profit potential is unlimited if the price increases."
   */
  long_call_stock: {
    name: 'long_call_stock',
    displayName: 'Long Call (Stock)',
    category: 'directional_bullish',
    description:
      'Buy a call option to profit from upward stock movement. ' +
      'Risk limited to premium paid. Unlimited profit potential.',
    legs: [{ side: 'long', optionType: 'call', strikeOffset: 'atm', quantity: 1 }],
    isDebitOnly: true,
    suitable0DTE: true,
  },

  /**
   * Long Put on Individual Stocks
   * "Buying a put option to profit if the stock price falls by the end of the day.
   * Risk is the premium paid; profit potential is unlimited if the price decreases."
   */
  long_put_stock: {
    name: 'long_put_stock',
    displayName: 'Long Put (Stock)',
    category: 'directional_bearish',
    description:
      'Buy a put option to profit from downward stock movement. ' +
      'Risk limited to premium paid. High profit potential on decline.',
    legs: [{ side: 'long', optionType: 'put', strikeOffset: 'atm', quantity: 1 }],
    isDebitOnly: true,
    suitable0DTE: true,
  },

  /**
   * Long Call on Indices
   * "Similar to individual stocks, but on indices like the S&P 500, betting on an upward move."
   */
  long_call_index: {
    name: 'long_call_index',
    displayName: 'Long Call (Index)',
    category: 'directional_bullish',
    description:
      'Buy an index call option for broad market bullish exposure. ' +
      'High liquidity, commonly used by hedge funds.',
    legs: [{ side: 'long', optionType: 'call', strikeOffset: 'atm', quantity: 1 }],
    isDebitOnly: true,
    suitable0DTE: true,
  },

  /**
   * Long Put on Indices
   * "Betting on a downward move in an index, with risk limited to the premium
   * and unlimited profit potential downward."
   */
  long_put_index: {
    name: 'long_put_index',
    displayName: 'Long Put (Index)',
    category: 'directional_bearish',
    description:
      'Buy an index put option for hedging or bearish speculation. ' +
      'Used for portfolio protection during market corrections.',
    legs: [{ side: 'long', optionType: 'put', strikeOffset: 'atm', quantity: 1 }],
    isDebitOnly: true,
    suitable0DTE: true,
  },

  /**
   * Straddle on Individual Stocks
   * "Buying a call and put at the same strike to profit from a big price move
   * in either direction. Risk is the total premium; profit potential is high
   * with significant movement."
   */
  straddle_stock: {
    name: 'straddle_stock',
    displayName: 'Long Straddle (Stock)',
    category: 'neutral_volatility',
    description:
      'Buy both call and put at same strike. Profits from large moves ' +
      'in either direction. Ideal before earnings or major announcements.',
    legs: [
      { side: 'long', optionType: 'call', strikeOffset: 'atm', quantity: 1 },
      { side: 'long', optionType: 'put', strikeOffset: 'atm', quantity: 1 },
    ],
    isDebitOnly: true,
    suitable0DTE: true,
  },

  /**
   * Strangle on Individual Stocks
   * "Buying a call and put at different strikes, also for big moves, with risk
   * limited to the premium and high profit potential for large swings."
   */
  strangle_stock: {
    name: 'strangle_stock',
    displayName: 'Long Strangle (Stock)',
    category: 'neutral_volatility',
    description:
      'Buy OTM call and put at different strikes. Cheaper than straddle ' +
      'but requires larger move for profit. High reward potential.',
    legs: [
      { side: 'long', optionType: 'call', strikeOffset: 'otm_high', quantity: 1 },
      { side: 'long', optionType: 'put', strikeOffset: 'otm_low', quantity: 1 },
    ],
    isDebitOnly: true,
    suitable0DTE: true,
  },

  /**
   * Straddle on Indices
   * "Applying the straddle strategy to indices, expecting volatility in the broader market."
   */
  straddle_index: {
    name: 'straddle_index',
    displayName: 'Long Straddle (Index)',
    category: 'neutral_volatility',
    description:
      'Buy index call and put at same strike. Profits from market-wide ' +
      'volatility events like Fed announcements or geopolitical news.',
    legs: [
      { side: 'long', optionType: 'call', strikeOffset: 'atm', quantity: 1 },
      { side: 'long', optionType: 'put', strikeOffset: 'atm', quantity: 1 },
    ],
    isDebitOnly: true,
    suitable0DTE: true,
  },

  /**
   * Strangle on Indices
   * "Similar to stocks, but on indices, for capturing market-wide volatility."
   */
  strangle_index: {
    name: 'strangle_index',
    displayName: 'Long Strangle (Index)',
    category: 'neutral_volatility',
    description:
      'Buy OTM index call and put. Cost-effective way to capture ' +
      'broad market swings with defined risk.',
    legs: [
      { side: 'long', optionType: 'call', strikeOffset: 'otm_high', quantity: 1 },
      { side: 'long', optionType: 'put', strikeOffset: 'otm_low', quantity: 1 },
    ],
    isDebitOnly: true,
    suitable0DTE: true,
  },

  /**
   * Buying Out-of-the-Money Calls for Speculation
   * "Purchasing calls unlikely to be in the money, for high-risk, high-reward
   * bets on big upward moves."
   */
  otm_call_speculation: {
    name: 'otm_call_speculation',
    displayName: 'OTM Call Speculation',
    category: 'speculation',
    description:
      'Buy deep OTM calls for lottery-style upside. Very high risk ' +
      'but exceptional reward if stock surges unexpectedly.',
    legs: [{ side: 'long', optionType: 'call', strikeOffset: 'otm_high', quantity: 1 }],
    isDebitOnly: true,
    suitable0DTE: true,
  },

  /**
   * Buying Out-of-the-Money Puts for Speculation
   * "Purchasing puts unlikely to be in the money, for high-risk, high-reward
   * bets on big downward moves."
   */
  otm_put_speculation: {
    name: 'otm_put_speculation',
    displayName: 'OTM Put Speculation',
    category: 'speculation',
    description:
      'Buy deep OTM puts for crash protection or speculation. ' +
      'High risk but exceptional reward if stock drops significantly.',
    legs: [{ side: 'long', optionType: 'put', strikeOffset: 'otm_low', quantity: 1 }],
    isDebitOnly: true,
    suitable0DTE: true,
  },

  /**
   * Short Put Vertical (from video analysis)
   * "A short put vertical spread caps losses while allowing premium collection."
   */
  short_put_vertical: {
    name: 'short_put_vertical',
    displayName: 'Bull Put Spread',
    category: 'income',
    description:
      'Sell higher strike put, buy lower strike put for credit. ' +
      'Profits from stable/rising prices. Capped risk and reward.',
    legs: [
      { side: 'short', optionType: 'put', strikeOffset: 'atm', quantity: 1 },
      { side: 'long', optionType: 'put', strikeOffset: 'otm_low', quantity: 1 },
    ],
    isDebitOnly: false, // Credit strategy
    suitable0DTE: true,
  },

  /**
   * Long Call Vertical (debit spread alternative)
   */
  long_call_vertical: {
    name: 'long_call_vertical',
    displayName: 'Bull Call Spread',
    category: 'directional_bullish',
    description:
      'Buy lower strike call, sell higher strike call. ' +
      'Reduced cost bullish play with capped profit potential.',
    legs: [
      { side: 'long', optionType: 'call', strikeOffset: 'atm', quantity: 1 },
      { side: 'short', optionType: 'call', strikeOffset: 'otm_high', quantity: 1 },
    ],
    isDebitOnly: true,
    suitable0DTE: true,
  },
}

export function getStrategy(name: StrategyName): Strategy {
  return STRATEGY_DEFINITIONS[name]
}

export function getDebitOnlyStrategies(): Strategy[] {
  return Object.values(STRATEGY_DEFINITIONS).filter((s) => s.isDebitOnly)
}

export function get0DTESuitableStrategies(): Strategy[] {
  return Object.values(STRATEGY_DEFINITIONS).filter((s) => s.suitable0DTE)
}

export function getStrategiesByCategory(category: Strategy['category']): Strategy[] {
  return Object.values(STRATEGY_DEFINITIONS).filter((s) => s.category === category)
}
