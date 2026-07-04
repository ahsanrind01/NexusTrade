import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import {
  useFundingStore,
  FundingTransaction,
  FundingType,
  FundingDirection,
} from '../stores/fundingStore';

interface DepositIntentInput {
  asset: string;
  amount: string | number;
  type: FundingType;
}

interface DepositIntentResponse {
  success: boolean;
  message: string;
  transaction: {
    id: string;
    status: string;
    type: string;
    amount: string;
    asset: string;
    stripeClientSecret: string | null;
    cryptoDepositAddress: string | null;
  };
}

interface WithdrawIntentInput {
  asset: string;
  amount: string | number;
  type: FundingType;
  destinationAddress?: string;
}

interface WithdrawIntentResponse {
  success: boolean;
  message: string;
  transaction: {
    id: string;
    status: string;
    direction: string;
    amount: string;
    asset: string;
  };
}

async function fetchFundingHistory() {
  const res = await api.get('/funding/transactions');
  return res.data.transactions as FundingTransaction[];
}

async function createDepositIntentRequest(input: DepositIntentInput) {
  const res = await api.post('/funding/deposit/intent', input);
  return res.data as DepositIntentResponse;
}

async function simulateCryptoDepositRequest(transactionId: string) {
  const res = await api.post('/funding/deposit/simulate-crypto', { transactionId });
  return res.data as { success: boolean; status: string };
}

async function createWithdrawalIntentRequest(input: WithdrawIntentInput) {
  const res = await api.post('/funding/withdraw/intent', input);
  return res.data as WithdrawIntentResponse;
}

// GET /funding/transactions — deposit & withdrawal history for the wallet screen.
export function useFundingHistory() {
  const setTransactions = useFundingStore((s) => s.setTransactions);
  const token = useAuthStore((s) => s.token);

  const query = useQuery({
    queryKey: ['funding', 'transactions'],
    queryFn: fetchFundingHistory,
    enabled: !!token,
    staleTime: 1000 * 20,
    refetchInterval: 1000 * 15,
    retry: 2,
  });

  useEffect(() => {
    if (query.data) setTransactions(query.data);
  }, [query.data]);

  return query;
}

// POST /funding/deposit/intent — starts a deposit. For FIAT_STRIPE this
// returns a checkout URL; for CRYPTO_ETH it returns a deposit address and
// the caller can follow up with useSimulateCryptoDeposit once "sent".
export function useCreateDepositIntent() {
  const queryClient = useQueryClient();
  const setPendingDepositId = useFundingStore((s) => s.setPendingDepositId);
  const addTransaction = useFundingStore((s) => s.addTransaction);

  return useMutation({
    mutationFn: createDepositIntentRequest,
    onSuccess: (data) => {
      setPendingDepositId(data.transaction.id);
      addTransaction({
        id: data.transaction.id,
        direction: 'DEPOSIT',
        type: data.transaction.type as FundingType,
        asset: data.transaction.asset,
        amount: data.transaction.amount,
        status: data.transaction.status as FundingTransaction['status'],
        createdAt: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ['funding', 'transactions'] });
    },
  });
}

// POST /funding/deposit/simulate-crypto — confirms a pending CRYPTO_ETH
// deposit (stand-in for on-chain confirmation) and triggers the wallet
// balance update via Kafka on the backend.
export function useSimulateCryptoDeposit() {
  const queryClient = useQueryClient();
  const updateTransactionStatus = useFundingStore((s) => s.updateTransactionStatus);

  return useMutation({
    mutationFn: simulateCryptoDepositRequest,
    onSuccess: (_data, transactionId) => {
      updateTransactionStatus(transactionId, 'COMPLETED');
      queryClient.invalidateQueries({ queryKey: ['funding', 'transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
    },
  });
}

// POST /funding/withdraw/intent — requests a withdrawal; the wallet-service
// validates and debits the balance asynchronously via Kafka.
export function useCreateWithdrawalIntent() {
  const queryClient = useQueryClient();
  const addTransaction = useFundingStore((s) => s.addTransaction);

  return useMutation({
    mutationFn: createWithdrawalIntentRequest,
    onSuccess: (data, variables) => {
      addTransaction({
        id: data.transaction.id,
        direction: data.transaction.direction as FundingDirection,
        type: variables.type,
        asset: data.transaction.asset,
        amount: data.transaction.amount,
        status: data.transaction.status as FundingTransaction['status'],
        createdAt: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ['funding', 'transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
    },
  });
}
