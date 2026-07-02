import { getToken, invalidateSession } from './authClient';
import { Balance } from '../types';
import { getErrorDetails, requestWithRetry } from './httpClient';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';

// Fetches all balances for a bot account via the existing wallet-service endpoint.
// Assumption: GET /api/wallet/balance returns an array of { asset, available, locked }
// for the authenticated user. Adjust the parsing below if your endpoint instead
// takes a ?asset= query param or returns a single object.
export const getBalances = async (botId: string): Promise<Balance[]> => {
  const token = await getToken(botId);

  try {
    return await requestWithRetry<Balance[]>({
      method: 'GET',
      url: `${GATEWAY_URL}/api/wallet/balance`,
      headers: { Authorization: `Bearer ${token}` }
    });
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
