import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useMarketStore } from '../stores/marketStore';
import { CONFIG } from '../constants/config';

// How often buffered price updates are flushed into the Zustand store.
// Incoming websocket messages can arrive far more often than this — dozens
// of times per second across many symbols during a volatile market. Instead
// of pushing every single message straight into the store (which triggers a
// state update + re-render cascade per message), we collect the latest
// price per symbol in a plain buffer and flush it in one pass on this fixed
// cadence. This puts a hard ceiling on how often the store — and therefore
// React — has to do work, independent of how fast the socket is sending
// data. 150ms (~6-7 updates/sec/symbol) keeps the UI feeling live while
// capping the update rate well below what would cause visible jank.
const BATCH_INTERVAL_MS = 150;

export function useMarketSocket() {
  const socketRef = useRef<Socket | null>(null);

  // Zustand actions are stable references (created once when the store is
  // set up), so it's safe to read them via selector and use them inside an
  // effect with an empty dependency array — same as the original code.
  const updatePrice = useMarketStore((s) => s.updatePrice);
  const setConnected = useMarketStore((s) => s.setConnected);

  useEffect(() => {
    // Defensive guard: if this effect were ever invoked again before its
    // cleanup ran, this prevents a second socket from being created. In
    // practice React always runs cleanup before re-invoking an effect (even
    // under StrictMode's dev-only double-invoke), so this is mostly a cheap
    // safety net rather than something that fires in normal operation.
    if (socketRef.current) return;

    const socket = io(CONFIG.SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 3000,
    });
    socketRef.current = socket;

    // Plain object, not React state — this effect body runs exactly once
    // (empty dependency array), so a closure-scoped variable is enough to
    // hold the buffer for this socket's entire lifetime; no useRef needed
    // for it, and no re-render is triggered by writing to it.
    const pendingPrices: Record<string, number> = {};

    // Named handlers (instead of anonymous inline functions) so each one
    // can be explicitly removed with `socket.off` in cleanup. This
    // guarantees exactly one registration of each listener for the
    // lifetime of this socket instance, and that cleanup actually detaches
    // them rather than relying solely on the socket being discarded.
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    // The hot path. Every incoming tick just overwrites this symbol's
    // entry in the buffer — an O(1) property write, nothing reactive.
    // No Zustand call, no re-render, regardless of how fast messages
    // arrive.
    const handlePriceUpdate = (data: { asset: string; price: number }) => {
      pendingPrices[data.asset] = data.price;
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('global-price-update', handlePriceUpdate);

    // Batch-flush loop: on a fixed cadence, drain whatever accumulated in
    // the buffer since the last tick and push it into the store.
    const flushIntervalId = setInterval(() => {
      const symbols = Object.keys(pendingPrices);

      // Nothing accumulated since the last flush (e.g. a quiet market, or
      // a brief gap between reconnects) — skip touching the store
      // entirely rather than doing a no-op flush every 150ms forever.
      if (symbols.length === 0) return;

      // Read the store's current prices once via getState() (a direct,
      // non-subscribing read — this does NOT cause this hook to
      // re-render) purely to avoid redundant writes: if the server
      // re-sends a price that hasn't actually changed since the last
      // flush, there's no need to push it into the store and cause a
      // re-render for it.
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
      // Stop the flush loop before tearing down the socket, so no flush
      // can fire after the socket (and its listeners) are gone.
      clearInterval(flushIntervalId);

      // Explicitly detach listeners before disconnecting — correct
      // cleanup regardless of how the socket instance is torn down.
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('global-price-update', handlePriceUpdate);

      socket.disconnect();
      socketRef.current = null;
    };
  }, []);
}