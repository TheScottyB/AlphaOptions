/**
 * AlphaOptions - Modern 0DTE Options Trading Toolkit
 *
 * Based on hedge fund strategy research:
 * - Debit-only strategies for defined risk
 * - 0DTE options for intraday speculation
 * - Alpaca integration for paper/live trading
 *
 * "Research suggests hedge funds may use 0 DTE options for short-term trading,
 * focusing on debit-only strategies like buying calls, puts, straddles, and strangles."
 */

// Core types
export * from './types/index.js'

// Strategy definitions and analysis
export * from './strategies/index.js'

// Alpaca integration
export * from './alpaca/index.js'
