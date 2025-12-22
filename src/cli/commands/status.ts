import chalk from 'chalk'
import ora from 'ora'
import { isWithinTradingHours, canSubmitETFOrder, getTimeUntilCutoff } from '../../alpaca/config.js'
import { createClientFromEnv } from '../../alpaca/client.js'

interface StatusOptions {
  account?: boolean
  positions?: boolean
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  console.log(chalk.bold('\n  AlphaOptions - Status\n'))

  // Market status
  displayMarketStatus()

  // Account info if requested
  if (options.account || options.positions) {
    await displayAccountInfo(options)
  }
}

function displayMarketStatus(): void {
  console.log(chalk.cyan('  Market Status'))
  console.log(chalk.dim('  ' + '─'.repeat(40)))

  const now = new Date()
  const tradingOpen = isWithinTradingHours(now)
  const canTradeETF = canSubmitETFOrder(now)

  // Market hours
  console.log(
    `  Market:       ${tradingOpen ? chalk.green('OPEN') : chalk.red('CLOSED')}`
  )

  // ETF cutoff
  if (tradingOpen) {
    console.log(
      `  ETF Orders:   ${canTradeETF ? chalk.green('ALLOWED') : chalk.red('CUTOFF PASSED')}`
    )

    // Time until cutoffs
    const etfCutoff = getTimeUntilCutoff('etf')
    const closeCutoff = getTimeUntilCutoff('close')

    if (etfCutoff > 0) {
      console.log(
        chalk.dim(`  ETF Cutoff in ${formatDuration(etfCutoff)} (3:15 PM ET)`)
      )
    }

    console.log(
      chalk.dim(`  Close in ${formatDuration(closeCutoff)} (4:00 PM ET)`)
    )
  }

  console.log()

  // 0DTE info
  console.log(chalk.cyan('  0DTE Info'))
  console.log(chalk.dim('  ' + '─'.repeat(40)))

  const dayOfWeek = now.getDay()
  const is0DTEDay = dayOfWeek >= 1 && dayOfWeek <= 5 // Mon-Fri

  console.log(
    `  0DTE Available: ${is0DTEDay ? chalk.green('YES') : chalk.yellow('WEEKEND')}`
  )

  if (is0DTEDay) {
    console.log(chalk.dim('  SPY/QQQ options expire daily'))
    console.log(chalk.dim('  SPX options expire Mon, Wed, Fri'))
  }

  console.log()
}

async function displayAccountInfo(options: StatusOptions): Promise<void> {
  const spinner = ora('Connecting to Alpaca...').start()

  try {
    const client = createClientFromEnv()
    const status = client.getStatus()

    spinner.succeed(status.isPaper ? 'Connected (PAPER)' : 'Connected (LIVE)')
    console.log()

    if (options.account) {
      const account = await client.getAccount()

      console.log(chalk.cyan('  Account'))
      console.log(chalk.dim('  ' + '─'.repeat(40)))
      console.log(`  ID:           ${account.id}`)
      console.log(`  Equity:       ${chalk.green('$' + account.equity.toFixed(2))}`)
      console.log(`  Cash:         $${account.cash.toFixed(2)}`)
      console.log(`  Buying Power: $${account.buyingPower.toFixed(2)}`)
      console.log(`  Day Trades:   ${account.daytradeCount}/3`)
      console.log(
        `  PDT Status:   ${
          account.patternDayTrader ? chalk.yellow('PDT') : chalk.green('OK')
        }`
      )
      console.log()
    }

    if (options.positions) {
      const positions = await client.getPositions()

      console.log(chalk.cyan('  Positions'))
      console.log(chalk.dim('  ' + '─'.repeat(40)))

      if (positions.length === 0) {
        console.log(chalk.dim('  No open positions'))
      } else {
        for (const pos of positions) {
          const plColor = pos.unrealizedPl >= 0 ? chalk.green : chalk.red
          console.log(
            `  ${pos.symbol.padEnd(10)} ${pos.side.padEnd(6)} ${pos.qty}x @ $${pos.currentPrice.toFixed(2)}`
          )
          console.log(
            chalk.dim(`    Cost: $${pos.costBasis.toFixed(2)} | P/L: `) +
              plColor(`$${pos.unrealizedPl.toFixed(2)}`)
          )
        }
      }
      console.log()
    }
  } catch (error) {
    spinner.fail('Connection failed')

    if (error instanceof Error) {
      if (error.message.includes('Missing Alpaca credentials')) {
        console.log(chalk.dim('\n  Set environment variables:'))
        console.log(chalk.dim('    ALPACA_API_KEY=your_key'))
        console.log(chalk.dim('    ALPACA_SECRET_KEY=your_secret'))
        console.log(chalk.dim('    ALPACA_PAPER=true'))
      } else {
        console.log(chalk.red(`  ${error.message}`))
      }
    }
    console.log()
  }
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60

  if (hours > 0) {
    return `${hours}h ${mins}m`
  }
  return `${mins}m`
}
