import chalk from 'chalk'
import ora from 'ora'
import { getStrategy, STRATEGY_DEFINITIONS } from '../../strategies/definitions.js'
import { StrategyAnalyzer } from '../../strategies/analyzer.js'
import { createOptionsDataClientFromEnv } from '../../alpaca/options-data.js'
import { selectContract, toOptionContract, toGreeks } from '../../agent/contract-selector.js'
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

const recommendationLabels: Record<StrategyRecommendation, string> = {
  strong_buy: '>>',
  buy: '+',
  hold: '~',
  avoid: '!',
  strong_avoid: 'X',
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

    spinner.text = `Fetching 0DTE option chain for ${symbol} @ $${underlyingPrice.toFixed(2)}`

    // Fetch real 0DTE option chain from Alpaca data API
    const optionsClient = createOptionsDataClientFromEnv()
    const chain0DTE = await optionsClient.get0DTEOptions(symbol.toUpperCase())
    const hasRealData = chain0DTE.length > 0

    if (!hasRealData) {
      spinner.warn(`No 0DTE options found for ${symbol} today - using estimated data`)
    } else {
      spinner.text = `Analyzing ${symbol} @ $${underlyingPrice.toFixed(2)} (${chain0DTE.length} contracts)`
    }

    const volatility = options.volatility ?? 'normal'

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

    const dataSource = hasRealData ? 'LIVE' : 'ESTIMATED'
    console.log(chalk.bold(`  ${symbol.toUpperCase()} Analysis`))
    console.log(chalk.dim(`  Price: $${underlyingPrice.toFixed(2)} | Volatility: ${volatility} | Data: ${dataSource}`))
    console.log(chalk.dim('  ' + '─'.repeat(50)))
    console.log()

    const analyzer = new StrategyAnalyzer({
      underlyingPrice,
      riskFreeRate: 0.05,
      impliedVolatility: volatility === 'high' ? 0.4 : volatility === 'low' ? 0.15 : 0.25,
      timeToExpiry: 0.0027,
    })

    for (const stratName of strategiesToAnalyze) {
      const strategy = getStrategy(stratName)

      let contracts: OptionContract[]
      let greeks: Greeks[]

      if (hasRealData) {
        const selectedContracts = strategy.legs.map((leg) =>
          selectContract(chain0DTE, leg, underlyingPrice)
        )

        if (selectedContracts.some((c) => c == null)) {
          console.log(`  ${chalk.white.bold(strategy.displayName)} ${chalk.dim('(skipped - no matching contracts)')}`)
          console.log(chalk.dim('  ' + '─'.repeat(50)))
          console.log()
          continue
        }

        contracts = selectedContracts.map((c) => toOptionContract(c!))
        greeks = selectedContracts.map((c) => toGreeks(c!))
      } else {
        contracts = generateEstimatedContracts(strategy.legs, symbol, underlyingPrice)
        greeks = generateEstimatedGreeks(strategy.legs, volatility)
      }

      const analysis = analyzer.analyze(strategy, contracts, greeks, volatility)

      const colorFn = recommendationColors[analysis.recommendation]
      const label = recommendationLabels[analysis.recommendation]

      console.log(`  ${chalk.white.bold(strategy.displayName)} [${label}]`)
      console.log(chalk.dim(`  ${strategy.description}`))
      console.log()

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
        console.log(`    Breakeven:  ${chalk.yellow(`$${(breakeven[0] ?? 0).toFixed(2)} / $${(breakeven[1] ?? 0).toFixed(2)}`)}`)
      } else {
        console.log(`    Breakeven:  ${chalk.yellow('$' + breakeven.toFixed(2))}`)
      }

      if (hasRealData) {
        console.log()
        console.log(chalk.cyan('  Contracts:'))
        for (const contract of contracts) {
          const legType = contract.optionType.toUpperCase()
          console.log(`    ${legType} $${contract.strikePrice} @ $${contract.premium.toFixed(2)}`)
        }
      }
      console.log()

      console.log(chalk.cyan('  Net Greeks:'))
      console.log(`    Delta: ${formatGreek(analysis.greeks.netDelta)}`)
      console.log(`    Gamma: ${formatGreek(analysis.greeks.netGamma)}`)
      console.log(`    Theta: ${formatGreek(analysis.greeks.netTheta)} ${chalk.dim('(daily decay)')}`)
      console.log(`    Vega:  ${formatGreek(analysis.greeks.netVega)}`)
      console.log()

      console.log(`  Recommendation: ${colorFn(analysis.recommendation.replace(/_/g, ' ').toUpperCase())}`)
      console.log(`  Est. Margin:    $${analysis.margin.toFixed(2)}`)
      console.log()
      console.log(chalk.dim('  ' + '─'.repeat(50)))
      console.log()
    }

    console.log(chalk.dim('  Disclaimer: Analysis is for educational purposes only.'))
    console.log(chalk.dim('  0DTE options carry significant risk. Use paper trading first.'))
    console.log()
  } catch (error) {
    spinner.fail('Analysis failed')
    console.error(chalk.red(`  ${error instanceof Error ? error.message : error}`))
  }
}

async function fetchPrice(symbol: string): Promise<number> {
  const apiKey = process.env['ALPACA_API_KEY']
  const secretKey = process.env['ALPACA_SECRET_KEY']

  if (!apiKey || !secretKey) {
    throw new Error('Missing Alpaca credentials. Set ALPACA_API_KEY and ALPACA_SECRET_KEY.')
  }

  const response = await fetch(
    `https://data.alpaca.markets/v2/stocks/${symbol.toUpperCase()}/snapshot`,
    {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': secretKey,
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Price fetch failed for ${symbol}: ${response.status}`)
  }

  const data = (await response.json()) as { latestTrade?: { p?: number } }
  const price = data.latestTrade?.p
  if (price == null) {
    throw new Error(`No trade data available for ${symbol}`)
  }
  return price
}

function generateEstimatedContracts(
  legs: { side: 'long' | 'short'; optionType: 'call' | 'put'; strikeOffset: string | number }[],
  symbol: string,
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
      strike =
        leg.optionType === 'call'
          ? Math.round(underlyingPrice * 0.98)
          : Math.round(underlyingPrice * 1.02)
    } else {
      strike = Math.round(underlyingPrice)
    }

    const moneyness = Math.abs(strike - underlyingPrice) / underlyingPrice
    const basePremium = underlyingPrice * 0.01
    const premium = Math.max(0.05, basePremium * (1 - moneyness * 5))

    return {
      symbol: `${symbol.toUpperCase()}EST`,
      underlyingSymbol: symbol.toUpperCase(),
      underlyingType: 'stock' as const,
      optionType: leg.optionType,
      strikePrice: strike,
      expirationDate: new Date(),
      premium,
      contractSize: 100,
    }
  })
}

function generateEstimatedGreeks(
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
      theta: -0.15 * sign * volMultiplier,
      vega: 0.1 * sign * volMultiplier,
    }
  })
}

function formatGreek(value: number): string {
  const formatted = value.toFixed(4)
  if (value > 0) return chalk.green('+' + formatted)
  if (value < 0) return chalk.red(formatted)
  return chalk.gray(formatted)
}
