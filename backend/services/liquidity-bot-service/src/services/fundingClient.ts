import { getToken, invalidateSession } from './authClient';
import { DepositIntentResponse } from '../types';
import { getErrorDetails, requestWithRetry } from './httpClient';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';

// Reuses the existing funding-service deposit flow: create an intent, then
// simulate the crypto deposit against that intent. No new funding logic —
// just chains the two existing endpoints.
export const topUpBalance = async (
  botId: string,
  asset: string,
  amount: number
): Promise<boolean> => {
  const token = await getToken(botId);
  const headers = { Authorization: `Bearer ${token}` };

  try {
    const intentResponse = await requestWithRetry<DepositIntentResponse>({
      method: 'POST',
      url: `${GATEWAY_URL}/api/funding/deposit/intent`,
      data: { asset, amount },
      headers
    });

    const { intentId } = intentResponse;

    await requestWithRetry<void>({
      method: 'POST',
      url: `${GATEWAY_URL}/api/funding/deposit/simulate-crypto`,
      data: { intentId },
      headers
    });

    console.log(`[fundingClient] Bot ${botId} topped up ${amount} ${asset}`);
    return true;
  } catch (err: any) {
    if (err.response?.status === 401) {
      invalidateSession(botId);
    }
    console.error(`[fundingClient] Top-up failed for ${botId} (${asset}): ${getErrorDetails(err)}`);
    return false;
  }
};
