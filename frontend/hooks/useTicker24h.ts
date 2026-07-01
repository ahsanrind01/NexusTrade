import { useQuery } from '@tanstack/react-query';
import { useMarketStore } from '../stores/marketStore';
import { useEffect } from 'react';

const ALL_SYMBOLS = [
  'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT',
  'ADAUSDT','DOGEUSDT','AVAXUSDT','DOTUSDT','LINKUSDT',
  'MATICUSDT','UNIUSDT','LTCUSDT','BCHUSDT','SHIBUSDT',
  'NEARUSDT','APTUSDT','FILUSDT','RNDRUSDT','ATOMUSDT',
  'VETUSDT','XLMUSDT','TRXUSDT','ETCUSDT','ICPUSDT',
  'HBARUSDT','ALGOUSDT','EGLDUSDT','XTZUSDT','AAVEUSDT',
  'SANDUSDT','MANAUSDT','AXSUSDT','GRTUSDT','FTMUSDT',
  'RUNEUSDT','INJUSDT','OPUSDT','ARBUSDT',
];

async function fetchTicker24h() {
  const res = await fetch('https://api.binance.com/api/v3/ticker/24hr');
  const data = await res.json();
  const map: Record<string, number> = {};
  for (const item of data) {
    if (ALL_SYMBOLS.includes(item.symbol)) {
      map[item.symbol] = parseFloat(item.priceChangePercent);
    }
  }
  return map;
}

async function fetchAllSparklines() {
  const results = await Promise.all(
    ALL_SYMBOLS.map(async (symbol) => {
      try {
        const res = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=24`
        );
        const data = await res.json();
        return [symbol, data.map((k: any[]) => parseFloat(k[4]))] as const;
      } catch {
        return [symbol, [] as number[]] as const;
      }
    })
  );
  return Object.fromEntries(results);
}

export function useTicker24h(symbols?: string[]) {
  const setTicker24h = useMarketStore((s) => s.setTicker24h);
  const updateSparkline = useMarketStore((s) => s.updateSparkline);

  const tickerQuery = useQuery({
    queryKey: ['ticker24h'],
    queryFn: fetchTicker24h,
    staleTime: 1000 * 25,
    refetchInterval: 1000 * 30,
  });

  const sparklineQuery = useQuery({
    queryKey: ['sparklines'],
    queryFn: fetchAllSparklines,
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!tickerQuery.data) return;
    const map: Record<string, { change: number; sparkline: number[] }> = {};
    for (const [symbol, change] of Object.entries(tickerQuery.data)) {
      map[symbol] = {
        change,
        sparkline: useMarketStore.getState().ticker24h[symbol]?.sparkline ?? [],
      };
    }
    setTicker24h(map);
  }, [tickerQuery.data]);

  useEffect(() => {
    if (!sparklineQuery.data) return;
    for (const [symbol, closes] of Object.entries(sparklineQuery.data)) {
      updateSparkline(symbol, closes);
    }
  }, [sparklineQuery.data]);

  return {
    isLoading: tickerQuery.isLoading,
    isFetchingSparklines: sparklineQuery.isLoading,
  };
}