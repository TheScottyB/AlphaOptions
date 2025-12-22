import type { AlpacaConfig } from './config.js'
import {
  canSubmitETFOrder,
  DEFAULT_PAPER_URL,
  DEFAULT_LIVE_URL,
  isWithinTradingHours,
} from './config.js'

/**
 * Alpaca Trading Client for 0DTE Options
 *
 * Key considerations from research:
 * - "The provided code is only for demonstration and requires further adaptation"
 * - "Alpaca enforces a 3:15 p.m. ET cutoff for submitting orders for broad-based ETFs"
 */

export type OrderSide = 'buy' | 'sell'
export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit'
export type TimeInForce = 'day' | 'gtc' | 'ioc' | 'fok'

export interface OptionOrder {
  symbol: string // Option contract symbol (OCC format)
  qty: number
  side: OrderSide
  type: OrderType
  timeInForce: TimeInForce
  limitPrice?: number
  stopPrice?: number
}

export interface Position {
  symbol: string
  qty: number
  side: 'long' | 'short'
  marketValue: number
  costBasis: number
  unrealizedPl: number
  currentPrice: number
}

export interface AccountInfo {
  id: string
  equity: number
  cash: number
  buyingPower: number
  daytradeCount: number
  patternDayTrader: boolean
}

export class AlpacaClient {
  private readonly apiKey: string
  private readonly secretKey: string
  private readonly baseUrl: string
  private readonly isPaper: boolean

  constructor(config: AlpacaConfig) {
    this.apiKey = config.apiKey
    this.secretKey = config.secretKey
    this.isPaper = config.paper ?? true
    this.baseUrl = config.baseUrl ?? (this.isPaper ? DEFAULT_PAPER_URL : DEFAULT_LIVE_URL)
  }

  /**
   * Make authenticated request to Alpaca API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`

    const response = await fetch(url, {
      ...options,
      headers: {
        'APCA-API-KEY-ID': this.apiKey,
        'APCA-API-SECRET-KEY': this.secretKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new AlpacaError(`Alpaca API error: ${response.status} - ${error}`, response.status)
    }

    return response.json() as Promise<T>
  }

  /**
   * Get account information
   */
  async getAccount(): Promise<AccountInfo> {
    interface RawAccount {
      id: string
      equity: string
      cash: string
      buying_power: string
      daytrade_count: number
      pattern_day_trader: boolean
    }

    const raw = await this.request<RawAccount>('/v2/account')

    return {
      id: raw.id,
      equity: Number.parseFloat(raw.equity),
      cash: Number.parseFloat(raw.cash),
      buyingPower: Number.parseFloat(raw.buying_power),
      daytradeCount: raw.daytrade_count,
      patternDayTrader: raw.pattern_day_trader,
    }
  }

  /**
   * Get current positions
   */
  async getPositions(): Promise<Position[]> {
    interface RawPosition {
      symbol: string
      qty: string
      side: string
      market_value: string
      cost_basis: string
      unrealized_pl: string
      current_price: string
    }

    const raw = await this.request<RawPosition[]>('/v2/positions')

    return raw.map((p) => ({
      symbol: p.symbol,
      qty: Number.parseFloat(p.qty),
      side: p.side as 'long' | 'short',
      marketValue: Number.parseFloat(p.market_value),
      costBasis: Number.parseFloat(p.cost_basis),
      unrealizedPl: Number.parseFloat(p.unrealized_pl),
      currentPrice: Number.parseFloat(p.current_price),
    }))
  }

  /**
   * Submit an options order with safety checks
   */
  async submitOrder(order: OptionOrder): Promise<{ id: string; status: string }> {
    // Safety check: Are we within trading hours?
    if (!isWithinTradingHours()) {
      throw new AlpacaError('Cannot submit order outside trading hours', 400)
    }

    // Safety check: ETF order cutoff
    const isETF = this.isETFOption(order.symbol)
    if (isETF && !canSubmitETFOrder()) {
      throw new AlpacaError(
        'Cannot submit ETF options order after 3:15 PM ET cutoff',
        400
      )
    }

    // Log warning for paper trading
    if (this.isPaper) {
      console.log('[PAPER] Submitting order:', order.symbol, order.side, order.qty)
    }

    const response = await this.request<{ id: string; status: string }>('/v2/orders', {
      method: 'POST',
      body: JSON.stringify({
        symbol: order.symbol,
        qty: order.qty.toString(),
        side: order.side,
        type: order.type,
        time_in_force: order.timeInForce,
        limit_price: order.limitPrice?.toString(),
        stop_price: order.stopPrice?.toString(),
      }),
    })

    return response
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<void> {
    await this.request(`/v2/orders/${orderId}`, { method: 'DELETE' })
  }

  /**
   * Close a position
   */
  async closePosition(symbol: string): Promise<void> {
    await this.request(`/v2/positions/${symbol}`, { method: 'DELETE' })
  }

  /**
   * Check if an option is an ETF option (affected by 3:15 PM cutoff)
   */
  private isETFOption(symbol: string): boolean {
    // Common broad-based ETFs
    const etfRoots = ['SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'XLF', 'XLE', 'GLD', 'SLV']

    // OCC symbol format: ROOT + expiry + type + strike
    // e.g., SPY240315C00500000
    const root = symbol.slice(0, 3)
    return etfRoots.some((etf) => root.toUpperCase().startsWith(etf.slice(0, 3)))
  }

  /**
   * Get trading status
   */
  getStatus(): { isPaper: boolean; canTrade: boolean; canTradeETF: boolean } {
    return {
      isPaper: this.isPaper,
      canTrade: isWithinTradingHours(),
      canTradeETF: canSubmitETFOrder(),
    }
  }
}

/**
 * Custom error for Alpaca API issues
 */
export class AlpacaError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message)
    this.name = 'AlpacaError'
  }
}

/**
 * Create Alpaca client from environment variables
 */
export function createClientFromEnv(): AlpacaClient {
  const apiKey = process.env['ALPACA_API_KEY']
  const secretKey = process.env['ALPACA_SECRET_KEY']
  const paper = process.env['ALPACA_PAPER'] !== 'false'

  if (!apiKey || !secretKey) {
    throw new Error(
      'Missing Alpaca credentials. Set ALPACA_API_KEY and ALPACA_SECRET_KEY environment variables.'
    )
  }

  return new AlpacaClient({ apiKey, secretKey, paper })
}
