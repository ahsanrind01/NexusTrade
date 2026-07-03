import { getToken, invalidateSession } from './authClient';
import { Balance, WalletBalanceResponse } from '../types';
import { getErrorDetails, requestWithRetry } from './httpClient';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';

const toBalances = (response: WalletBalanceResponse): Balance[] => {
  return Object.entries(response.balance || {}).map(([asset, available]) => ({
    asset: asset.toUpperCase(),
    available: Number(available) || 0
  }));
};

// Fetches balances through the existing wallet-service response shape and
// normalizes it for the bot's internal inventory calculations.
export const getBalances = async (botId: string): Promise<Balance[]> => {
  const token = await getToken(botId);

  try {
    const response = await requestWithRetry<WalletBalanceResponse>({
      method: 'GET',
      url: `${GATEWAY_URL}/api/wallet/balance`,
      headers: { Authorization: `Bearer ${token}` }
    });

    return toBalances(response);
  } catch (err: any) {
    if (err.response?.status === 401) {
      invalidateSession(botId);
    }
    console.error(`[walletClient] Failed to fetch balances for ${botId}: ${getErrorDetails(err)}`);
    return [];
  }
};

// Convenience helper: get the available balance for one specific asset.
export const getAvailableBalance = async (botId: string, asset: string): Promise<number> => {
  const balances = await getBalances(botId);
  const match = balances.find(b => b.asset === asset);
  return match?.available ?? 0;
};
