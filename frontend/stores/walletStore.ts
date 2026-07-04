import { create } from 'zustand';

export interface WalletBalance {
  [asset: string]: number;
}

interface WalletState {
  balances: WalletBalance;
  totalUsd: number;
  lastFetched: number | null;
  setBalances: (raw: Record<string, string>, prices: Record<string, number>) => void;
  updateTotalUsd: (prices: Record<string, number>) => void;
}

export const PRICE_MAP: Record<string, number> = {
  USDT: 1, USDC: 1,
  BTC: 67420, ETH: 3512, BNB: 412,
  SOL: 142, XRP: 0.52, ADA: 0.44,
  DOGE: 0.12, AVAX: 28,
};

export const useWalletStore = create<WalletState>((set, get) => ({
  balances: {},
  totalUsd: 0,
  lastFetched: null,

  setBalances: (raw, prices) => {
    const balances: WalletBalance = {};
    let totalUsd = 0;
    for (const [asset, val] of Object.entries(raw)) {
      const key = asset.toUpperCase();
      const amount = parseFloat(val);
      balances[key] = amount;
      const price = prices[key] ?? PRICE_MAP[key] ?? 0;
      totalUsd += amount * price;
    }
    set({ balances, totalUsd, lastFetched: Date.now() });
  },

  updateTotalUsd: (prices) => {
    const { balances } = get();
    let totalUsd = 0;
    for (const [asset, amount] of Object.entries(balances)) {
      const price = prices[asset] ?? PRICE_MAP[asset] ?? 0;
      totalUsd += amount * price;
    }
    set({ totalUsd });
  },
}));