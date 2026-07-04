import redis from '../config/redis';

export const addOrder = async (asset: string, side: string, order: any) => {
  const key = `orderbook:${asset}:${side}`;
  await redis.zadd(key, order.price, JSON.stringify(order));
};

export const getOrderCount = async (asset: string, side: string) => {
  const key = `orderbook:${asset}:${side}`;
  return await redis.zcard(key);
};

export const getCheapestSeller = async (asset: string) => {
  const key = `orderbook:${asset}:SELL`;
  const sellers = await redis.zrange(key, 0, 0); 
  return sellers.length > 0 ? JSON.parse(sellers[0]) : null;
};

export const getCheapestSellerExcludingUser = async (asset: string, userId?: string) => {
  const key = `orderbook:${asset}:SELL`;
  const sellers = await redis.zrange(key, 0, -1);

  for (const seller of sellers) {
    try {
      const parsed = JSON.parse(seller);
      if (!userId || parsed.userId !== userId) {
        return parsed;
      }
    } catch {
      continue;
    }
  }

  return null;
};

export const getHighestBuyer = async (asset: string) => {
  const key = `orderbook:${asset}:BUY`;
  const buyers = await redis.zrevrange(key, 0, 0);
  return buyers.length > 0 ? JSON.parse(buyers[0]) : null;
};

export const getHighestBuyerExcludingUser = async (asset: string, userId?: string) => {
  const key = `orderbook:${asset}:BUY`;
  const buyers = await redis.zrevrange(key, 0, -1);

  for (const buyer of buyers) {
    try {
      const parsed = JSON.parse(buyer);
      if (!userId || parsed.userId !== userId) {
        return parsed;
      }
    } catch {
      continue;
    }
  }

  return null;
};

export const removeExactOrderString = async (asset: string, side: string, orderString: string) => {
  const key = `orderbook:${asset}:${side}`;
  await redis.zrem(key, orderString);
};

export const removeOrderById = async (asset: string, side: string, orderId: string) => {
  const key = `orderbook:${asset}:${side}`;
  const orders = await redis.zrange(key, 0, -1);

  for (const orderString of orders) {
    try {
      const order = JSON.parse(orderString);
      if (order.orderId === orderId) {
        await redis.zrem(key, orderString);
        return true;
      }
    } catch {
      console.warn(`[OrderBook] Skipping malformed order while cancelling ${orderId}`);
    }
  }

  return false;
};

export const getOrderBookSnapshot = async (asset: string) => {
  const [asksRaw, bidsRaw] = await Promise.all([
    redis.zrange(`orderbook:${asset}:SELL`, 0, -1),
    redis.zrevrange(`orderbook:${asset}:BUY`, 0, -1),
  ]);

  const aggregate = (entries: string[]) => {
    const levels = new Map<number, number>();

    for (const entry of entries) {
      try {
        const order = JSON.parse(entry);
        const price = Number(order.price);
        const amount = Number(order.amount);
        if (!Number.isFinite(price) || !Number.isFinite(amount)) continue;
        levels.set(price, (levels.get(price) ?? 0) + amount);
      } catch {
        continue;
      }
    }

    return [...levels.entries()]
      .map(([price, amount]) => ({ price, amount }))
      .sort((a, b) => a.price - b.price);
  };

  return {
    asks: aggregate(asksRaw),
    bids: aggregate(bidsRaw).reverse(),
  };
};
