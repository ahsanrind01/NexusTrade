import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { PRICE_MAP, useWalletStore } from '../stores/walletStore';
import { useMarketStore } from '../stores/marketStore';
import { useShallow } from 'zustand/react/shallow';

async function fetchWalletBalance() {
  const res = await api.get('/wallet/balance');
  return res.data.balance as Record<string, string>;
}

async function fetchWalletTransfers() {
  const res = await api.get('/wallet/transfers');
  return res.data.transfers as WalletTransferRecord[];
}

interface TransferFundsInput {
  recipient: string;
  asset: string;
  amount: number;
  requestId: string;
}

async function transferFundsRequest(input: TransferFundsInput) {
  const res = await api.post('/wallet/transfer', input);
  return res.data as { success: boolean; transfer: WalletTransferRecord; duplicate?: boolean };
}

export interface WalletTransferRecord {
  id: string;
  transferId: string;
  direction: 'IN' | 'OUT';
  asset: string;
  amount: string;
  counterpartyId: string;
  counterpartyEmail: string;
  status: 'COMPLETED';
  createdAt: string;
}

export function useWallet() {
  const setBalances = useWalletStore((s) => s.setBalances);
  const token = useAuthStore((s) => s.token);

  const query = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: fetchWalletBalance,
    enabled: !!token,
    staleTime: 1000 * 20,
    refetchInterval: 1000 * 30,
    retry: 2,
  });

  const balanceAssets = useMemo(
    () => Object.keys(query.data ?? {}),
    [query.data]
  );

  const livePrices = useMarketStore(useShallow((s) => {
    const next: Record<string, number> = {};
    for (const asset of balanceAssets) {
      next[asset] = asset === 'USDT'
        ? (PRICE_MAP[asset] ?? 1)
        : (s.prices[`${asset}USDT`]?.price ?? PRICE_MAP[asset] ?? 0);
    }
    return next;
  }));

  useEffect(() => {
    if (query.data) {
      setBalances(query.data, livePrices);
    }
  }, [query.data, livePrices, setBalances]);

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    isFetching: query.isFetching,
  };
}

export function useWalletTransfers() {
  const token = useAuthStore((s) => s.token);

  return useQuery({
    queryKey: ['wallet-transfers'],
    queryFn: fetchWalletTransfers,
    enabled: !!token,
    staleTime: 1000 * 10,
    refetchInterval: 1000 * 15,
    retry: 2,
  });
}

export function useTransferFunds() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: transferFundsRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-transfers'] });
    },
  });
}
