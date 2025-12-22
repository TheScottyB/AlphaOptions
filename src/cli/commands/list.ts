import chalk from 'chalk'
import {
  getDebitOnlyStrategies,
  get0DTESuitableStrategies,
  getStrategiesByCategory,
  STRATEGY_DEFINITIONS,
} from '../../strategies/definitions.js'
import type { StrategyCategory } from '../../types/strategies.js'

interface ListOptions {
  category?: string
  debitOnly?: boolean
  '0dte'?: boolean
}

const categoryMap: Record<string, StrategyCategory> = {
  bullish: 'directional_bullish',
  bearish: 'directional_bearish',
  volatility: 'neutral_volatility',
  speculation: 'speculation',
  income: 'income',
}

const categoryColors: Record<StrategyCategory, (s: string) => string> = {
  directional_bullish: chalk.green,
  directional_bearish: chalk.red,
  neutral_volatility: chalk.yellow,
  speculation: chalk.magenta,
  income: chalk.cyan,
}

export function listCommand(options: ListOptions): void {
  console.log(chalk.bold('\n  AlphaOptions - 0DTE Strategies\n'))
  console.log(chalk.dim('  Based on hedge fund research\n'))

  let strategies = Object.values(STRATEGY_DEFINITIONS)

  // Apply filters
  if (options.category) {
    const mapped = categoryMap[options.category.toLowerCase()]
    if (mapped) {
      strategies = getStrategiesByCategory(mapped)
    } else {
      console.log(chalk.red(`  Unknown category: ${options.category}`))
      console.log(chalk.dim('  Available: bullish, bearish, volatility, speculation, income\n'))
      return
    }
  }

  if (options.debitOnly) {
    strategies = strategies.filter((s) => s.isDebitOnly)
  }

  if (options['0dte']) {
    strategies = strategies.filter((s) => s.suitable0DTE)
  }

  if (strategies.length === 0) {
    console.log(chalk.yellow('  No strategies match your criteria.\n'))
    return
  }

  // Group by category
  const grouped = strategies.reduce(
    (acc, s) => {
      const cat = s.category
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(s)
      return acc
    },
    {} as Record<StrategyCategory, typeof strategies>
  )

  for (const [category, strats] of Object.entries(grouped)) {
    const colorFn = categoryColors[category as StrategyCategory]
    const categoryDisplay = category.replace(/_/g, ' ').toUpperCase()

    console.log(colorFn(`  ${categoryDisplay}`))
    console.log(chalk.dim('  ' + '─'.repeat(40)))

    for (const s of strats) {
      const debitBadge = s.isDebitOnly ? chalk.green(' [DEBIT]') : chalk.red(' [CREDIT]')
      const dteBadge = s.suitable0DTE ? chalk.blue(' [0DTE]') : ''

      console.log(`  ${chalk.white(s.displayName)}${debitBadge}${dteBadge}`)
      console.log(chalk.dim(`    ${s.description}`))

      // Show legs
      const legsDesc = s.legs
        .map((l) => `${l.side} ${l.optionType} @ ${l.strikeOffset}`)
        .join(' + ')
      console.log(chalk.gray(`    Legs: ${legsDesc}`))
      console.log()
    }
  }

  console.log(chalk.dim('  Use `alpha analyze <symbol> -s <strategy>` to analyze\n'))
}
