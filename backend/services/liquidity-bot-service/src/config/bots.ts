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
    topUpQuoteAmount: 5000,
    topUpBaseAmount: 0.1
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
    topUpQuoteAmount: 3000,
    topUpBaseAmount: 2
  },
  {
    id: 'bot-sol-1',
    email: process.env.BOT_SOL_1_EMAIL || 'bot.sol.1@nexustrade.internal',
    password: process.env.BOT_SOL_1_PASSWORD || 'changeme',
    symbol: 'SOLUSDT',
    spreadPercent: 0.5,
    minOrderQty: 0.1,
    maxOrderQty: 1,
    targetOpenOrders: 6,
    refreshIntervalMs: 15000,
    quoteAsset: 'USDT',
    baseAsset: 'SOL',
    minQuoteBalance: 1000,
    minBaseBalance: 2,
    topUpQuoteAmount: 2500,
    topUpBaseAmount: 4
  },
  {
    id: 'bot-bnb-1',
    email: process.env.BOT_BNB_1_EMAIL || 'bot.bnb.1@nexustrade.internal',
    password: process.env.BOT_BNB_1_PASSWORD || 'changeme',
    symbol: 'BNBUSDT',
    spreadPercent: 0.45,
    minOrderQty: 0.01,
    maxOrderQty: 0.05,
    targetOpenOrders: 6,
    refreshIntervalMs: 15000,
    quoteAsset: 'USDT',
    baseAsset: 'BNB',
    minQuoteBalance: 1500,
    minBaseBalance: 0.5,
    topUpQuoteAmount: 3000,
    topUpBaseAmount: 1
  },
  {
    id: 'bot-xrp-1',
    email: process.env.BOT_XRP_1_EMAIL || 'bot.xrp.1@nexustrade.internal',
    password: process.env.BOT_XRP_1_PASSWORD || 'changeme',
    symbol: 'XRPUSDT',
    spreadPercent: 0.6,
    minOrderQty: 10,
    maxOrderQty: 50,
    targetOpenOrders: 6,
    refreshIntervalMs: 15000,
    quoteAsset: 'USDT',
    baseAsset: 'XRP',
    minQuoteBalance: 800,
    minBaseBalance: 200,
    topUpQuoteAmount: 2000,
    topUpBaseAmount: 500
  }
];
