import chalk from 'chalk'
import { TradingAgent } from '../../agent/trading-agent.js'
import { DEFAULT_AGENT_CONFIG } from '../../agent/config.js'
import type { AgentConfig } from '../../agent/config.js'
import type { StrategyName, StrategyRecommendation } from '../../types/strategies.js'

interface AgentOptions {
  underlyings?: string
  strategies?: string
  interval?: string
  maxPositions?: string
  maxDailyLoss?: string
  maxContracts?: string
  stopLoss?: string
  takeProfit?: string
  dryRun?: boolean
  live?: boolean
}

export async function agentCommand(options: AgentOptions): Promise<void> {
  console.log(chalk.bold('\n  AlphaOptions - 0DTE Trading Agent\n'))

  // Parse config from options
  const config: AgentConfig = {
    ...DEFAULT_AGENT_CONFIG,
    underlyings: options.underlyings
      ? options.underlyings.split(',').map((s) => s.trim().toUpperCase())
      : DEFAULT_AGENT_CONFIG.underlyings,
    strategies: options.strategies
      ? (options.strategies.split(',').map((s) => s.trim()) as StrategyName[])
      : DEFAULT_AGENT_CONFIG.strategies,
    scanIntervalMs: options.interval ? Number.parseInt(options.interval, 10) : DEFAULT_AGENT_CONFIG.scanIntervalMs,
    maxPositions: options.maxPositions ? Number.parseInt(options.maxPositions, 10) : DEFAULT_AGENT_CONFIG.maxPositions,
    maxDailyLoss: options.maxDailyLoss ? Number.parseInt(options.maxDailyLoss, 10) : DEFAULT_AGENT_CONFIG.maxDailyLoss,
    maxPositionSize: options.maxContracts ? Number.parseInt(options.maxContracts, 10) : DEFAULT_AGENT_CONFIG.maxPositionSize,
    stopLossPct: options.stopLoss ? Number.parseInt(options.stopLoss, 10) : DEFAULT_AGENT_CONFIG.stopLossPct,
    takeProfitPct: options.takeProfit ? Number.parseInt(options.takeProfit, 10) : DEFAULT_AGENT_CONFIG.takeProfitPct,
    dryRun: options.dryRun ?? false,
    paper: !options.live, // Paper unless --live is explicitly set
  }

  // Safety: force paper mode unless --live is set
  if (!options.live) {
    config.paper = true
  }

  // Display config summary
  const mode = config.dryRun ? 'DRY RUN' : config.paper ? 'PAPER' : 'LIVE'
  const modeColor = config.dryRun ? chalk.blue : config.paper ? chalk.yellow : chalk.red.bold

  console.log(`  Mode:           ${modeColor(mode)}`)
  console.log(`  Underlyings:    ${config.underlyings.join(', ')}`)
  console.log(`  Strategies:     ${config.strategies.join(', ')}`)
  console.log(`  Scan Interval:  ${config.scanIntervalMs / 1000}s`)
  console.log(`  Max Positions:  ${config.maxPositions}`)
  console.log(`  Max Daily Loss: $${config.maxDailyLoss}`)
  console.log(`  Max Contracts:  ${config.maxPositionSize}`)
  console.log(`  Stop Loss:      ${config.stopLossPct}%`)
  console.log(`  Take Profit:    ${config.takeProfitPct}%`)
  console.log()

  // Live mode safety gate
  if (options.live && !config.dryRun) {
    console.log(chalk.red.bold('  WARNING: LIVE TRADING MODE'))
    console.log(chalk.red('  Real money will be at risk.'))
    console.log(chalk.dim('  Starting in 10 seconds... Press Ctrl+C to abort.'))
    console.log()

    await new Promise((resolve) => setTimeout(resolve, 10_000))
  }

  // Create and start agent
  const agent = new TradingAgent(config)

  // Graceful shutdown on SIGINT/SIGTERM
  const shutdown = async () => {
    console.log(chalk.yellow('\n  Shutting down...'))
    await agent.stop()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  try {
    await agent.start()

    // Keep the process alive until the agent stops
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        // Agent will clear its own interval when done
        // This just keeps the Node.js process alive
      }, 5000)

      process.on('SIGINT', () => {
        clearInterval(check)
        resolve()
      })
      process.on('SIGTERM', () => {
        clearInterval(check)
        resolve()
      })
    })
  } catch (error) {
    console.error(chalk.red(`  Agent error: ${error instanceof Error ? error.message : error}`))
    process.exit(1)
  }
}
