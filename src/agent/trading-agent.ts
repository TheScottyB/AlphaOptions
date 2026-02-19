import { AlpacaClient, createClientFromEnv } from '../alpaca/client.js'
import type { OptionOrder } from '../alpaca/client.js'
import { OptionsDataClient, createOptionsDataClientFromEnv } from '../alpaca/options-data.js'
import type { OptionContractData } from '../alpaca/options-data.js'
import { StrategyAnalyzer } from '../strategies/analyzer.js'
import { getStrategy } from '../strategies/definitions.js'
import { isWithinTradingHours, canSubmitETFOrder } from '../alpaca/config.js'
import { selectContract, toOptionContract, toGreeks } from './contract-selector.js'
import type { AgentConfig } from './config.js'
import { meetsMinRecommendation } from './config.js'
import type { StrategyAnalysis } from '../types/strategies.js'

interface TrackedPosition {
  symbol: string
  orderId: string
  strategy: string
  entryPrice: number
  quantity: number
  stopLoss: number
  takeProfit: number
  enteredAt: Date
}

export class TradingAgent {
  private client: AlpacaClient
  private dataClient: OptionsDataClient
  private config: AgentConfig
  private positions: TrackedPosition[] = []
  private dailyPnL = 0
  private running = false
  private intervalId: ReturnType<typeof setInterval> | null = null
  private eodTimeoutId: ReturnType<typeof setTimeout> | null = null
  private cycleCount = 0

  constructor(config: AgentConfig) {
    this.config = config
    this.client = createClientFromEnv()
    this.dataClient = createOptionsDataClientFromEnv()
  }

  async start(): Promise<void> {
    if (this.running) {
      this.log('WARN', 'Agent is already running')
      return
    }

    this.running = true
    this.dailyPnL = 0
    this.cycleCount = 0

    // Verify account connectivity
    try {
      const account = await this.client.getAccount()
      this.log('INFO', 'Connected to Alpaca', {
        mode: this.config.paper ? 'PAPER' : 'LIVE',
        equity: account.equity,
        buyingPower: account.buyingPower,
        daytradeCount: account.daytradeCount,
      })
    } catch (err) {
      this.log('ERROR', `Failed to connect: ${err instanceof Error ? err.message : err}`)
      this.running = false
      throw err
    }

    // Display config
    this.log('INFO', 'Agent configuration', {
      underlyings: this.config.underlyings,
      strategies: this.config.strategies,
      scanInterval: `${this.config.scanIntervalMs / 1000}s`,
      maxPositions: this.config.maxPositions,
      maxDailyLoss: `$${this.config.maxDailyLoss}`,
      maxContracts: this.config.maxPositionSize,
      stopLoss: `${this.config.stopLossPct}%`,
      takeProfit: `${this.config.takeProfitPct}%`,
      dryRun: this.config.dryRun,
    })

    // Schedule EOD exit at 3:10 PM ET
    this.scheduleEODExit()

    // Run first cycle immediately
    await this.runCycle()

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.runCycle().catch((err) => {
        this.log('ERROR', `Cycle error: ${err instanceof Error ? err.message : err}`)
      })
    }, this.config.scanIntervalMs)

    this.log('INFO', `Agent started - scanning every ${this.config.scanIntervalMs / 1000}s`)
  }

  async stop(): Promise<void> {
    this.log('INFO', 'Stopping agent...')
    this.running = false

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    if (this.eodTimeoutId) {
      clearTimeout(this.eodTimeoutId)
      this.eodTimeoutId = null
    }

    // Close all open positions
    if (this.positions.length > 0) {
      this.log('INFO', `Closing ${this.positions.length} open position(s)...`)
      await this.closeAllPositions()
    }

    this.log('INFO', 'Agent stopped', {
      dailyPnL: this.dailyPnL,
      totalCycles: this.cycleCount,
    })
  }

  private async runCycle(): Promise<void> {
    if (!this.running) return

    this.cycleCount++
    const now = new Date()

    // Check if we should stop trading
    const stopReason = this.shouldStopTrading(now)
    if (stopReason) {
      this.log('INFO', `Skipping scan: ${stopReason}`)
      // Still monitor existing positions even if we can't open new ones
      await this.monitorPositions()
      return
    }

    // Monitor existing positions first
    await this.monitorPositions()

    // Scan for new opportunities if we have room
    if (this.positions.length < this.config.maxPositions) {
      await this.scanForOpportunities()
    }

    this.log('CYCLE', `Cycle #${this.cycleCount} complete`, {
      positions: this.positions.length,
      dailyPnL: this.dailyPnL,
    })
  }

  private async monitorPositions(): Promise<void> {
    for (const position of [...this.positions]) {
      try {
        const snapshot = await this.dataClient.getSnapshot(position.symbol)
        const currentMid = (snapshot.bid + snapshot.ask) / 2

        if (currentMid <= position.stopLoss) {
          this.log('STOP_LOSS', `${position.symbol} hit stop @ $${currentMid.toFixed(2)}`, {
            entry: position.entryPrice,
            stopLoss: position.stopLoss,
          })
          const pnl = (currentMid - position.entryPrice) * position.quantity * 100
          this.dailyPnL += pnl
          await this.executeExit(position, 'stop_loss')
        } else if (currentMid >= position.takeProfit) {
          this.log('TAKE_PROFIT', `${position.symbol} hit target @ $${currentMid.toFixed(2)}`, {
            entry: position.entryPrice,
            takeProfit: position.takeProfit,
          })
          const pnl = (currentMid - position.entryPrice) * position.quantity * 100
          this.dailyPnL += pnl
          await this.executeExit(position, 'take_profit')
        }
      } catch (err) {
        this.log('WARN', `Failed to monitor ${position.symbol}: ${err instanceof Error ? err.message : err}`)
      }
    }
  }

  private async scanForOpportunities(): Promise<void> {
    for (const underlying of this.config.underlyings) {
      try {
        // Fetch real 0DTE option chain
        const chain = await this.dataClient.get0DTEOptions(underlying)
        if (chain.length === 0) {
          this.log('WARN', `No 0DTE options available for ${underlying}`)
          continue
        }

        // Get current price from the chain (mid of nearest ATM call)
        const underlyingPrice = this.estimateUnderlyingPrice(chain)
        if (!underlyingPrice) continue

        this.log('SCAN', `${underlying} @ $${underlyingPrice.toFixed(2)} (${chain.length} contracts)`)

        const analyzer = new StrategyAnalyzer({
          underlyingPrice,
          riskFreeRate: 0.05,
          impliedVolatility: 0.25,
          timeToExpiry: 0.0027,
        })

        for (const stratName of this.config.strategies) {
          // Don't open more than max positions
          if (this.positions.length >= this.config.maxPositions) break

          const strategy = getStrategy(stratName)

          // Select real contracts for each leg
          const selectedContracts = strategy.legs.map((leg) =>
            selectContract(chain, leg, underlyingPrice)
          )

          if (selectedContracts.some((c) => c == null)) continue

          const contracts = selectedContracts.map((c) => toOptionContract(c!))
          const greeks = selectedContracts.map((c) => toGreeks(c!))

          const analysis = analyzer.analyze(strategy, contracts, greeks)

          // Check if recommendation meets threshold
          if (!meetsMinRecommendation(analysis.recommendation, this.config.minRecommendation)) {
            continue
          }

          // Use the first leg's contract for entry (primary contract)
          const primaryContract = selectedContracts[0]!
          await this.executeEntry(analysis, primaryContract)
        }
      } catch (err) {
        this.log('ERROR', `Scan error for ${underlying}: ${err instanceof Error ? err.message : err}`)
      }
    }
  }

  private async executeEntry(
    analysis: StrategyAnalysis,
    contractData: OptionContractData
  ): Promise<void> {
    const midPrice = (contractData.bid + contractData.ask) / 2

    if (midPrice <= 0) {
      this.log('WARN', `Skipping ${contractData.symbol}: no valid price`)
      return
    }

    // Check max trade risk: premium * qty * 100 vs max daily loss
    const tradeRisk = midPrice * this.config.maxPositionSize * 100
    const remainingBudget = this.config.maxDailyLoss - Math.abs(this.dailyPnL)
    if (tradeRisk > remainingBudget) {
      this.log('RISK', `Skipping: trade risk $${tradeRisk.toFixed(2)} exceeds remaining budget $${remainingBudget.toFixed(2)}`)
      return
    }

    if (this.config.dryRun) {
      this.log('DRY_RUN', `Would buy ${this.config.maxPositionSize}x ${contractData.symbol} @ $${midPrice.toFixed(2)}`, {
        strategy: analysis.strategy.displayName,
        recommendation: analysis.recommendation,
        maxLoss: analysis.riskProfile.maxLoss,
      })
      return
    }

    try {
      const order: OptionOrder = {
        symbol: contractData.symbol,
        qty: this.config.maxPositionSize,
        side: 'buy',
        type: 'limit',
        timeInForce: 'day',
        limitPrice: contractData.ask, // Use ask for fill likelihood
      }

      const result = await this.client.submitOrder(order)

      const stopLoss = midPrice * (1 - this.config.stopLossPct / 100)
      const takeProfit = midPrice * (1 + this.config.takeProfitPct / 100)

      this.positions.push({
        symbol: contractData.symbol,
        orderId: result.id,
        strategy: analysis.strategy.name,
        entryPrice: midPrice,
        quantity: this.config.maxPositionSize,
        stopLoss,
        takeProfit,
        enteredAt: new Date(),
      })

      this.log('ENTRY', `Bought ${order.qty}x ${order.symbol} @ $${midPrice.toFixed(2)}`, {
        strategy: analysis.strategy.displayName,
        recommendation: analysis.recommendation,
        stopLoss: stopLoss.toFixed(2),
        takeProfit: takeProfit.toFixed(2),
        orderId: result.id,
      })
    } catch (err) {
      this.log('ERROR', `Order failed: ${err instanceof Error ? err.message : err}`)
    }
  }

  private async executeExit(position: TrackedPosition, reason: string): Promise<void> {
    if (this.config.dryRun) {
      this.log('DRY_RUN', `Would close ${position.symbol} (${reason})`)
      this.positions = this.positions.filter((p) => p.symbol !== position.symbol)
      return
    }

    try {
      await this.client.closePosition(position.symbol)
      this.log('EXIT', `Closed ${position.symbol} (${reason})`)
    } catch {
      // Fallback: submit a market sell order
      try {
        await this.client.submitOrder({
          symbol: position.symbol,
          qty: position.quantity,
          side: 'sell',
          type: 'market',
          timeInForce: 'day',
        })
        this.log('EXIT', `Sold ${position.symbol} via market order (${reason})`)
      } catch (err2) {
        this.log('ERROR', `Failed to close ${position.symbol}: ${err2 instanceof Error ? err2.message : err2}`)
      }
    }

    this.positions = this.positions.filter((p) => p.symbol !== position.symbol)
  }

  private async closeAllPositions(): Promise<void> {
    for (const position of [...this.positions]) {
      await this.executeExit(position, 'eod_close')
    }
  }

  private shouldStopTrading(now: Date): string | null {
    if (!isWithinTradingHours(now)) {
      return 'Market is closed'
    }
    if (!canSubmitETFOrder(now)) {
      return 'Past 3:15 PM ET ETF cutoff'
    }
    if (Math.abs(this.dailyPnL) >= this.config.maxDailyLoss) {
      return `Daily loss limit reached ($${this.dailyPnL.toFixed(2)})`
    }
    return null
  }

  private scheduleEODExit(): void {
    const now = new Date()
    const etString = now.toLocaleString('en-US', { timeZone: 'America/New_York' })
    const et = new Date(etString)

    // Target 3:10 PM ET (5 min before cutoff)
    const exitTime = new Date(et)
    exitTime.setHours(15, 10, 0, 0)

    const msUntilExit = exitTime.getTime() - et.getTime()
    if (msUntilExit > 0) {
      this.eodTimeoutId = setTimeout(async () => {
        this.log('EOD', 'End-of-day exit triggered - closing all positions')
        await this.closeAllPositions()
        this.running = false
        if (this.intervalId) {
          clearInterval(this.intervalId)
          this.intervalId = null
        }
        this.log('EOD', 'Agent stopped for the day', { dailyPnL: this.dailyPnL })
      }, msUntilExit)
      this.log('SCHEDULE', `EOD exit in ${Math.round(msUntilExit / 60000)} minutes (3:10 PM ET)`)
    }
  }

  private estimateUnderlyingPrice(chain: OptionContractData[]): number | null {
    // Find ATM options and estimate underlying price from their strikes
    const calls = chain.filter((c) => c.type === 'call' && c.bid > 0 && c.ask > 0)
    if (calls.length === 0) return null

    // Find the call where bid-ask midpoint is closest to intrinsic value = 0
    // (i.e., the call closest to ATM)
    const sorted = calls.sort((a, b) => {
      const aMid = (a.bid + a.ask) / 2
      const bMid = (b.bid + b.ask) / 2
      // ATM options have roughly equal call and put premiums
      // As a heuristic, use the strike where delta is closest to 0.5
      if (a.delta != null && b.delta != null) {
        return Math.abs(a.delta - 0.5) - Math.abs(b.delta - 0.5)
      }
      // Fallback: ATM has smallest mid-price / strike ratio difference
      return aMid / a.strike - bMid / b.strike
    })

    const atm = sorted[0]
    if (!atm) return null

    // Underlying price ~ strike + call premium (for ATM)
    const callMid = (atm.bid + atm.ask) / 2
    return atm.strike + callMid * 0.5 // Rough estimate
  }

  private log(level: string, message: string, data?: unknown): void {
    const timestamp = new Date().toISOString()
    const prefix = this.config.dryRun ? '[DRY] ' : ''
    const mode = this.config.paper ? 'PAPER' : 'LIVE'

    const entry = {
      timestamp,
      level,
      mode,
      message: `${prefix}${message}`,
      ...(data ? { data } : {}),
    }

    console.log(JSON.stringify(entry))
  }
}
