import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { AlpacaClient, AlpacaError, createClientFromEnv } from './client.js'
import type { OptionOrder } from './client.js'
import * as configModule from './config.js'

describe('AlpacaClient', () => {
  const defaultConfig = {
    apiKey: 'test-key',
    secretKey: 'test-secret',
    paper: true,
  }

  describe('constructor', () => {
    it('creates client with paper config', () => {
      const client = new AlpacaClient(defaultConfig)
      const status = client.getStatus()
      expect(status.isPaper).toBe(true)
    })

    it('creates client with live config', () => {
      const client = new AlpacaClient({
        apiKey: 'key',
        secretKey: 'secret',
        paper: false,
      })
      const status = client.getStatus()
      expect(status.isPaper).toBe(false)
    })

    it('defaults to paper trading when paper is undefined', () => {
      const client = new AlpacaClient({
        apiKey: 'key',
        secretKey: 'secret',
        paper: undefined as unknown as boolean,
      })
      const status = client.getStatus()
      expect(status.isPaper).toBe(true)
    })

    it('uses custom baseUrl when provided', () => {
      const client = new AlpacaClient({
        apiKey: 'key',
        secretKey: 'secret',
        paper: true,
        baseUrl: 'https://custom.api.com',
      })
      expect(client).toBeDefined()
    })
  })

  describe('getStatus', () => {
    it('returns status object with required fields', () => {
      const client = new AlpacaClient(defaultConfig)
      const status = client.getStatus()
      expect(status).toHaveProperty('isPaper')
      expect(status).toHaveProperty('canTrade')
      expect(status).toHaveProperty('canTradeETF')
      expect(typeof status.isPaper).toBe('boolean')
      expect(typeof status.canTrade).toBe('boolean')
      expect(typeof status.canTradeETF).toBe('boolean')
    })
  })

  describe('getAccount', () => {
    it('makes authenticated request to /v2/account', async () => {
      const mockResponse = {
        id: 'test-id',
        equity: '100000.00',
        cash: '50000.00',
        buying_power: '200000.00',
        daytrade_count: 2,
        pattern_day_trader: false,
      }

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }))

      const client = new AlpacaClient(defaultConfig)
      const account = await client.getAccount()

      expect(account.id).toBe('test-id')
      expect(account.equity).toBe(100000)
      expect(account.cash).toBe(50000)
      expect(account.buyingPower).toBe(200000)
      expect(account.daytradeCount).toBe(2)
      expect(account.patternDayTrader).toBe(false)

      vi.unstubAllGlobals()
    })
  })

  describe('getPositions', () => {
    it('returns parsed positions', async () => {
      const mockPositions = [
        {
          symbol: 'SPY240315C00500000',
          qty: '5',
          side: 'long',
          market_value: '1250.00',
          cost_basis: '1000.00',
          unrealized_pl: '250.00',
          current_price: '2.50',
        },
      ]

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockPositions),
      }))

      const client = new AlpacaClient(defaultConfig)
      const positions = await client.getPositions()

      expect(positions).toHaveLength(1)
      expect(positions[0]?.symbol).toBe('SPY240315C00500000')
      expect(positions[0]?.qty).toBe(5)
      expect(positions[0]?.side).toBe('long')
      expect(positions[0]?.marketValue).toBe(1250)
      expect(positions[0]?.unrealizedPl).toBe(250)

      vi.unstubAllGlobals()
    })
  })

  describe('submitOrder', () => {
    it('throws AlpacaError outside trading hours', async () => {
      // isWithinTradingHours is likely false during test runs
      const client = new AlpacaClient(defaultConfig)
      const order: OptionOrder = {
        symbol: 'AAPL240315C00200000',
        qty: 1,
        side: 'buy',
        type: 'limit',
        timeInForce: 'day',
        limitPrice: 2.5,
      }

      await expect(client.submitOrder(order)).rejects.toThrow(AlpacaError)
    })

    it('submits non-ETF order during trading hours', async () => {
      vi.spyOn(configModule, 'isWithinTradingHours').mockReturnValue(true)
      vi.spyOn(configModule, 'canSubmitETFOrder').mockReturnValue(true)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'order-123', status: 'accepted' }),
      }))

      const client = new AlpacaClient(defaultConfig)
      const order: OptionOrder = {
        symbol: 'AAPL240315C00200000',
        qty: 1,
        side: 'buy',
        type: 'limit',
        timeInForce: 'day',
        limitPrice: 2.5,
      }

      const result = await client.submitOrder(order)
      expect(result.id).toBe('order-123')
      expect(result.status).toBe('accepted')

      vi.restoreAllMocks()
      vi.unstubAllGlobals()
    })

    it('submits ETF order before cutoff', async () => {
      vi.spyOn(configModule, 'isWithinTradingHours').mockReturnValue(true)
      vi.spyOn(configModule, 'canSubmitETFOrder').mockReturnValue(true)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'order-456', status: 'accepted' }),
      }))

      const client = new AlpacaClient(defaultConfig)
      const order: OptionOrder = {
        symbol: 'SPY240315C00500000',
        qty: 2,
        side: 'buy',
        type: 'market',
        timeInForce: 'day',
      }

      const result = await client.submitOrder(order)
      expect(result.id).toBe('order-456')

      vi.restoreAllMocks()
      vi.unstubAllGlobals()
    })

    it('throws when ETF order after cutoff', async () => {
      vi.spyOn(configModule, 'isWithinTradingHours').mockReturnValue(true)
      vi.spyOn(configModule, 'canSubmitETFOrder').mockReturnValue(false)

      const client = new AlpacaClient(defaultConfig)
      const order: OptionOrder = {
        symbol: 'SPY240315C00500000',
        qty: 1,
        side: 'buy',
        type: 'limit',
        timeInForce: 'day',
        limitPrice: 2.5,
      }

      await expect(client.submitOrder(order)).rejects.toThrow('3:15 PM ET cutoff')

      vi.restoreAllMocks()
    })

    it('logs paper trading order', async () => {
      vi.spyOn(configModule, 'isWithinTradingHours').mockReturnValue(true)
      vi.spyOn(configModule, 'canSubmitETFOrder').mockReturnValue(true)
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'order-789', status: 'accepted' }),
      }))

      const client = new AlpacaClient({ ...defaultConfig, paper: true })
      const order: OptionOrder = {
        symbol: 'AAPL240315C00200000',
        qty: 1,
        side: 'buy',
        type: 'limit',
        timeInForce: 'day',
        limitPrice: 2.5,
      }

      await client.submitOrder(order)
      expect(consoleSpy).toHaveBeenCalledWith(
        '[PAPER] Submitting order:',
        'AAPL240315C00200000',
        'buy',
        1
      )

      consoleSpy.mockRestore()
      vi.restoreAllMocks()
      vi.unstubAllGlobals()
    })
  })

  describe('cancelOrder', () => {
    it('makes DELETE request to cancel order', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(undefined),
      }))

      const client = new AlpacaClient(defaultConfig)
      await expect(client.cancelOrder('test-order-id')).resolves.not.toThrow()

      vi.unstubAllGlobals()
    })
  })

  describe('closePosition', () => {
    it('makes DELETE request to close position', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(undefined),
      }))

      const client = new AlpacaClient(defaultConfig)
      await expect(client.closePosition('SPY')).resolves.not.toThrow()

      vi.unstubAllGlobals()
    })
  })

  describe('API error handling', () => {
    it('throws AlpacaError on non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      }))

      const client = new AlpacaClient(defaultConfig)
      await expect(client.getAccount()).rejects.toThrow(AlpacaError)

      vi.unstubAllGlobals()
    })

    it('includes status code in AlpacaError', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve('Forbidden'),
      }))

      const client = new AlpacaClient(defaultConfig)
      try {
        await client.getAccount()
        expect.fail('Should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(AlpacaError)
        expect((e as AlpacaError).statusCode).toBe(403)
      }

      vi.unstubAllGlobals()
    })
  })
})

describe('AlpacaError', () => {
  it('creates error with message and status code', () => {
    const error = new AlpacaError('Test error', 404)
    expect(error.message).toBe('Test error')
    expect(error.statusCode).toBe(404)
    expect(error.name).toBe('AlpacaError')
  })

  it('is an instance of Error', () => {
    const error = new AlpacaError('Test', 500)
    expect(error).toBeInstanceOf(Error)
  })
})

describe('createClientFromEnv', () => {
  it('throws when ALPACA_API_KEY is missing', () => {
    const original = process.env['ALPACA_API_KEY']
    delete process.env['ALPACA_API_KEY']

    expect(() => createClientFromEnv()).toThrow('Missing Alpaca credentials')

    if (original) process.env['ALPACA_API_KEY'] = original
  })

  it('throws when ALPACA_SECRET_KEY is missing', () => {
    const originalKey = process.env['ALPACA_API_KEY']
    const originalSecret = process.env['ALPACA_SECRET_KEY']

    process.env['ALPACA_API_KEY'] = 'test-key'
    delete process.env['ALPACA_SECRET_KEY']

    expect(() => createClientFromEnv()).toThrow('Missing Alpaca credentials')

    if (originalKey) process.env['ALPACA_API_KEY'] = originalKey
    else delete process.env['ALPACA_API_KEY']
    if (originalSecret) process.env['ALPACA_SECRET_KEY'] = originalSecret
  })

  it('creates client from env vars', () => {
    const originalKey = process.env['ALPACA_API_KEY']
    const originalSecret = process.env['ALPACA_SECRET_KEY']
    const originalPaper = process.env['ALPACA_PAPER']

    process.env['ALPACA_API_KEY'] = 'env-key'
    process.env['ALPACA_SECRET_KEY'] = 'env-secret'
    process.env['ALPACA_PAPER'] = 'true'

    const client = createClientFromEnv()
    expect(client).toBeDefined()
    const status = client.getStatus()
    expect(status.isPaper).toBe(true)

    // Restore
    if (originalKey) process.env['ALPACA_API_KEY'] = originalKey
    else delete process.env['ALPACA_API_KEY']
    if (originalSecret) process.env['ALPACA_SECRET_KEY'] = originalSecret
    else delete process.env['ALPACA_SECRET_KEY']
    if (originalPaper) process.env['ALPACA_PAPER'] = originalPaper
    else delete process.env['ALPACA_PAPER']
  })

  it('sets paper=false when ALPACA_PAPER is "false"', () => {
    const originalKey = process.env['ALPACA_API_KEY']
    const originalSecret = process.env['ALPACA_SECRET_KEY']
    const originalPaper = process.env['ALPACA_PAPER']

    process.env['ALPACA_API_KEY'] = 'env-key'
    process.env['ALPACA_SECRET_KEY'] = 'env-secret'
    process.env['ALPACA_PAPER'] = 'false'

    const client = createClientFromEnv()
    const status = client.getStatus()
    expect(status.isPaper).toBe(false)

    // Restore
    if (originalKey) process.env['ALPACA_API_KEY'] = originalKey
    else delete process.env['ALPACA_API_KEY']
    if (originalSecret) process.env['ALPACA_SECRET_KEY'] = originalSecret
    else delete process.env['ALPACA_SECRET_KEY']
    if (originalPaper) process.env['ALPACA_PAPER'] = originalPaper
    else delete process.env['ALPACA_PAPER']
  })
})
