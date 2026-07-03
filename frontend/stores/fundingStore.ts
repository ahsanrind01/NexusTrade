import { create } from 'zustand';

export type FundingDirection = 'DEPOSIT' | 'WITHDRAWAL';
export type FundingType = 'FIAT_STRIPE' | 'CRYPTO_ETH';
export type FundingStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface FundingTransaction {
  id: string;
  direction: FundingDirection;
  type: FundingType;
  asset: string;
  amount: string;
  status: FundingStatus;
  cryptoAddress?: string | null;
  createdAt: string;
}

interface FundingState {
  transactions: FundingTransaction[];
  lastFetched: number | null;
  // The most recent deposit intent, kept around so the crypto-confirm
  // step (simulateCryptoDeposit) knows which transaction to confirm.
  pendingDepositId: string | null;
  setTransactions: (txs: FundingTransaction[]) => void;
  addTransaction: (tx: FundingTransaction) => void;
  setPendingDepositId: (id: string | null) => void;
  updateTransactionStatus: (id: string, status: FundingStatus) => void;
}

export const useFundingStore = create<FundingState>((set, get) => ({
  transactions: [],
  lastFetched: null,
  pendingDepositId: null,

  setTransactions: (transactions) => set({ transactions, lastFetched: Date.now() }),

  addTransaction: (tx) => set({ transactions: [tx, ...get().transactions] }),

  setPendingDepositId: (pendingDepositId) => set({ pendingDepositId }),

  updateTransactionStatus: (id, status) => set({
    transactions: get().transactions.map((tx) =>
      tx.id === id ? { ...tx, status } : tx
    ),
  }),
}));