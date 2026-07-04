import { useQuery } from '@tanstack/react-query';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { useWalletStore } from '../stores/walletStore';
import { useMarketStore } from '../stores/marketStore';

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
  const prices = useMarketStore((s) => s.prices);
  const token = useAuthStore((s) => s.token);

  const livePrices: Record<string, number> = {};
  for (const [symbol, data] of Object.entries(prices)) {
    const asset = symbol.replace('USDT', '');
    livePrices[asset] = data.price;
  }

  const query = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: fetchWalletBalance,
    enabled: !!token,
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
