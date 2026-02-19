import { describe, expect, it, vi } from 'vitest'
import { OptionsDataClient, createOptionsDataClientFromEnv } from './options-data.js'

describe('OptionsDataClient', () => {
  const client = new OptionsDataClient('test-key', 'test-secret')

  describe('constructor', () => {
    it('creates client with credentials', () => {
      const c = new OptionsDataClient('key', 'secret')
      expect(c).toBeDefined()
    })
  })

  describe('toOptionContract', () => {
    it('converts OptionContractData to OptionContract', () => {
      const data = {
        symbol: 'SPY240315C00500000',
        underlying: 'SPY',
        expiration: '2024-03-15',
        strike: 500,
        type: 'call' as const,
        bid: 2.4,
        ask: 2.6,
        last: 2.5,
        volume: 1000,
        openInterest: 5000,
        delta: 0.5,
        gamma: 0.05,
        theta: -0.15,
        vega: 0.1,
      }

      const contract = client.toOptionContract(data)

      expect(contract.symbol).toBe('SPY240315C00500000')
      expect(contract.underlyingSymbol).toBe('SPY')
      expect(contract.underlyingType).toBe('etf')
      expect(contract.optionType).toBe('call')
      expect(contract.strikePrice).toBe(500)
      expect(contract.premium).toBe(2.5) // Mid of bid/ask
      expect(contract.contractSize).toBe(100)
    })

    it('converts put option data correctly', () => {
      const data = {
        symbol: 'AAPL240315P00200000',
        underlying: 'AAPL',
        expiration: '2024-03-15',
        strike: 200,
        type: 'put' as const,
        bid: 3.0,
        ask: 3.2,
        last: 3.1,
        volume: 500,
        openInterest: 2000,
      }

      const contract = client.toOptionContract(data)

      expect(contract.optionType).toBe('put')
      expect(contract.underlyingType).toBe('stock')
      expect(contract.premium).toBe(3.1) // (3.0 + 3.2) / 2
    })

    it('handles ETF underlying type', () => {
      const data = {
        symbol: 'QQQ240315C00400000',
        underlying: 'QQQ',
        expiration: '2024-03-15',
        strike: 400,
        type: 'call' as const,
        bid: 1.0,
        ask: 1.2,
        last: 1.1,
        volume: 100,
        openInterest: 500,
      }

      const contract = client.toOptionContract(data)
      expect(contract.underlyingType).toBe('etf')
    })

    it('handles index underlying type', () => {
      const data = {
        symbol: 'SPX240315C05000000',
        underlying: 'SPX',
        expiration: '2024-03-15',
        strike: 5000,
        type: 'call' as const,
        bid: 10.0,
        ask: 10.5,
        last: 10.2,
        volume: 200,
        openInterest: 1000,
      }

      const contract = client.toOptionContract(data)
      expect(contract.underlyingType).toBe('index')
    })
  })

  describe('toGreeks', () => {
    it('extracts Greeks from option data', () => {
      const data = {
        symbol: 'SPY240315C00500000',
        underlying: 'SPY',
        expiration: '2024-03-15',
        strike: 500,
        type: 'call' as const,
        bid: 2.4,
        ask: 2.6,
        last: 2.5,
        volume: 1000,
        openInterest: 5000,
        delta: 0.5,
        gamma: 0.05,
        theta: -0.15,
        vega: 0.1,
      }

      const greeks = client.toGreeks(data)

      expect(greeks.delta).toBe(0.5)
      expect(greeks.gamma).toBe(0.05)
      expect(greeks.theta).toBe(-0.15)
      expect(greeks.vega).toBe(0.1)
    })

    it('defaults to 0 when Greeks are missing', () => {
      const data = {
        symbol: 'SPY240315C00500000',
        underlying: 'SPY',
        expiration: '2024-03-15',
        strike: 500,
        type: 'call' as const,
        bid: 2.4,
        ask: 2.6,
        last: 2.5,
        volume: 1000,
        openInterest: 5000,
        // No Greeks provided
      }

      const greeks = client.toGreeks(data)

      expect(greeks.delta).toBe(0)
      expect(greeks.gamma).toBe(0)
      expect(greeks.theta).toBe(0)
      expect(greeks.vega).toBe(0)
    })
  })

  describe('getOptionChain', () => {
    it('fetches and parses option chain', async () => {
      const mockResponse = {
        snapshots: {
          'SPY240315C00500000': {
            latestQuote: { bp: 2.4, ap: 2.6 },
            latestTrade: { p: 2.5 },
            greeks: { delta: 0.5, gamma: 0.05, theta: -0.15, vega: 0.1 },
            impliedVolatility: 0.25,
            openInterest: 5000,
            volume: 1000,
          },
          'SPY240315P00500000': {
            latestQuote: { bp: 2.3, ap: 2.5 },
            latestTrade: { p: 2.4 },
            openInterest: 4000,
            volume: 800,
          },
        },
      }

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }))

      const chain = await client.getOptionChain('SPY')

      expect(chain.underlying).toBe('SPY')
      expect(chain.contracts).toHaveLength(2)
      expect(chain.expirations).toBeDefined()
      expect(chain.strikes).toBeDefined()

      const callContract = chain.contracts.find((c) => c.type === 'call')
      expect(callContract).toBeDefined()
      expect(callContract?.bid).toBe(2.4)
      expect(callContract?.ask).toBe(2.6)
      expect(callContract?.delta).toBe(0.5)

      vi.unstubAllGlobals()
    })

    it('includes expiration filter in URL', async () => {
      const mockResponse = { snapshots: {} }

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })
      vi.stubGlobal('fetch', mockFetch)

      await client.getOptionChain('SPY', new Date('2024-03-15'))

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string
      expect(calledUrl).toContain('expiration_date=2024-03-15')

      vi.unstubAllGlobals()
    })
  })

  describe('get0DTEOptions', () => {
    it('filters to today expiration only', async () => {
      const today = new Date()
      const todayStr = today.toISOString().split('T')[0]

      const mockResponse = {
        snapshots: {
          [`SPY${todayStr?.replace(/-/g, '').slice(2)}C00500000`]: {
            latestQuote: { bp: 2.4, ap: 2.6 },
            latestTrade: { p: 2.5 },
            openInterest: 5000,
            volume: 1000,
          },
        },
      }

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }))

      const options = await client.get0DTEOptions('SPY')
      expect(Array.isArray(options)).toBe(true)

      vi.unstubAllGlobals()
    })
  })

  describe('getSnapshot', () => {
    it('fetches and parses market snapshot', async () => {
      const mockResponse = {
        latestQuote: { bp: 2.4, ap: 2.6, t: '2024-03-15T15:30:00Z' },
        latestTrade: { p: 2.5 },
        openInterest: 5000,
      }

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }))

      const snapshot = await client.getSnapshot('SPY240315C00500000')

      expect(snapshot.symbol).toBe('SPY240315C00500000')
      expect(snapshot.bid).toBe(2.4)
      expect(snapshot.ask).toBe(2.6)
      expect(snapshot.last).toBe(2.5)
      expect(snapshot.openInterest).toBe(5000)
      expect(snapshot.timestamp).toBeInstanceOf(Date)

      vi.unstubAllGlobals()
    })
  })

  describe('API error handling', () => {
    it('throws on non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }))

      await expect(client.getOptionChain('SPY')).rejects.toThrow('Data API error: 500')

      vi.unstubAllGlobals()
    })
  })
})

describe('createOptionsDataClientFromEnv', () => {
  it('throws when credentials are missing', () => {
    const originalKey = process.env['ALPACA_API_KEY']
    const originalSecret = process.env['ALPACA_SECRET_KEY']
    delete process.env['ALPACA_API_KEY']
    delete process.env['ALPACA_SECRET_KEY']

    expect(() => createOptionsDataClientFromEnv()).toThrow('Missing Alpaca credentials')

    if (originalKey) process.env['ALPACA_API_KEY'] = originalKey
    if (originalSecret) process.env['ALPACA_SECRET_KEY'] = originalSecret
  })

  it('creates client from env vars', () => {
    const originalKey = process.env['ALPACA_API_KEY']
    const originalSecret = process.env['ALPACA_SECRET_KEY']

    process.env['ALPACA_API_KEY'] = 'env-key'
    process.env['ALPACA_SECRET_KEY'] = 'env-secret'

    const c = createOptionsDataClientFromEnv()
    expect(c).toBeDefined()

    if (originalKey) process.env['ALPACA_API_KEY'] = originalKey
    else delete process.env['ALPACA_API_KEY']
    if (originalSecret) process.env['ALPACA_SECRET_KEY'] = originalSecret
    else delete process.env['ALPACA_SECRET_KEY']
  })
})
