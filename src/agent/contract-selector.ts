import type { OptionContractData } from '../alpaca/options-data.js'
import type { StrategyLeg } from '../types/strategies.js'
import type { OptionContract, Greeks } from '../types/options.js'

/**
 * Select a real contract from the option chain matching a strategy leg definition.
 */
export function selectContract(
  contracts: OptionContractData[],
  leg: StrategyLeg,
  underlyingPrice: number
): OptionContractData | undefined {
  const filtered = contracts.filter((c) => c.type === leg.optionType)
  if (filtered.length === 0) return undefined

  switch (leg.strikeOffset) {
    case 'atm':
      return filtered.reduce((best, c) =>
        Math.abs(c.strike - underlyingPrice) < Math.abs(best.strike - underlyingPrice) ? c : best
      )

    case 'otm_high':
      // First OTM call (strike above) or deep OTM put (strike well below)
      if (leg.optionType === 'call') {
        const otm = filtered.filter((c) => c.strike > underlyingPrice).sort((a, b) => a.strike - b.strike)
        return otm[0]
      }
      // For puts, "otm_high" means far OTM (well below price)
      const farOtmPuts = filtered.filter((c) => c.strike < underlyingPrice).sort((a, b) => a.strike - b.strike)
      return farOtmPuts[0]

    case 'otm_low':
      // First OTM put (strike below) or slightly OTM call
      if (leg.optionType === 'put') {
        const otm = filtered.filter((c) => c.strike < underlyingPrice).sort((a, b) => b.strike - a.strike)
        return otm[0]
      }
      // For calls, "otm_low" means near OTM
      const nearOtmCalls = filtered.filter((c) => c.strike > underlyingPrice).sort((a, b) => a.strike - b.strike)
      return nearOtmCalls[0]

    case 'itm':
      if (leg.optionType === 'call') {
        const itm = filtered.filter((c) => c.strike < underlyingPrice).sort((a, b) => b.strike - a.strike)
        return itm[0]
      }
      const itmPuts = filtered.filter((c) => c.strike > underlyingPrice).sort((a, b) => a.strike - b.strike)
      return itmPuts[0]

    default:
      // Numeric delta offset - find contract closest to target delta
      if (typeof leg.strikeOffset === 'number') {
        const targetDelta = leg.strikeOffset
        const withDelta = filtered.filter((c) => c.delta != null)
        if (withDelta.length === 0) {
          // Fallback to ATM
          return filtered.reduce((best, c) =>
            Math.abs(c.strike - underlyingPrice) < Math.abs(best.strike - underlyingPrice) ? c : best
          )
        }
        return withDelta.reduce((best, c) =>
          Math.abs((c.delta ?? 0) - targetDelta) < Math.abs((best.delta ?? 0) - targetDelta)
            ? c
            : best
        )
      }
      // Unknown offset, default to ATM
      return filtered.reduce((best, c) =>
        Math.abs(c.strike - underlyingPrice) < Math.abs(best.strike - underlyingPrice) ? c : best
      )
  }
}

/**
 * Convert OptionContractData to the OptionContract type used by the analyzer.
 */
export function toOptionContract(data: OptionContractData): OptionContract {
  return {
    symbol: data.symbol,
    underlyingSymbol: data.underlying,
    underlyingType: inferUnderlyingType(data.underlying),
    optionType: data.type,
    strikePrice: data.strike,
    expirationDate: new Date(data.expiration),
    premium: (data.bid + data.ask) / 2,
    contractSize: 100,
  }
}

/**
 * Extract Greeks from OptionContractData.
 */
export function toGreeks(data: OptionContractData): Greeks {
  return {
    delta: data.delta ?? 0,
    gamma: data.gamma ?? 0,
    theta: data.theta ?? 0,
    vega: data.vega ?? 0,
  }
}

function inferUnderlyingType(symbol: string): 'stock' | 'index' | 'etf' {
  const etfs = ['SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'XLF', 'XLE', 'GLD', 'SLV']
  const indices = ['SPX', 'NDX', 'RUT', 'VIX']
  const upper = symbol.toUpperCase()
  if (indices.includes(upper)) return 'index'
  if (etfs.includes(upper)) return 'etf'
  return 'stock'
}
