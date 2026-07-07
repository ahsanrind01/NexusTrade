import { consumer } from '../config/kafka';
import { redis } from '../config/redis';
import { getWalletBalanceKeys } from './walletState';
import { ensureKafkaTopics } from '../../../../shared/src/kafka/bootstrapTopics';

const BALANCE_EPSILON = 1e-8;

export const startBalanceConsumer = async () => {
  await ensureKafkaTopics('wallet-service', ['balance-updates']);
  await consumer.connect();
  await consumer.subscribe({ topic: 'balance-updates', fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      const { userId, asset, newBalance } = JSON.parse(message.value.toString());
      const assetKey = String(asset).toUpperCase();
      const ledgerBalance = Number(newBalance);
      const currentTotalRaw = await redis.hget(getWalletBalanceKeys(userId).total, assetKey);
      const currentTotal = Number(currentTotalRaw);
      const currentBalance = Number.isFinite(currentTotal) ? currentTotal : 0;

      if (Math.abs(currentBalance - ledgerBalance) <= BALANCE_EPSILON) {
        return;
      }

      console.warn(`[Wallet] Drift detected for ${userId}/${assetKey}: redis=${currentBalance} ledger=${ledgerBalance}`);
    },
  });
};
