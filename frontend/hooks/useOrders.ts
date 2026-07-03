import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../lib/api';
import { useOrderStore, Order, Trade, OrderSide } from '../stores/orderStore';

async function fetchMyOrders() {
  const res = await api.get('/orders/my-orders');
  return res.data.orders as Order[];
}

async function fetchMyTrades() {
  const res = await api.get('/orders/my-trades');
  return res.data.trades as Trade[];
}

interface PlaceOrderInput {
  asset: string;
  side: OrderSide;
  price: number;
  amount: number;
}

async function placeOrderRequest(input: PlaceOrderInput) {
  const res = await api.post('/orders/place', input);
  return res.data as { success: boolean; orderId: string };
}

async function cancelOrderRequest(orderId: string) {
  const res = await api.delete(`/orders/${orderId}`);
  return res.data as { success: boolean; order: Order };
}

// GET /orders/my-orders — the source of truth for a user's open + historical orders.
export function useMyOrders() {
  const setOrders = useOrderStore((s) => s.setOrders);

  const query = useQuery({
    queryKey: ['orders', 'my-orders'],
    queryFn: fetchMyOrders,
    staleTime: 1000 * 15,
    refetchInterval: 1000 * 20,
    retry: 2,
  });

  useEffect(() => {
    if (query.data) setOrders(query.data);
  }, [query.data]);

  return query;
}

// GET /orders/my-trades — fills/executions, separate from the resting orders list.
export function useMyTrades() {
  const setTrades = useOrderStore((s) => s.setTrades);

  const query = useQuery({
    queryKey: ['orders', 'my-trades'],
    queryFn: fetchMyTrades,
    staleTime: 1000 * 20,
    retry: 2,
  });

  useEffect(() => {
    if (query.data) setTrades(query.data);
  }, [query.data]);

  return query;
}

// POST /orders/place — submits a limit order to the matching engine via Kafka.
export function usePlaceOrder() {
  const queryClient = useQueryClient();
  const upsertOrder = useOrderStore((s) => s.upsertOrder);

  return useMutation({
    mutationFn: placeOrderRequest,
    onSuccess: (data, variables) => {
      // Optimistic row so the UI reflects the order immediately; the next
      // my-orders refetch will replace it with the server's full record.
      upsertOrder({
        id: data.orderId,
        userId: '',
        asset: variables.asset,
        side: variables.side,
        price: String(variables.price),
        amount: String(variables.amount),
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ['orders', 'my-orders'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
    },
  });
}

// DELETE /orders/:orderId — cancels a resting order.
export function useCancelOrder() {
  const queryClient = useQueryClient();
  const removeOrder = useOrderStore((s) => s.removeOrder);

  return useMutation({
    mutationFn: cancelOrderRequest,
    onSuccess: (_data, orderId) => {
      removeOrder(orderId);
      queryClient.invalidateQueries({ queryKey: ['orders', 'my-orders'] });
    },
  });
}