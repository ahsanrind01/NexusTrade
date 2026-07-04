import axios from 'axios';

const walletApi = axios.create({
  baseURL: process.env.WALLET_SERVICE_URL || 'http://localhost:3004/api/wallet',
  timeout: 10000,
});

const buildHeaders = (userId: string, userEmail?: string) => ({
  'x-user-id': userId,
  'x-user-email': userEmail || '',
});

export const reserveWalletFunds = async (params: {
  userId: string;
  userEmail?: string;
  orderId: string;
  asset: string;
  amount: number;
  side: 'BUY' | 'SELL';
}) => {
  const { data } = await walletApi.post('/reserve', {
    orderId: params.orderId,
    asset: params.asset,
    amount: params.amount,
    side: params.side,
  }, {
    headers: buildHeaders(params.userId, params.userEmail),
  });

  return data as {
    success: boolean;
    alreadyReserved?: boolean;
    reservation?: unknown;
  };
};

export const releaseWalletFunds = async (params: {
  userId: string;
  userEmail?: string;
  orderId: string;
  releaseAmount?: number;
}) => {
  const { data } = await walletApi.post('/release', {
    orderId: params.orderId,
    releaseAmount: params.releaseAmount,
  }, {
    headers: buildHeaders(params.userId, params.userEmail),
  });

  return data as { success: boolean; releasedAmount: number };
};
