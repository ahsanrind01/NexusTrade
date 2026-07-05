import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useMarketStore } from '../stores/marketStore';
import { CONFIG } from '../constants/config';

const BATCH_INTERVAL_MS = 150;

export function useMarketSocket() {
  const socketRef = useRef<Socket | null>(null);

  const updatePrice = useMarketStore((s) => s.updatePrice);
  const setConnected = useMarketStore((s) => s.setConnected);

  useEffect(() => {
    if (socketRef.current) return;

    const socket = io(CONFIG.SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 3000,
      reconnectionDelayMax: 15000,
      timeout: 10000,
    });
    socketRef.current = socket;
    const pendingPrices: Record<string, number> = {};

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);
    const handleConnectError = () => setConnected(false);
    const handleReconnect = () => setConnected(true);

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

    const flushIntervalId = setInterval(() => {
      const symbols = Object.keys(pendingPrices);

      if (symbols.length === 0) return;

      const currentPrices = useMarketStore.getState().prices;

      for (const symbol of symbols) {
        const nextPrice = pendingPrices[symbol];
        if (currentPrices[symbol]?.price !== nextPrice) {
          updatePrice(symbol, nextPrice);
        }
        delete pendingPrices[symbol];
      }
    }, BATCH_INTERVAL_MS);

    return () => {
      clearInterval(flushIntervalId);

      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.io.off('reconnect', handleReconnect);
      socket.off('global-price-update', handlePriceUpdate);
      socket.off('price-update', handlePriceUpdate);

      socket.disconnect();
      socketRef.current = null;
    };
  }, []);
}
