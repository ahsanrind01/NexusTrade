import { Kafka } from 'kafkajs';
import { redis } from '../config/redis';
import { getWalletSnapshot, setWalletBalance } from './walletState';
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

          const snapshot = await getWalletSnapshot(userId);
          const assetKey = asset.toUpperCase();
          const current = snapshot[assetKey] ?? { total: 0, available: 0, locked: 0 };
          const nextTotal = current.total + parseFloat(amount);
          const nextAvailable = current.available + parseFloat(amount);

          await setWalletBalance(userId, assetKey, nextTotal, nextAvailable, current.locked);
          console.log(`[Wallet Cache] Deposit ${eventId} applied. ${userId} new ${assetKey} balance: ${nextAvailable}`);
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
          
          const snapshot = await getWalletSnapshot(userId);
          const current = snapshot[assetKey] ?? { total: 0, available: 0, locked: 0 };
          const currentBalance = current.available;
          const requestedAmount = parseFloat(amount);

          if (currentBalance >= requestedAmount) {
            const nextTotal = Math.max(current.total - requestedAmount, 0);
            const nextAvailable = Math.max(current.available - requestedAmount, 0);
            await setWalletBalance(userId, assetKey, nextTotal, nextAvailable, current.locked);
            console.log(`[Wallet] Funds locked. New balance: ${nextAvailable}. Approving.`);

            await producer.send({
              topic: 'withdrawal-validated',
              messages: [{ value: JSON.stringify({ transactionId, userId, asset, amount, status: 'APPROVED' }) }]
            });
          } else {
            console.log(`[Wallet] Insufficient funds (${currentBalance} < ${requestedAmount}). Rejecting.`);

            await producer.send({
              topic: 'withdrawal-rejected',
              messages: [{ value: JSON.stringify({ transactionId, userId, asset, amount, status: 'REJECTED', reason: 'INSUFFICIENT_FUNDS' }) }]
            });
          }
        }
      },
    });
  } catch (error) {
    console.error('[Wallet Consumer] Error running Kafka consumer:', error);
  }
};
