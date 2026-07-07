import { Kafka } from 'kafkajs';
import { redis } from '../config/redis';
import { getWalletBalanceKeys, getWalletSnapshot } from './walletState';
import { snapshotPortfolioValueForUser } from './portfolioSnapshotService';
import { ensureKafkaTopics } from '../../../../shared/src/kafka/bootstrapTopics';

const kafka = new Kafka({
  clientId: 'wallet-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'wallet-funding-group' });
const producer = kafka.producer(); 

const markEventProcessed = async (key: string, ttlSeconds = 60 * 60 * 24 * 7) => {
  const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
  return result === 'OK';
};

export const startFundingConsumer = async () => {
  try {
    await ensureKafkaTopics('wallet-service-funding', [
      'deposit-cleared',
      'withdrawal-requested',
      'withdrawal-validated',
      'withdrawal-rejected',
    ]);
    await producer.connect();
    await consumer.connect();
    
    await consumer.subscribe({ topic: 'deposit-cleared', fromBeginning: true });
    await consumer.subscribe({ topic: 'withdrawal-requested', fromBeginning: true });

    console.log('📥 [Wallet Service] Listening for deposits and withdrawal requests...');

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (!message.value) return;
        const event = JSON.parse(message.value.toString());

        if (topic === 'deposit-cleared') {
          const { userId, asset, amount, eventId } = event;
          if (!eventId) {
            console.warn('[Wallet] Skipping deposit-cleared event without eventId');
            return;
          }

          const processed = await markEventProcessed(`wallet:processed:deposit-cleared:${eventId}`);
          if (!processed) {
            console.log(`[Wallet] Duplicate deposit-cleared event ignored: ${eventId}`);
            return;
          }

          const assetKey = asset.toUpperCase();
          const depositAmount = parseFloat(amount);
          const keys = getWalletBalanceKeys(userId);
          const multi = redis.multi();

          multi.hincrbyfloat(keys.total, assetKey, depositAmount);
          multi.hincrbyfloat(keys.available, assetKey, depositAmount);
          multi.hincrbyfloat(keys.legacy, assetKey, depositAmount);

          await multi.exec();
          await snapshotPortfolioValueForUser(userId);

          const snapshot = await getWalletSnapshot(userId);
          const current = snapshot[assetKey] ?? { total: 0, available: 0, locked: 0 };
          console.log(`[Wallet Cache] Deposit ${eventId} applied. ${userId} new ${assetKey} balance: ${current.available}`);
        }

        if (topic === 'withdrawal-requested') {
          const { transactionId, eventId, userId, asset, amount } = event;
          const idempotencyKey = eventId || transactionId;
          if (!idempotencyKey) {
            console.warn('[Wallet] Skipping withdrawal-requested event without an idempotency key');
            return;
          }

          const processed = await markEventProcessed(`wallet:processed:withdrawal-requested:${idempotencyKey}`);
          if (!processed) {
            console.log(`[Wallet] Duplicate withdrawal-requested event ignored: ${idempotencyKey}`);
            return;
          }

          const assetKey = asset.toUpperCase();

          console.log(` [Wallet] Validating withdrawal ${transactionId} for ${amount} ${assetKey}...`);
          const requestedAmount = parseFloat(amount);

          while (true) {
            const keys = getWalletBalanceKeys(userId);
            await redis.watch(keys.total, keys.available, keys.legacy);

            const [currentTotalRaw, currentAvailableRaw] = await Promise.all([
              redis.hget(keys.total, assetKey),
              redis.hget(keys.available, assetKey),
            ]);

            const currentTotal = Number(currentTotalRaw ?? 0);
            const currentAvailable = Number(currentAvailableRaw ?? 0);
            const availableBalance = Number.isFinite(currentAvailable) ? currentAvailable : 0;
            const totalBalance = Number.isFinite(currentTotal) ? currentTotal : 0;

            if (availableBalance < requestedAmount) {
              await redis.unwatch();
              console.log(`[Wallet] Insufficient funds (${availableBalance} < ${requestedAmount}). Rejecting.`);

              await producer.send({
                topic: 'withdrawal-rejected',
                messages: [{ value: JSON.stringify({ transactionId, userId, asset, amount, status: 'REJECTED', reason: 'INSUFFICIENT_FUNDS' }) }]
              });
              break;
            }

            const nextTotal = Math.max(totalBalance - requestedAmount, 0);
            const nextAvailable = Math.max(availableBalance - requestedAmount, 0);

            const tx = redis.multi();
            tx.hset(keys.total, assetKey, nextTotal);
            tx.hset(keys.available, assetKey, nextAvailable);
            tx.hset(keys.legacy, assetKey, nextAvailable);

            const result = await tx.exec();
            if (result) {
              await snapshotPortfolioValueForUser(userId);
              console.log(`[Wallet] Funds locked. New balance: ${nextAvailable}. Approving.`);

              await producer.send({
                topic: 'withdrawal-validated',
                messages: [{ value: JSON.stringify({ transactionId, userId, asset, amount, status: 'APPROVED' }) }]
              });
              break;
            }
          }
        }
      },
    });
  } catch (error) {
    console.error('[Wallet Consumer] Error running Kafka consumer:', error);
  }
};
