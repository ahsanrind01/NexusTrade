import { create } from 'zustand';

export interface AssetPrice {
  symbol: string;
  price: number;
  prevPrice: number;
  lastUpdated: number;
}

export interface Ticker24h {
  change: number;
  sparkline: number[];
}

interface MarketState {
  prices: Record<string, AssetPrice>;
  ticker24h: Record<string, Ticker24h>;
  connected: boolean;
  setConnected: (v: boolean) => void;
  updatePrice: (asset: string, price: number) => void;
  setTicker24h: (data: Record<string, Ticker24h>) => void;
  updateSparkline: (symbol: string, closes: number[]) => void;
}

export const useMarketStore = create<MarketState>((set, get) => ({
  prices: {},
  ticker24h: {},
  connected: false,

  setConnected: (connected) => set({ connected }),

  updatePrice: (asset, price) => {
    const current = get().prices[asset];
    set((state) => ({
      prices: {
        ...state.prices,
        [asset]: {
          symbol: asset,
          price,
          prevPrice: current?.price ?? price,
          lastUpdated: Date.now(),
        },
      },
    }));
  },

  setTicker24h: (data) => set((state) => ({
    ticker24h: { ...state.ticker24h, ...data },
  })),

  updateSparkline: (symbol, closes) => set((state) => ({
    ticker24h: {
      ...state.ticker24h,
      [symbol]: {
        change: state.ticker24h[symbol]?.change ?? 0,
        sparkline: closes,
      },
    },
  })),
}));