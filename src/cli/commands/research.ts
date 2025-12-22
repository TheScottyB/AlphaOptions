import chalk from 'chalk'

/**
 * Research insights extracted from README hedge fund research
 *
 * "Research suggests hedge funds may use 0 DTE options for short-term trading,
 * focusing on debit-only strategies like buying calls, puts, straddles, and strangles."
 */

interface ResearchOptions {
  topic?: string
}

interface Insight {
  topic: 'strategies' | 'risk' | 'timing' | 'general'
  title: string
  content: string
  source?: string
}

const RESEARCH_INSIGHTS: Insight[] = [
  // Strategy insights
  {
    topic: 'strategies',
    title: 'Debit-Only Focus',
    content:
      'Hedge funds use debit-only strategies with 0DTE options, limiting risk to premium paid. ' +
      'This includes long calls, long puts, straddles, and strangles.',
    source: 'Hedge Fund Research',
  },
  {
    topic: 'strategies',
    title: 'Short Put Verticals',
    content:
      'A short put vertical spread caps losses while allowing premium collection. ' +
      'Profits from stable or rising prices with defined risk.',
    source: 'Video Analysis',
  },
  {
    topic: 'strategies',
    title: 'OTM Speculation',
    content:
      'Purchasing OTM options for high-risk, high-reward bets on big moves. ' +
      'Often used before significant news or earnings.',
  },

  // Risk insights
  {
    topic: 'risk',
    title: 'Premium Risk',
    content:
      'For all debit-only strategies, maximum risk is limited to the premium paid. ' +
      'Profit potential can be unlimited for directional strategies.',
  },
  {
    topic: 'risk',
    title: 'Time Decay Warning',
    content:
      'Zero DTE options experience intense time decay (theta). ' +
      '"No time for second guessing" - decisions must be rapid.',
    source: 'Claim Analysis',
  },
  {
    topic: 'risk',
    title: 'Size Down in Cold Markets',
    content:
      '"You got to size down" - reduce position sizes during low volatility. ' +
      'Protect track record by trading smaller when conditions are unfavorable.',
    source: 'Trading Wisdom',
  },
  {
    topic: 'risk',
    title: 'Intraday Volatility',
    content:
      'Minimal overnight risk does not equal minimal overall risk. ' +
      'Intraday volatility can lead to significant losses if market moves unexpectedly.',
  },

  // Timing insights
  {
    topic: 'timing',
    title: 'ETF Order Cutoff',
    content:
      'Alpaca enforces a 3:15 PM ET cutoff for submitting orders on broad-based ETFs. ' +
      'Plan entries and exits accordingly.',
    source: 'Alpaca Documentation',
  },
  {
    topic: 'timing',
    title: 'Pre-Market Advantage',
    content:
      '"If I can get in get green and make 25 Grand pre-market that\'s awesome." ' +
      'Early market moves before typical hours can be missed by retail traders.',
    source: 'Trading Wisdom',
  },
  {
    topic: 'timing',
    title: 'News Event Trading',
    content:
      'Strategies are most successful with strong intraday market insights, ' +
      'such as before news events, Fed announcements, or earnings.',
  },

  // General insights
  {
    topic: 'general',
    title: 'Cold Market Profitability',
    content:
      '"Trading during a cold market is the ultimate sign of success." ' +
      '"If you can make money when it\'s cold you can make money when it\'s hot."',
    source: 'Trading Wisdom',
  },
  {
    topic: 'general',
    title: 'Technical Indicators',
    content:
      'Double bottoms, cup and handle patterns, and pivot analyses support timing. ' +
      'Level two data and time/sales confirm support and resistance.',
  },
  {
    topic: 'general',
    title: 'Demonstration Only',
    content:
      '"The provided code is only for demonstration and requires further adaptation ' +
      'before live trading." Always backtest and paper trade first.',
    source: 'Risk Disclaimer',
  },
  {
    topic: 'general',
    title: 'Emotional Control',
    content:
      'Avoid fear and greed. Take profits when targets are reached. ' +
      '"Life is good I\'m not going to push my luck."',
  },
]

export function researchCommand(options: ResearchOptions): void {
  console.log(chalk.bold('\n  AlphaOptions - Research Insights\n'))
  console.log(chalk.dim('  Extracted from hedge fund strategy research\n'))

  let insights = RESEARCH_INSIGHTS

  if (options.topic) {
    const topic = options.topic.toLowerCase() as Insight['topic']
    insights = insights.filter((i) => i.topic === topic)

    if (insights.length === 0) {
      console.log(chalk.yellow(`  No insights found for topic: ${options.topic}`))
      console.log(chalk.dim('  Available: strategies, risk, timing, general\n'))
      return
    }
  }

  const topicColors: Record<Insight['topic'], (s: string) => string> = {
    strategies: chalk.blue,
    risk: chalk.red,
    timing: chalk.yellow,
    general: chalk.green,
  }

  const topicEmoji: Record<Insight['topic'], string> = {
    strategies: '📊',
    risk: '⚠️',
    timing: '⏰',
    general: '💡',
  }

  // Group by topic
  const grouped = insights.reduce(
    (acc, insight) => {
      if (!acc[insight.topic]) acc[insight.topic] = []
      acc[insight.topic].push(insight)
      return acc
    },
    {} as Record<Insight['topic'], Insight[]>
  )

  for (const [topic, topicInsights] of Object.entries(grouped)) {
    const colorFn = topicColors[topic as Insight['topic']]
    const emoji = topicEmoji[topic as Insight['topic']]

    console.log(colorFn(`  ${emoji} ${topic.toUpperCase()}`))
    console.log(chalk.dim('  ' + '─'.repeat(50)))

    for (const insight of topicInsights) {
      console.log()
      console.log(chalk.white.bold(`  ${insight.title}`))
      console.log(chalk.white(`  ${insight.content}`))
      if (insight.source) {
        console.log(chalk.dim.italic(`  — ${insight.source}`))
      }
    }

    console.log()
  }

  // Key quotes section
  if (!options.topic) {
    console.log(chalk.cyan('  📝 KEY QUOTES'))
    console.log(chalk.dim('  ' + '─'.repeat(50)))
    console.log()

    const quotes = [
      '"You got to size down" — on cold markets',
      '"Trading during a cold market is the ultimate sign of success"',
      '"No time for second guessing" — on 0DTE options',
      '"Life is good I\'m not going to push my luck"',
      '"The provided code is only for demonstration"',
    ]

    for (const quote of quotes) {
      console.log(chalk.italic.gray(`  ${quote}`))
    }

    console.log()
  }

  console.log(chalk.dim('  Use --topic <name> to filter (strategies, risk, timing, general)\n'))
}
