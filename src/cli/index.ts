#!/usr/bin/env node
import 'dotenv/config'
import { program } from 'commander'
import { analyzeCommand } from './commands/analyze.js'
import { listCommand } from './commands/list.js'
import { statusCommand } from './commands/status.js'
import { researchCommand } from './commands/research.js'
import { agentCommand } from './commands/agent.js'

/**
 * AlphaOptions CLI
 *
 * Modern 0DTE options trading toolkit
 * Based on hedge fund strategy research
 */

program
  .name('alpha')
  .description('Modern 0DTE options trading toolkit - strategy analysis & Alpaca integration')
  .version('0.1.0')

// List available strategies
program
  .command('list')
  .alias('ls')
  .description('List available trading strategies')
  .option('-c, --category <category>', 'Filter by category (bullish, bearish, volatility, speculation)')
  .option('-d, --debit-only', 'Show only debit strategies')
  .option('--0dte', 'Show only 0DTE suitable strategies')
  .action(listCommand)

// Analyze a strategy
program
  .command('analyze <symbol>')
  .alias('a')
  .description('Analyze 0DTE options strategies for a symbol')
  .option('-s, --strategy <name>', 'Specific strategy to analyze')
  .option('-p, --price <price>', 'Current underlying price (auto-fetch if not provided)')
  .option('-v, --volatility <level>', 'Market volatility level (low, normal, high)', 'normal')
  .option('--paper', 'Use paper trading account')
  .action(analyzeCommand)

// Check trading status
program
  .command('status')
  .alias('st')
  .description('Check market status and account info')
  .option('--account', 'Show account details')
  .option('--positions', 'Show current positions')
  .action(statusCommand)

// Research insights from README
program
  .command('research')
  .alias('r')
  .description('Display trading insights from research notes')
  .option('-t, --topic <topic>', 'Filter by topic (strategies, risk, timing)')
  .action(researchCommand)

// Run the autonomous trading agent
program
  .command('agent')
  .description('Run the autonomous 0DTE options trading agent')
  .option('--underlyings <symbols>', 'Comma-separated underlyings (default: SPY)')
  .option('--strategies <names>', 'Comma-separated strategy names')
  .option('--interval <ms>', 'Scan interval in milliseconds (default: 60000)')
  .option('--max-positions <n>', 'Maximum simultaneous positions (default: 2)')
  .option('--max-daily-loss <dollars>', 'Maximum daily loss in dollars (default: 500)')
  .option('--max-contracts <n>', 'Max contracts per trade (default: 1)')
  .option('--stop-loss <pct>', 'Stop loss percentage of premium (default: 50)')
  .option('--take-profit <pct>', 'Take profit percentage of premium (default: 100)')
  .option('--dry-run', 'Log trades without executing them')
  .option('--live', 'Use live trading (default is paper)')
  .action(agentCommand)

program.parse()
