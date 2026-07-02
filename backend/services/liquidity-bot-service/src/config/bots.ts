import { BotConfig } from '../types';

// Preconfigured bot accounts. These accounts must already exist in auth-service —
// this service never signs up or creates users.
export const BOTS: BotConfig[] = [
  {
    id: 'bot-btc-1',
    email: process.env.BOT_BTC_1_EMAIL || 'bot.btc.1@nexustrade.internal',
    password: process.env.BOT_BTC_1_PASSWORD || 'changeme',
    symbol: 'BTCUSDT',
    spreadPercent: 0.4,
    minOrderQty: 0.001,
    maxOrderQty: 0.01,
    targetOpenOrders: 6,       // per side (6 buy + 6 sell = 12 total)
    refreshIntervalMs: 15000,
    quoteAsset: 'USDT',
    baseAsset: 'BTC',
    minQuoteBalance: 2000,
    minBaseBalance: 0.05,
    topUpAmount: 5000
  },
  {
    id: 'bot-eth-1',
    email: process.env.BOT_ETH_1_EMAIL || 'bot.eth.1@nexustrade.internal',
    password: process.env.BOT_ETH_1_PASSWORD || 'changeme',
    symbol: 'ETHUSDT',
    spreadPercent: 0.5,
    minOrderQty: 0.01,
    maxOrderQty: 0.2,
    targetOpenOrders: 6,
    refreshIntervalMs: 15000,
    quoteAsset: 'USDT',
    baseAsset: 'ETH',
    minQuoteBalance: 1500,
    minBaseBalance: 1,
    topUpAmount: 3000
  }
];