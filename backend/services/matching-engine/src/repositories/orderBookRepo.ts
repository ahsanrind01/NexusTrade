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

export const getHighestBuyer = async (asset: string) => {
  const key = `orderbook:${asset}:BUY`;
  const buyers = await redis.zrevrange(key, 0, 0);
  return buyers.length > 0 ? JSON.parse(buyers[0]) : null;
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
