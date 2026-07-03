import { getToken, invalidateSession } from './authClient';
import {
  Order,
  OrderServiceOrder,
  OrderServiceOrderListResponse,
  PlaceOrderRequest,
  PlaceOrderResponse
} from '../types';
import { getErrorDetails, requestWithRetry } from './httpClient';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';

const toExchangeSide = (side: PlaceOrderRequest['side']): 'BUY' | 'SELL' => {
  return side === 'buy' ? 'BUY' : 'SELL';
};

const fromServiceOrder = (order: OrderServiceOrder): Order => ({
  id: order.id,
  symbol: order.asset,
  side: order.side === 'BUY' ? 'buy' : 'sell',
  price: Number(order.price),
  quantity: Number(order.amount),
  status: order.status === 'PENDING' ? 'open' : order.status.toLowerCase() as Order['status'],
  createdAt: order.createdAt
});

const isActiveOrder = (order: OrderServiceOrder): boolean => {
  return order.status === 'PENDING' || order.status === 'PARTIAL';
};

// All order operations go through the public Order Service APIs exposed by the
// gateway. The bot adapts its internal shape to the existing exchange contract.

export const placeOrder = async (
  botId: string,
  request: PlaceOrderRequest
): Promise<Order | null> => {
  const token = await getToken(botId);

  try {
    const response = await requestWithRetry<PlaceOrderResponse>({
      method: 'POST',
      url: `${GATEWAY_URL}/api/orders/place`,
      data: {
        asset: request.symbol,
        amount: request.quantity,
        price: request.price,
        side: toExchangeSide(request.side)
      },
      headers: { Authorization: `Bearer ${token}` }
    });

    return {
      id: response.orderId,
      symbol: request.symbol,
      side: request.side,
      price: request.price,
      quantity: request.quantity,
      status: 'open',
      createdAt: new Date().toISOString()
    };
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
    const response = await requestWithRetry<OrderServiceOrderListResponse>({
      method: 'GET',
      url: `${GATEWAY_URL}/api/orders/my-orders`,
      headers: { Authorization: `Bearer ${token}` }
    });

    return response.orders
      .filter(order => order.asset === symbol && isActiveOrder(order))
      .map(fromServiceOrder);
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
