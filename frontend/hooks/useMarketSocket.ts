import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useMarketStore } from '../stores/marketStore';
import { CONFIG } from '../constants/config';

const BATCH_INTERVAL_MS = 150;

let socket: Socket | null = null;
let flushIntervalId: ReturnType<typeof setInterval> | null = null;
let consumerCount = 0;
const pendingPrices: Record<string, number> = {};

function startMarketSocket() {
  if (socket || flushIntervalId) return;

  socket = io(CONFIG.SOCKET_URL, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 3000,
    reconnectionDelayMax: 15000,
    timeout: 10000,
  });

  const handleConnect = () => useMarketStore.getState().setConnected(true);
  const handleDisconnect = () => useMarketStore.getState().setConnected(false);
  const handleConnectError = () => useMarketStore.getState().setConnected(false);
  const handleReconnect = () => useMarketStore.getState().setConnected(true);

  const handlePriceUpdate = (data: { asset: string; price: number }) => {
    if (!data?.asset || !Number.isFinite(data.price)) return;
    pendingPrices[data.asset] = data.price;
  };

  socket.on('connect', handleConnect);
  socket.on('disconnect', handleDisconnect);
  socket.on('connect_error', handleConnectError);
  socket.io.on('reconnect', handleReconnect);
  socket.on('global-price-update', handlePriceUpdate);
  socket.on('price-update', handlePriceUpdate);

  flushIntervalId = setInterval(() => {
    const symbols = Object.keys(pendingPrices);

    if (symbols.length === 0) return;

    const currentPrices = useMarketStore.getState().prices;
    const { updatePrice } = useMarketStore.getState();

    for (const symbol of symbols) {
      const nextPrice = pendingPrices[symbol];
      if (currentPrices[symbol]?.price !== nextPrice) {
        updatePrice(symbol, nextPrice);
      }
      delete pendingPrices[symbol];
    }
  }, BATCH_INTERVAL_MS);
}

export function useMarketSocket() {
  useEffect(() => {
    consumerCount += 1;
    startMarketSocket();

    return () => {
      consumerCount = Math.max(0, consumerCount - 1);

      // Keep the singleton alive for the app lifetime to avoid duplicate
      // socket/timer churn across mounted tabs.
      if (consumerCount > 0) return;
    };
  }, []);
}
