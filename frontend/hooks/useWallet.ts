import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../lib/api';
import { useWalletStore } from '../stores/walletStore';
import { useMarketStore } from '../stores/marketStore';

async function fetchWalletBalance() {
  const res = await api.get('/wallet/balance');
  return res.data.balance as Record<string, string>;
}

export function useWallet() {
  const setBalances = useWalletStore((s) => s.setBalances);
  const prices = useMarketStore((s) => s.prices);

  const livePrices: Record<string, number> = {};
  for (const [symbol, data] of Object.entries(prices)) {
    const asset = symbol.replace('USDT', '');
    livePrices[asset] = data.price;
  }

  const query = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: fetchWalletBalance,
    staleTime: 1000 * 20,
    refetchInterval: 1000 * 30,
    retry: 2,
  });

  useEffect(() => {
    if (query.data) {
      setBalances(query.data, livePrices);
    }
  }, [query.data, prices]);

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    isFetching: query.isFetching,
  };
}