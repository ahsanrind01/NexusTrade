// ---- Bot configuration ----

export interface BotConfig {
  id: string;              // internal identifier, e.g. 'bot-1'
  email: string;            // preconfigured account email
  password: string;         // preconfigured account password
  symbol: string;            // e.g. 'BTCUSDT' — matches Redis key price:<SYMBOL>
  spreadPercent: number;     // e.g. 0.5 => orders placed +-0.5% around mid price
  minOrderQty: number;
  maxOrderQty: number;
  targetOpenOrders: number;  // desired number of live orders per side
  refreshIntervalMs: number; // how often the bot's loop runs
  quoteAsset: string;        // e.g. 'USDT' — asset balance checked before buys
  baseAsset: string;         // e.g. 'BTC' — asset balance checked before sells
  minQuoteBalance: number;   // top-up trigger threshold for quote asset
  minBaseBalance: number;    // top-up trigger threshold for base asset
  topUpAmount: number;       // amount to request when topping up
}

// ---- Market data (mirrors market-data-service's Redis payload) ----

export interface PriceData {
  asset: string;
  price: number;
  amount: number;
  timestamp: string;
  source: string;
}

// ---- Auth ----

export interface LoginResponse {
  token: string;
  expiresIn?: number; // seconds, if provided by auth-service; otherwise we assume a default TTL
}

export interface BotSession {
  botId: string;
  token: string;
  expiresAt: number; // epoch ms
}

// ---- Wallet ----

export interface Balance {
  asset: string;
  available: number;
  locked?: number;
}

// ---- Funding ----

export interface DepositIntentResponse {
  intentId: string;
  asset: string;
  amount: number;
}

export interface SimulateCryptoDepositRequest {
  intentId: string;
}

// ---- Orders ----

export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'open' | 'filled' | 'cancelled' | 'partial';

export interface Order {
  id: string;
  symbol: string;
  side: OrderSide;
  price: number;
  quantity: number;
  status: OrderStatus;
  createdAt: string;
}

export interface PlaceOrderRequest {
  symbol: string;
  side: OrderSide;
  type: 'limit';
  price: number;
  quantity: number;
}

// ---- Ladder planning (used internally by BotWorker) ----

export interface LadderLevel {
  side: OrderSide;
  price: number;
  quantity: number;
}