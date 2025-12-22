import Decimal from 'decimal.js'
import type { Greeks, OptionContract, RiskProfile } from '../types/options.js'
import type { Strategy, StrategyAnalysis, StrategyRecommendation } from '../types/strategies.js'

/**
 * Strategy analyzer for 0DTE options
 *
 * Key insight from research:
 * "These strategies are likely successful when hedge funds have strong intraday
 * market insights, such as before news events or earnings announcements."
 */

export interface AnalyzerConfig {
  riskFreeRate: number // Current risk-free interest rate
  impliedVolatility: number // IV for the underlying
  underlyingPrice: number // Current price of the underlying
  timeToExpiry: number // In days (0.0 to 1.0 for 0DTE)
}

export class StrategyAnalyzer {
  private config: AnalyzerConfig

  constructor(config: AnalyzerConfig) {
    this.config = config
  }

  /**
   * Calculate risk profile for a strategy
   * "Risk limited to premium paid; profit potential unlimited if price increases/decreases"
   */
  calculateRiskProfile(strategy: Strategy, contracts: OptionContract[]): RiskProfile {
    const totalPremium = contracts.reduce(
      (sum, c) => sum.plus(new Decimal(c.premium).times(c.contractSize)),
      new Decimal(0)
    )

    // For debit-only strategies, max loss is the premium paid
    if (strategy.isDebitOnly) {
      const maxLoss = totalPremium.toNumber()

      // Calculate breakeven based on strategy type
      const breakeven = this.calculateBreakeven(strategy, contracts)

      // Determine max profit
      const maxProfit = this.calculateMaxProfit(strategy, contracts, totalPremium)

      return {
        maxLoss,
        maxProfit,
        breakeven,
      }
    }

    // For credit strategies (like short put vertical)
    return this.calculateCreditRiskProfile(strategy, contracts)
  }

  private calculateBreakeven(
    strategy: Strategy,
    contracts: OptionContract[]
  ): number | number[] {
    const callContracts = contracts.filter((c) => c.optionType === 'call')
    const putContracts = contracts.filter((c) => c.optionType === 'put')
    const totalPremium = contracts.reduce((sum, c) => sum + c.premium, 0)

    // Single leg strategies
    if (contracts.length === 1) {
      const contract = contracts[0]
      if (!contract) return 0
      if (contract.optionType === 'call') {
        return contract.strikePrice + contract.premium
      }
      return contract.strikePrice - contract.premium
    }

    // Straddle: two breakevens
    if (strategy.name.includes('straddle')) {
      const strike = contracts[0]?.strikePrice ?? 0
      return [strike - totalPremium, strike + totalPremium]
    }

    // Strangle: two breakevens at different strikes
    if (strategy.name.includes('strangle')) {
      const callStrike = callContracts[0]?.strikePrice ?? 0
      const putStrike = putContracts[0]?.strikePrice ?? 0
      const callPremium = callContracts[0]?.premium ?? 0
      const putPremium = putContracts[0]?.premium ?? 0
      return [putStrike - putPremium, callStrike + callPremium]
    }

    // Vertical spreads
    if (strategy.name.includes('vertical')) {
      const longLeg = contracts.find((_, i) => strategy.legs[i]?.side === 'long')
      const shortLeg = contracts.find((_, i) => strategy.legs[i]?.side === 'short')
      if (longLeg && shortLeg) {
        const netDebit = longLeg.premium - shortLeg.premium
        return longLeg.strikePrice + netDebit
      }
    }

    return 0
  }

  private calculateMaxProfit(
    strategy: Strategy,
    contracts: OptionContract[],
    totalPremium: Decimal
  ): number | 'unlimited' {
    // Single directional strategies have unlimited profit potential
    if (strategy.category === 'directional_bullish' || strategy.category === 'directional_bearish') {
      if (contracts.length === 1) {
        return 'unlimited'
      }
    }

    // Straddles and strangles have unlimited profit potential
    if (strategy.category === 'neutral_volatility') {
      return 'unlimited'
    }

    // Speculation strategies (OTM plays) have unlimited potential
    if (strategy.category === 'speculation') {
      return 'unlimited'
    }

    // Vertical spreads have capped profit
    if (strategy.name.includes('vertical')) {
      const strikes = contracts.map((c) => c.strikePrice)
      const spreadWidth = Math.abs(Math.max(...strikes) - Math.min(...strikes))
      return spreadWidth * 100 - totalPremium.toNumber()
    }

    return 'unlimited'
  }

  private calculateCreditRiskProfile(
    strategy: Strategy,
    contracts: OptionContract[]
  ): RiskProfile {
    // For credit strategies like short put vertical
    const creditReceived = contracts
      .filter((_, i) => strategy.legs[i]?.side === 'short')
      .reduce((sum, c) => sum + c.premium * c.contractSize, 0)

    const debitPaid = contracts
      .filter((_, i) => strategy.legs[i]?.side === 'long')
      .reduce((sum, c) => sum + c.premium * c.contractSize, 0)

    const netCredit = creditReceived - debitPaid

    const strikes = contracts.map((c) => c.strikePrice)
    const spreadWidth = Math.abs(Math.max(...strikes) - Math.min(...strikes))
    const maxLoss = spreadWidth * 100 - netCredit

    return {
      maxLoss,
      maxProfit: netCredit,
      breakeven: Math.min(...strikes) + netCredit / 100,
    }
  }

  /**
   * Calculate aggregate Greeks for a strategy
   * "Time decay (theta) is critical for 0DTE options"
   */
  calculateNetGreeks(contracts: OptionContract[], greeks: Greeks[]): StrategyAnalysis['greeks'] {
    const netGreeks = greeks.reduce(
      (acc, g, i) => {
        const multiplier = contracts[i]?.contractSize ?? 100
        return {
          netDelta: acc.netDelta + g.delta * multiplier,
          netGamma: acc.netGamma + g.gamma * multiplier,
          netTheta: acc.netTheta + g.theta * multiplier,
          netVega: acc.netVega + g.vega * multiplier,
        }
      },
      { netDelta: 0, netGamma: 0, netTheta: 0, netVega: 0 }
    )

    return netGreeks
  }

  /**
   * Generate strategy recommendation
   * Based on market conditions and risk/reward profile
   */
  generateRecommendation(
    riskProfile: RiskProfile,
    netGreeks: StrategyAnalysis['greeks'],
    marketVolatility: 'low' | 'normal' | 'high'
  ): StrategyRecommendation {
    // High theta decay is generally bad for long options in 0DTE
    // unless expecting significant movement
    const thetaImpact = Math.abs(netGreeks.netTheta)

    // Risk/reward ratio
    const maxLoss = riskProfile.maxLoss
    const potentialReward =
      riskProfile.maxProfit === 'unlimited' ? maxLoss * 10 : riskProfile.maxProfit

    const riskRewardRatio = potentialReward / maxLoss

    // Scoring logic
    let score = 0

    // Good risk/reward improves score
    if (riskRewardRatio >= 3) score += 2
    else if (riskRewardRatio >= 2) score += 1
    else if (riskRewardRatio < 1) score -= 2

    // High volatility favors long options
    if (marketVolatility === 'high') {
      if (netGreeks.netVega > 0) score += 1
    } else if (marketVolatility === 'low') {
      if (netGreeks.netVega > 0) score -= 1
    }

    // Consider theta burn for 0DTE
    if (thetaImpact > maxLoss * 0.1) {
      score -= 1 // Significant theta decay
    }

    // Map score to recommendation
    if (score >= 3) return 'strong_buy'
    if (score >= 1) return 'buy'
    if (score >= 0) return 'hold'
    if (score >= -2) return 'avoid'
    return 'strong_avoid'
  }

  /**
   * Full strategy analysis
   */
  analyze(
    strategy: Strategy,
    contracts: OptionContract[],
    greeks: Greeks[],
    marketVolatility: 'low' | 'normal' | 'high' = 'normal'
  ): StrategyAnalysis {
    const riskProfile = this.calculateRiskProfile(strategy, contracts)
    const netGreeks = this.calculateNetGreeks(contracts, greeks)
    const recommendation = this.generateRecommendation(riskProfile, netGreeks, marketVolatility)

    // Calculate margin (simplified - actual margin depends on broker)
    const margin = strategy.isDebitOnly
      ? riskProfile.maxLoss
      : riskProfile.maxLoss * 1.5 // Credit strategies typically require more margin

    return {
      strategy,
      contracts,
      riskProfile,
      greeks: netGreeks,
      margin,
      recommendation,
    }
  }
}

/**
 * Quick analysis helper
 */
export function analyzeStrategy(
  strategy: Strategy,
  contracts: OptionContract[],
  greeks: Greeks[],
  config: AnalyzerConfig,
  marketVolatility: 'low' | 'normal' | 'high' = 'normal'
): StrategyAnalysis {
  const analyzer = new StrategyAnalyzer(config)
  return analyzer.analyze(strategy, contracts, greeks, marketVolatility)
}
