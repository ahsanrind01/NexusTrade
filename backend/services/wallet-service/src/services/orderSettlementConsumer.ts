import { Kafka } from 'kafkajs';
import { redis } from '../config/redis';
import { consumeReservation, releaseReservation, getReservation } from './walletState';
import { snapshotPortfolioValueForUser } from './portfolioSnapshotService';
import { ensureKafkaTopics } from '../../../../shared/src/kafka/bootstrapTopics';

const kafka = new Kafka({
  clientId: 'wallet-service-settlement',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'wallet-settlement-group' });

const markProcessed = async (key: string, ttlSeconds = 60 * 60 * 24 * 7) => {
  const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
  return result === 'OK';
};

const settleSide = async (params: {
  userId: string;
  orderId: string;
  side: 'BUY' | 'SELL';
  baseAsset: string;
  quoteAsset: string;
  baseAmount: number;
  quoteAmount: number;
}) => {
  const { userId, orderId, side, baseAsset, quoteAsset, baseAmount, quoteAmount } = params;
  const spendAmount = side === 'BUY' ? quoteAmount : baseAmount;
  const receivedAsset = side === 'BUY' ? baseAsset : quoteAsset;
  const receivedAmount = side === 'BUY' ? baseAmount : quoteAmount;

  await consumeReservation({
    userId,
    orderId,
    spentAmount: spendAmount,
    receivedAsset,
    receivedAmount,
  });
  await snapshotPortfolioValueForUser(userId);
};

export const startOrderSettlementConsumer = async () => {
  await ensureKafkaTopics('wallet-service-settlement', [
    'completed-trades',
    'cancelled-orders',
    'order-finalized',
  ]);
  await consumer.connect();
  await consumer.subscribe({ topic: 'completed-trades', fromBeginning: true });
  await consumer.subscribe({ topic: 'cancelled-orders', fromBeginning: true });
  await consumer.subscribe({ topic: 'order-finalized', fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return;
      const event = JSON.parse(message.value.toString());

      if (topic === 'completed-trades') {
        const { tradeId } = event;
        if (!tradeId) return;

        const processed = await markProcessed(`wallet:settlement:trade:${tradeId}`);
        if (!processed) return;

        const baseAsset = String(event.baseAsset ?? event.asset.replace(/USDT$/, '')).toUpperCase();
        const quoteAsset = String(event.quoteAsset ?? 'USDT').toUpperCase();
        const baseAmount = Number(event.amount);
        const quoteAmount = Number(event.quoteAmount ?? Number(event.amount) * Number(event.price));

        await settleSide({
          userId: event.takerUserId,
          orderId: event.takerOrderId,
          side: event.takerSide,
          baseAsset,
          quoteAsset,
          baseAmount,
          quoteAmount,
        });

        await settleSide({
          userId: event.makerUserId,
          orderId: event.makerOrderId,
          side: event.takerSide === 'BUY' ? 'SELL' : 'BUY',
          baseAsset,
          quoteAsset,
          baseAmount,
          quoteAmount,
        });

        return;
      }

      if (topic === 'cancelled-orders') {
        const { orderId, userId } = event;
        if (!orderId || !userId) return;

        const processed = await markProcessed(`wallet:settlement:cancel:${orderId}`);
        if (!processed) return;

        const reservation = await getReservation(userId, orderId);
        if (!reservation) return;

        await releaseReservation({
          userId,
          orderId,
        });
        return;
      }

      if (topic === 'order-finalized') {
        const { orderId, userId, closed } = event;
        if (!orderId || !userId || !closed) return;

        const processed = await markProcessed(`wallet:settlement:finalized:${orderId}`);
        if (!processed) return;

        const reservation = await getReservation(userId, orderId);
        if (!reservation) return;

        await releaseReservation({
          userId,
          orderId,
        });
      }
    },
  });
};
