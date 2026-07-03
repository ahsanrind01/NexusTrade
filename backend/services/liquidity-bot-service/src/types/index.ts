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
  topUpAmount?: number;      // legacy fallback amount to request when topping up
  topUpQuoteAmount: number;
  topUpBaseAmount: number;
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
  success: boolean;
  transaction: {
    id: string;
    status: string;
    type: string;
    amount: string | number;
    asset: string;
    stripeCheckoutUrl?: string | null;
    cryptoDepositAddress?: string | null;
  };
}

export interface SimulateCryptoDepositRequest {
  transactionId: string;
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

export interface OrderServiceOrder {
  id: string;
  userId: string;
  asset: string;
  side: 'BUY' | 'SELL';
  price: string | number;
  amount: string | number;
  status: 'PENDING' | 'FILLED' | 'CANCELLED' | 'PARTIAL';
  createdAt: string;
}

export interface OrderServiceOrderListResponse {
  success: boolean;
  orders: OrderServiceOrder[];
}

export interface PlaceOrderResponse {
  success: boolean;
  orderId: string;
}

export interface WalletBalanceResponse {
  success: boolean;
  userId: string;
  balance: Record<string, string | number>;
}

// ---- Ladder planning (used internally by BotWorker) ----

export interface LadderLevel {
  side: OrderSide;
  price: number;
  quantity: number;
}
