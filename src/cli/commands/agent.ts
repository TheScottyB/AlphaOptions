import chalk from 'chalk'
import { TradingAgent } from '../../agent/trading-agent.js'
import { DEFAULT_AGENT_CONFIG } from '../../agent/config.js'
import type { AgentConfig } from '../../agent/config.js'
import { getStrategy } from '../../strategies/definitions.js'
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

  // Parse and validate numeric options with safe defaults
  const parsePositiveInt = (value: string | undefined, fallback: number, name: string): number => {
    if (!value) return fallback
    const parsed = Number.parseInt(value, 10)
    if (Number.isNaN(parsed) || parsed <= 0) {
      console.error(chalk.red(`  Invalid ${name}: "${value}" - must be a positive integer. Using default: ${fallback}`))
      return fallback
    }
    return parsed
  }

  const parsePct = (value: string | undefined, fallback: number, name: string): number => {
    if (!value) return fallback
    const parsed = Number.parseInt(value, 10)
    if (Number.isNaN(parsed) || parsed < 1 || parsed > 500) {
      console.error(chalk.red(`  Invalid ${name}: "${value}" - must be 1-500. Using default: ${fallback}`))
      return fallback
    }
    return parsed
  }

  // Parse config from options
  const config: AgentConfig = {
    ...DEFAULT_AGENT_CONFIG,
    underlyings: options.underlyings
      ? options.underlyings.split(',').map((s) => s.trim().toUpperCase())
      : DEFAULT_AGENT_CONFIG.underlyings,
    strategies: options.strategies
      ? (options.strategies.split(',').map((s) => s.trim()) as StrategyName[])
      : DEFAULT_AGENT_CONFIG.strategies,
    scanIntervalMs: Math.max(10_000, parsePositiveInt(options.interval, DEFAULT_AGENT_CONFIG.scanIntervalMs, 'interval')),
    maxPositions: Math.min(10, parsePositiveInt(options.maxPositions, DEFAULT_AGENT_CONFIG.maxPositions, 'max-positions')),
    maxDailyLoss: parsePositiveInt(options.maxDailyLoss, DEFAULT_AGENT_CONFIG.maxDailyLoss, 'max-daily-loss'),
    maxPositionSize: Math.min(10, parsePositiveInt(options.maxContracts, DEFAULT_AGENT_CONFIG.maxPositionSize, 'max-contracts')),
    stopLossPct: parsePct(options.stopLoss, DEFAULT_AGENT_CONFIG.stopLossPct, 'stop-loss'),
    takeProfitPct: parsePct(options.takeProfit, DEFAULT_AGENT_CONFIG.takeProfitPct, 'take-profit'),
    dryRun: options.dryRun ?? false,
    paper: !options.live, // Paper unless --live is explicitly set
  }

  // Safety: force paper mode unless --live is set
  if (!options.live) {
    config.paper = true
  }

  // Safety: reject credit strategies (e.g., short_put_vertical) - only debit strategies allowed
  const creditStrategies = config.strategies.filter((name) => {
    try {
      const strat = getStrategy(name)
      return !strat.isDebitOnly
    } catch {
      return false
    }
  })
  if (creditStrategies.length > 0) {
    console.error(chalk.red(`  Blocked credit strategies: ${creditStrategies.join(', ')}`))
    console.error(chalk.red('  The agent only supports debit-only strategies (max loss = premium paid).'))
    config.strategies = config.strategies.filter((name) => !creditStrategies.includes(name)) as StrategyName[]
    if (config.strategies.length === 0) {
      console.error(chalk.red('  No valid strategies remaining. Exiting.'))
      return
    }
    console.log(chalk.yellow(`  Continuing with: ${config.strategies.join(', ')}`))
    console.log()
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

  // Single graceful shutdown handler for SIGINT/SIGTERM
  let shuttingDown = false
  const shutdown = async () => {
    if (shuttingDown) return // Prevent double-shutdown
    shuttingDown = true
    console.log(chalk.yellow('\n  Shutting down...'))
    await agent.stop()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  try {
    await agent.start()

    // Keep the process alive - the agent's internal intervals keep it running.
    // This promise resolves only on shutdown signal.
    await new Promise<void>(() => {
      // Intentionally never resolves - process exits via shutdown handler above
    })
  } catch (error) {
    console.error(chalk.red(`  Agent error: ${error instanceof Error ? error.message : error}`))
    process.exit(1)
  }
}
