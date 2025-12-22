import { format } from 'date-fns'
import type { Greeks, MarketSnapshot, OptionContract } from '../types/options.js'

/**
 * Alpaca Options Market Data Client
 *
 * Fetches real-time and historical options data for 0DTE analysis
 */

const DATA_BASE_URL = 'https://data.alpaca.markets'

export interface OptionChain {
  underlying: string
  expirations: string[]
  strikes: number[]
  contracts: OptionContractData[]
}

export interface OptionContractData {
  symbol: string
  underlying: string
  expiration: string
  strike: number
  type: 'call' | 'put'
  bid: number
  ask: number
  last: number
  volume: number
  openInterest: number
  delta?: number
  gamma?: number
  theta?: number
  vega?: number
  impliedVolatility?: number
}

export class OptionsDataClient {
  private readonly apiKey: string
  private readonly secretKey: string

  constructor(apiKey: string, secretKey: string) {
    this.apiKey = apiKey
    this.secretKey = secretKey
  }

  /**
   * Make authenticated request to Alpaca Data API
   */
  private async request<T>(endpoint: string): Promise<T> {
    const url = `${DATA_BASE_URL}${endpoint}`

    const response = await fetch(url, {
      headers: {
        'APCA-API-KEY-ID': this.apiKey,
        'APCA-API-SECRET-KEY': this.secretKey,
      },
    })

    if (!response.ok) {
      throw new Error(`Data API error: ${response.status}`)
    }

    return response.json() as Promise<T>
  }

  /**
   * Get option chain for a symbol
   * Returns all available expirations and strikes
   */
  async getOptionChain(
    underlying: string,
    expiration?: Date
  ): Promise<OptionChain> {
    const expirationStr = expiration ? format(expiration, 'yyyy-MM-dd') : undefined

    let endpoint = `/v1beta1/options/snapshots/${underlying}`
    if (expirationStr) {
      endpoint += `?expiration_date=${expirationStr}`
    }

    interface RawChainResponse {
      snapshots: Record<
        string,
        {
          latestQuote: { bp: number; ap: number }
          latestTrade: { p: number }
          greeks?: { delta: number; gamma: number; theta: number; vega: number }
          impliedVolatility?: number
          openInterest: number
          volume: number
        }
      >
    }

    const raw = await this.request<RawChainResponse>(endpoint)

    const contracts: OptionContractData[] = Object.entries(raw.snapshots).map(
      ([symbol, data]) => {
        const parsed = this.parseOCCSymbol(symbol)
        return {
          symbol,
          underlying: parsed.underlying,
          expiration: parsed.expiration,
          strike: parsed.strike,
          type: parsed.type,
          bid: data.latestQuote.bp,
          ask: data.latestQuote.ap,
          last: data.latestTrade.p,
          volume: data.volume,
          openInterest: data.openInterest,
          delta: data.greeks?.delta,
          gamma: data.greeks?.gamma,
          theta: data.greeks?.theta,
          vega: data.greeks?.vega,
          impliedVolatility: data.impliedVolatility,
        }
      }
    )

    const expirations = [...new Set(contracts.map((c) => c.expiration))].sort()
    const strikes = [...new Set(contracts.map((c) => c.strike))].sort((a, b) => a - b)

    return {
      underlying,
      expirations,
      strikes,
      contracts,
    }
  }

  /**
   * Get 0DTE options for today
   * Filters to only options expiring today
   */
  async get0DTEOptions(underlying: string): Promise<OptionContractData[]> {
    const today = new Date()
    const chain = await this.getOptionChain(underlying, today)

    const todayStr = format(today, 'yyyy-MM-dd')
    return chain.contracts.filter((c) => c.expiration === todayStr)
  }

  /**
   * Get market snapshot for a specific option
   */
  async getSnapshot(optionSymbol: string): Promise<MarketSnapshot> {
    interface RawSnapshot {
      latestQuote: { bp: number; ap: number; t: string }
      latestTrade: { p: number }
      openInterest: number
    }

    const raw = await this.request<RawSnapshot>(
      `/v1beta1/options/snapshots/${optionSymbol}`
    )

    return {
      symbol: optionSymbol,
      bid: raw.latestQuote.bp,
      ask: raw.latestQuote.ap,
      last: raw.latestTrade.p,
      volume: 0, // Not in snapshot
      openInterest: raw.openInterest,
      timestamp: new Date(raw.latestQuote.t),
    }
  }

  /**
   * Convert option data to our contract format
   */
  toOptionContract(data: OptionContractData): OptionContract {
    return {
      symbol: data.symbol,
      underlyingSymbol: data.underlying,
      underlyingType: this.inferUnderlyingType(data.underlying),
      optionType: data.type,
      strikePrice: data.strike,
      expirationDate: new Date(data.expiration),
      premium: (data.bid + data.ask) / 2, // Mid price
      contractSize: 100,
    }
  }

  /**
   * Extract Greeks from option data
   */
  toGreeks(data: OptionContractData): Greeks {
    return {
      delta: data.delta ?? 0,
      gamma: data.gamma ?? 0,
      theta: data.theta ?? 0,
      vega: data.vega ?? 0,
    }
  }

  /**
   * Parse OCC option symbol
   * Format: ROOT + YYMMDD + C/P + STRIKE (8 digits, strike * 1000)
   * Example: SPY240315C00500000 = SPY Mar 15 2024 $500 Call
   */
  private parseOCCSymbol(symbol: string): {
    underlying: string
    expiration: string
    type: 'call' | 'put'
    strike: number
  } {
    // Find where the date starts (first digit after letters)
    const match = symbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/)

    if (!match) {
      throw new Error(`Invalid OCC symbol format: ${symbol}`)
    }

    const [, underlying, dateStr, typeChar, strikeStr] = match

    if (!underlying || !dateStr || !typeChar || !strikeStr) {
      throw new Error(`Failed to parse OCC symbol: ${symbol}`)
    }

    // Parse date: YYMMDD
    const year = 2000 + Number.parseInt(dateStr.slice(0, 2), 10)
    const month = Number.parseInt(dateStr.slice(2, 4), 10)
    const day = Number.parseInt(dateStr.slice(4, 6), 10)

    const expiration = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`

    // Parse strike: 8 digits = strike * 1000
    const strike = Number.parseInt(strikeStr, 10) / 1000

    return {
      underlying,
      expiration,
      type: typeChar === 'C' ? 'call' : 'put',
      strike,
    }
  }

  /**
   * Infer underlying type from symbol
   */
  private inferUnderlyingType(symbol: string): 'stock' | 'index' | 'etf' {
    const etfs = ['SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'XLF', 'XLE', 'GLD', 'SLV']
    const indices = ['SPX', 'NDX', 'RUT', 'VIX']

    const upper = symbol.toUpperCase()

    if (indices.includes(upper)) return 'index'
    if (etfs.includes(upper)) return 'etf'
    return 'stock'
  }
}

/**
 * Create options data client from environment
 */
export function createOptionsDataClientFromEnv(): OptionsDataClient {
  const apiKey = process.env['ALPACA_API_KEY']
  const secretKey = process.env['ALPACA_SECRET_KEY']

  if (!apiKey || !secretKey) {
    throw new Error('Missing Alpaca credentials')
  }

  return new OptionsDataClient(apiKey, secretKey)
}
