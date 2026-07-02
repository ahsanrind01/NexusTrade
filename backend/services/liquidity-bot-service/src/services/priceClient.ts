import { redis } from '../config/redis';
import { PriceData } from '../types';

// Reads the latest price for a symbol from Redis (written by market-data-service).
// Read-only — this service never writes to price:<SYMBOL>.
export const getLatestPrice = async (symbol: string): Promise<PriceData | null> => {
  try {
    const raw = await redis.get(`price:${symbol}`);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as PriceData;
  } catch (err: any) {
    console.error(`[priceClient] Failed to read price for ${symbol}:`, err.message);
    return null;
  }
};