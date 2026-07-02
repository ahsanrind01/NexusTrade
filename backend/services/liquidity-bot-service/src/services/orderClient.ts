import { getToken, invalidateSession } from './authClient';
import { Order, PlaceOrderRequest } from '../types';
import { getErrorDetails, requestWithRetry } from './httpClient';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';

// All order operations go through the same public /api/orders/* routes
// exposed via api-gateway — identical to what the mobile app calls.
// No Redis, Kafka, or matching-engine access from this service at all.

export const placeOrder = async (
  botId: string,
  request: PlaceOrderRequest
): Promise<Order | null> => {
  const token = await getToken(botId);

  try {
    return await requestWithRetry<Order>({
      method: 'POST',
      url: `${GATEWAY_URL}/api/orders`,
      data: request,
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (err: any) {
    if (err.response?.status === 401) {
      invalidateSession(botId);
    }
    console.error(`[orderClient] Failed to place order for ${botId}: ${getErrorDetails(err)}`);
    return null;
  }
};

export const getOpenOrders = async (botId: string, symbol: string): Promise<Order[]> => {
  const token = await getToken(botId);

  try {
    return await requestWithRetry<Order[]>({
      method: 'GET',
      url: `${GATEWAY_URL}/api/orders`,
      headers: { Authorization: `Bearer ${token}` },
      params: { symbol, status: 'open' }
    });
  } catch (err: any) {
    if (err.response?.status === 401) {
      invalidateSession(botId);
    }
    console.error(`[orderClient] Failed to fetch open orders for ${botId}: ${getErrorDetails(err)}`);
    return [];
  }
};

export const cancelOrder = async (botId: string, orderId: string): Promise<boolean> => {
  const token = await getToken(botId);

  try {
    await requestWithRetry<void>({
      method: 'DELETE',
      url: `${GATEWAY_URL}/api/orders/${orderId}`,
      headers: { Authorization: `Bearer ${token}` }
    });
    return true;
  } catch (err: any) {
    if (err.response?.status === 401) {
      invalidateSession(botId);
    }
    console.error(`[orderClient] Failed to cancel order ${orderId} for ${botId}: ${getErrorDetails(err)}`);
    return false;
  }
};
