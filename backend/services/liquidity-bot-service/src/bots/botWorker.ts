import { BotConfig, LadderLevel, Order, OrderSide } from '../types';
import { getLatestPrice } from '../services/priceClient';
import { getOpenOrders, placeOrder, cancelOrder } from '../services/orderClient';
import { getBalances } from '../services/walletClient';
import { topUpBalance } from '../services/fundingClient';
import { getErrorDetails } from '../services/httpClient';

// How far (as a multiple of spreadPercent) an order's price can drift from the
// current market price before we consider it "stale" and cancel it.
const STALE_MULTIPLIER = 3;
const DUPLICATE_PRICE_TOLERANCE = 0.01;
const LOW_INVENTORY_FACTOR = 0.5;
const STARTUP_STAGGER_MAX_MS = Number(process.env.BOT_STARTUP_STAGGER_MAX_MS || 5000);

type PriceLevel = Pick<Order, 'side' | 'price'>;
type StopWorker = () => void;

const randomBetween = (min: number, max: number): number => {
  return min + Math.random() * (max - min);
};

const roundTo = (value: number, decimals = 8): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const getBalanceForAsset = (balances: Map<string, number>, asset: string): number => {
  return balances.get(asset) ?? 0;
};

const isDuplicateLevel = (level: LadderLevel, orders: PriceLevel[]): boolean => {
  return orders.some(order => {
    return order.side === level.side && Math.abs(order.price - level.price) <= DUPLICATE_PRICE_TOLERANCE;
  });
};

const getInventoryFactor = (available: number, minBalance: number): number => {
  if (minBalance <= 0 || available >= minBalance) {
    return 1;
  }

  return LOW_INVENTORY_FACTOR;
};

// Builds a randomized ladder of target buy/sell levels around the mid price.
const buildTargetLadder = (
  config: BotConfig,
  midPrice: number,
  buyInventoryFactor = 1,
  sellInventoryFactor = 1
): LadderLevel[] => {
  const levels: LadderLevel[] = [];
  const spread = config.spreadPercent / 100;

  for (let i = 0; i < config.targetOpenOrders; i++) {
    // Spread out levels a bit further from mid as i increases, with randomness
    const buyOffset = spread * randomBetween(0.3, 1) * (1 + i * 0.15) / buyInventoryFactor;
    const sellOffset = spread * randomBetween(0.3, 1) * (1 + i * 0.15) / sellInventoryFactor;

    levels.push({
      side: 'buy',
      price: roundTo(midPrice * (1 - buyOffset), 2),
      quantity: roundTo(randomBetween(config.minOrderQty, config.maxOrderQty) * buyInventoryFactor, 6)
    });

    levels.push({
      side: 'sell',
      price: roundTo(midPrice * (1 + sellOffset), 2),
      quantity: roundTo(randomBetween(config.minOrderQty, config.maxOrderQty) * sellInventoryFactor, 6)
    });
  }

  return levels;
};

// Determines which open orders have drifted too far from the current market
// price and should be cancelled to make room for fresher ones.
const findStaleOrders = (config: BotConfig, openOrders: Order[], midPrice: number): Order[] => {
  const staleThreshold = (config.spreadPercent / 100) * STALE_MULTIPLIER;

  return openOrders.filter(order => {
    const deviation = Math.abs(order.price - midPrice) / midPrice;
    return deviation > staleThreshold;
  });
};

// Reserves balance from the per-cycle snapshot, topping up at most once per asset.
const reserveBalance = async (
  config: BotConfig,
  balances: Map<string, number>,
  toppedUpAssets: Set<string>,
  side: OrderSide,
  price: number,
  quantity: number
): Promise<boolean> => {
  const asset = side === 'buy' ? config.quoteAsset : config.baseAsset;
  const required = side === 'buy' ? price * quantity : quantity;
  const minThreshold = side === 'buy' ? config.minQuoteBalance : config.minBaseBalance;

  let available = getBalanceForAsset(balances, asset);

  if (available >= required) {
    balances.set(asset, available - required);
    return true;
  }

  if (available < minThreshold && !toppedUpAssets.has(asset)) {
    console.log(`[BotWorker:${config.id}] Low ${asset} balance (${available}), topping up...`);
    const success = await topUpBalance(config.id, asset, config.topUpAmount);
    toppedUpAssets.add(asset);

    if (!success) {
      return false;
    }

    available += config.topUpAmount;
    balances.set(asset, available);
  }

  if (available < required) {
    return false;
  }

  balances.set(asset, available - required);
  return true;
};

const selectLevelsToPlace = async (
  config: BotConfig,
  levels: LadderLevel[],
  existingLevels: PriceLevel[],
  balances: Map<string, number>,
  toppedUpAssets: Set<string>,
  maxCount: number
): Promise<LadderLevel[]> => {
  const selected: LadderLevel[] = [];

  for (const level of levels) {
    if (selected.length >= maxCount) {
      break;
    }

    if (isDuplicateLevel(level, [...existingLevels, ...selected])) {
      continue;
    }

    const hasBalance = await reserveBalance(config, balances, toppedUpAssets, level.side, level.price, level.quantity);

    if (!hasBalance) {
      console.warn(`[BotWorker:${config.id}] Insufficient balance for ${level.side} ${level.quantity} @ ${level.price}, skipping`);
      continue;
    }

    selected.push(level);
  }

  return selected;
};

// Runs a single maintenance cycle for one bot: fetch price, cancel stale
// orders, and top up to the target order count on each side.
export const runBotCycle = async (config: BotConfig): Promise<void> => {
  const priceData = await getLatestPrice(config.symbol);

  if (!priceData) {
    console.warn(`[BotWorker:${config.id}] No price available for ${config.symbol}, skipping cycle`);
    return;
  }

  const [openOrders, balances] = await Promise.all([
    getOpenOrders(config.id, config.symbol),
    getBalances(config.id)
  ]);

  const midPrice = priceData.price;
  const balanceMap = new Map(balances.map(balance => [balance.asset, balance.available]));

  // Cancel stale orders first, so their capacity frees up for this cycle's top-up
  const staleOrders = findStaleOrders(config, openOrders, midPrice);
  const cancelledResults = await Promise.all(staleOrders.map(order => cancelOrder(config.id, order.id)));
  const cancelledOrderIds = new Set<string>();

  staleOrders.forEach((order, index) => {
    const cancelled = cancelledResults[index];
    if (cancelled) {
      cancelledOrderIds.add(order.id);
      console.log(`[BotWorker:${config.id}] Cancelled stale ${order.side} order ${order.id} @ ${order.price}`);
    }
  });

  const remainingOrders = openOrders.filter(o => !cancelledOrderIds.has(o.id));
  const openBuyCount = remainingOrders.filter(o => o.side === 'buy').length;
  const openSellCount = remainingOrders.filter(o => o.side === 'sell').length;
  const baseAvailable = getBalanceForAsset(balanceMap, config.baseAsset);
  const quoteAvailable = getBalanceForAsset(balanceMap, config.quoteAsset);
  const sellInventoryFactor = getInventoryFactor(baseAvailable, config.minBaseBalance);
  const buyInventoryFactor = getInventoryFactor(quoteAvailable, config.minQuoteBalance);

  const buyTarget = Math.max(1, Math.ceil(config.targetOpenOrders * buyInventoryFactor));
  const sellTarget = Math.max(1, Math.ceil(config.targetOpenOrders * sellInventoryFactor));
  const buysNeeded = Math.max(0, buyTarget - openBuyCount);
  const sellsNeeded = Math.max(0, sellTarget - openSellCount);

  if (buysNeeded === 0 && sellsNeeded === 0) {
    return;
  }

  const ladder = buildTargetLadder(config, midPrice, buyInventoryFactor, sellInventoryFactor);
  const toppedUpAssets = new Set<string>();
  const buyLevels = await selectLevelsToPlace(
    config,
    ladder.filter(l => l.side === 'buy'),
    remainingOrders,
    balanceMap,
    toppedUpAssets,
    buysNeeded
  );
  const sellLevels = await selectLevelsToPlace(
    config,
    ladder.filter(l => l.side === 'sell'),
    [...remainingOrders, ...buyLevels],
    balanceMap,
    toppedUpAssets,
    sellsNeeded
  );
  const levelsToPlace = [...buyLevels, ...sellLevels];

  const placementResults = await Promise.all(levelsToPlace.map(level => placeOrder(config.id, {
    symbol: config.symbol,
    side: level.side,
    type: 'limit',
    price: level.price,
    quantity: level.quantity
  })));

  levelsToPlace.forEach((level, index) => {
    const order = placementResults[index];
    if (order) {
      console.log(`[BotWorker:${config.id}] Placed ${level.side} ${level.quantity} @ ${level.price}`);
    }
  });
};

// Starts the recurring interval loop for one bot. Returns the interval handle
// so index.ts can clear it on shutdown if needed.
export const startBotWorker = (config: BotConfig): StopWorker => {
  console.log(`[BotWorker:${config.id}] Starting for ${config.symbol}, target ${config.targetOpenOrders} orders/side`);
  let intervalHandle: ReturnType<typeof setInterval> | null = null;
  const initialDelayMs = Math.floor(Math.random() * STARTUP_STAGGER_MAX_MS);
  const runCycle = () => {
    runBotCycle(config).catch(err => console.error(`[BotWorker:${config.id}] Cycle error: ${getErrorDetails(err)}`));
  };

  console.log(`[BotWorker:${config.id}] First cycle scheduled in ${initialDelayMs}ms`);

  const startupHandle = setTimeout(() => {
    runCycle();
    intervalHandle = setInterval(runCycle, config.refreshIntervalMs);
  }, initialDelayMs);

  return () => {
    clearTimeout(startupHandle);
    if (intervalHandle) {
      clearInterval(intervalHandle);
    }
  };
};
