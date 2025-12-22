import chalk from 'chalk'
import ora from 'ora'
import { getStrategy, STRATEGY_DEFINITIONS } from '../../strategies/definitions.js'
import { StrategyAnalyzer } from '../../strategies/analyzer.js'
import type { Greeks, OptionContract } from '../../types/options.js'
import type { StrategyName, StrategyRecommendation } from '../../types/strategies.js'

interface AnalyzeOptions {
  strategy?: string
  price?: string
  volatility?: 'low' | 'normal' | 'high'
  paper?: boolean
}

const recommendationColors: Record<StrategyRecommendation, (s: string) => string> = {
  strong_buy: chalk.green.bold,
  buy: chalk.green,
  hold: chalk.yellow,
  avoid: chalk.red,
  strong_avoid: chalk.red.bold,
}

const recommendationEmoji: Record<StrategyRecommendation, string> = {
  strong_buy: '🚀',
  buy: '✅',
  hold: '🤔',
  avoid: '⚠️',
  strong_avoid: '🛑',
}

export async function analyzeCommand(symbol: string, options: AnalyzeOptions): Promise<void> {
  const spinner = ora('Analyzing strategies...').start()

  try {
    const underlyingPrice = options.price ? Number.parseFloat(options.price) : await fetchPrice(symbol)

    if (!underlyingPrice || Number.isNaN(underlyingPrice)) {
      spinner.fail('Could not determine underlying price')
      console.log(chalk.dim('  Use --price <price> to specify manually\n'))
      return
    }

    spinner.text = `Analyzing ${symbol} @ $${underlyingPrice.toFixed(2)}`

    const volatility = options.volatility ?? 'normal'

    // Determine which strategies to analyze
    let strategiesToAnalyze: StrategyName[]

    if (options.strategy) {
      const name = options.strategy.toLowerCase().replace(/-/g, '_') as StrategyName
      if (!STRATEGY_DEFINITIONS[name]) {
        spinner.fail(`Unknown strategy: ${options.strategy}`)
        console.log(chalk.dim('  Use `alpha list` to see available strategies\n'))
        return
      }
      strategiesToAnalyze = [name]
    } else {
      // Analyze top 5 strategies for this scenario
      strategiesToAnalyze = [
        'long_call_stock',
        'long_put_stock',
        'straddle_stock',
        'strangle_stock',
        'long_call_vertical',
      ]
    }

    spinner.succeed('Analysis complete')
    console.log()

    // Print header
    console.log(chalk.bold(`  ${symbol.toUpperCase()} Analysis`))
    console.log(chalk.dim(`  Price: $${underlyingPrice.toFixed(2)} | Volatility: ${volatility}`))
    console.log(chalk.dim('  ' + '─'.repeat(50)))
    console.log()

    const analyzer = new StrategyAnalyzer({
      underlyingPrice,
      riskFreeRate: 0.05, // 5% risk-free rate
      impliedVolatility: volatility === 'high' ? 0.4 : volatility === 'low' ? 0.15 : 0.25,
      timeToExpiry: 0.0027, // ~1 hour for 0DTE
    })

    for (const stratName of strategiesToAnalyze) {
      const strategy = getStrategy(stratName)

      // Generate mock contracts based on strategy
      const contracts = generateMockContracts(strategy.legs, underlyingPrice)
      const greeks = generateMockGreeks(strategy.legs, volatility)

      const analysis = analyzer.analyze(strategy, contracts, greeks, volatility)

      // Display results
      const colorFn = recommendationColors[analysis.recommendation]
      const emoji = recommendationEmoji[analysis.recommendation]

      console.log(`  ${chalk.white.bold(strategy.displayName)} ${emoji}`)
      console.log(chalk.dim(`  ${strategy.description}`))
      console.log()

      // Risk profile
      console.log(chalk.cyan('  Risk Profile:'))
      console.log(`    Max Loss:   ${chalk.red('$' + analysis.riskProfile.maxLoss.toFixed(2))}`)
      console.log(
        `    Max Profit: ${
          analysis.riskProfile.maxProfit === 'unlimited'
            ? chalk.green('Unlimited')
            : chalk.green('$' + analysis.riskProfile.maxProfit.toFixed(2))
        }`
      )

      const breakeven = analysis.riskProfile.breakeven
      if (Array.isArray(breakeven)) {
        console.log(`    Breakeven:  ${chalk.yellow(`$${breakeven[0].toFixed(2)} / $${breakeven[1].toFixed(2)}`)}`)
      } else {
        console.log(`    Breakeven:  ${chalk.yellow('$' + breakeven.toFixed(2))}`)
      }
      console.log()

      // Greeks
      console.log(chalk.cyan('  Net Greeks:'))
      console.log(`    Delta: ${formatGreek(analysis.greeks.netDelta)}`)
      console.log(`    Gamma: ${formatGreek(analysis.greeks.netGamma)}`)
      console.log(`    Theta: ${formatGreek(analysis.greeks.netTheta)} ${chalk.dim('(daily decay)')}`)
      console.log(`    Vega:  ${formatGreek(analysis.greeks.netVega)}`)
      console.log()

      // Recommendation
      console.log(`  Recommendation: ${colorFn(analysis.recommendation.replace(/_/g, ' ').toUpperCase())}`)
      console.log(`  Est. Margin:    $${analysis.margin.toFixed(2)}`)
      console.log()
      console.log(chalk.dim('  ' + '─'.repeat(50)))
      console.log()
    }

    // Footer
    console.log(chalk.dim('  Disclaimer: Analysis is for educational purposes only.'))
    console.log(chalk.dim('  "The provided code is only for demonstration."'))
    console.log()
  } catch (error) {
    spinner.fail('Analysis failed')
    console.error(chalk.red(`  ${error instanceof Error ? error.message : error}`))
  }
}

async function fetchPrice(symbol: string): Promise<number> {
  // In a real implementation, this would fetch from Alpaca or another data source
  // For now, return mock prices for common symbols
  const mockPrices: Record<string, number> = {
    SPY: 505.25,
    QQQ: 435.80,
    AAPL: 175.50,
    TSLA: 177.25,
    NVDA: 880.00,
    MSFT: 415.75,
    AMZN: 178.50,
    META: 505.00,
    GOOGL: 152.30,
  }

  return mockPrices[symbol.toUpperCase()] ?? 100
}

function generateMockContracts(
  legs: { side: 'long' | 'short'; optionType: 'call' | 'put'; strikeOffset: string | number }[],
  underlyingPrice: number
): OptionContract[] {
  return legs.map((leg) => {
    let strike: number
    if (leg.strikeOffset === 'atm') {
      strike = Math.round(underlyingPrice)
    } else if (leg.strikeOffset === 'otm_high') {
      strike = Math.round(underlyingPrice * 1.02)
    } else if (leg.strikeOffset === 'otm_low') {
      strike = Math.round(underlyingPrice * 0.98)
    } else if (leg.strikeOffset === 'itm') {
      strike = leg.optionType === 'call'
        ? Math.round(underlyingPrice * 0.98)
        : Math.round(underlyingPrice * 1.02)
    } else {
      strike = Math.round(underlyingPrice)
    }

    // Mock premium based on moneyness
    const moneyness = Math.abs(strike - underlyingPrice) / underlyingPrice
    const basePremium = underlyingPrice * 0.01 // 1% of underlying
    const premium = Math.max(0.05, basePremium * (1 - moneyness * 5))

    return {
      symbol: `${symbol}MOCK`,
      underlyingSymbol: 'MOCK',
      underlyingType: 'stock' as const,
      optionType: leg.optionType,
      strikePrice: strike,
      expirationDate: new Date(),
      premium,
      contractSize: 100,
    }
  })
}

function generateMockGreeks(
  legs: { side: 'long' | 'short'; optionType: 'call' | 'put' }[],
  volatility: 'low' | 'normal' | 'high'
): Greeks[] {
  const volMultiplier = volatility === 'high' ? 1.5 : volatility === 'low' ? 0.6 : 1

  return legs.map((leg) => {
    const sign = leg.side === 'long' ? 1 : -1
    const callSign = leg.optionType === 'call' ? 1 : -1

    return {
      delta: 0.5 * sign * callSign,
      gamma: 0.05 * Math.abs(sign) * volMultiplier,
      theta: -0.15 * sign * volMultiplier, // Theta is negative for long positions
      vega: 0.10 * sign * volMultiplier,
    }
  })
}

function formatGreek(value: number): string {
  const formatted = value.toFixed(4)
  if (value > 0) return chalk.green('+' + formatted)
  if (value < 0) return chalk.red(formatted)
  return chalk.gray(formatted)
}
