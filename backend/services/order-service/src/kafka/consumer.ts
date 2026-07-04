import { kafka } from './client';
import { db } from '../db';
import { trades, orders } from '../db/schema';
import { eq } from 'drizzle-orm';

const consumer = kafka.consumer({ groupId: 'order-service-history-group' });

export const startOrderConsumer = async () => {
  await consumer.connect();
  await consumer.subscribe({ topic: 'completed-trades', fromBeginning: true });
  await consumer.subscribe({ topic: 'order-finalized', fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return;
      const event = JSON.parse(message.value.toString());

      if (topic === 'order-finalized') {
        const { orderId, status, type, remainingAmount } = event;
        if (!orderId || !status) return;

        const [existingOrder] = await db
          .select()
          .from(orders)
          .where(eq(orders.id, orderId));

        if (!existingOrder) {
          return;
        }

        const isMarketOrder = String(type ?? existingOrder.type ?? 'LIMIT').toUpperCase() === 'MARKET';
        const nextAmount = isMarketOrder ? 0 : Math.max(Number(remainingAmount ?? 0), 0);
        const nextStatus = status === 'CANCELLED'
          ? 'CANCELLED'
          : isMarketOrder
            ? status
            : status;

        await db
          .update(orders)
          .set({
            status: nextStatus,
            amount: nextAmount.toString(),
          })
          .where(eq(orders.id, orderId));
        return;
      }

      const {
        tradeId,
        asset,
        price,
        amount,
        takerOrderId,
        makerOrderId,
        takerUserId,
        makerUserId,
        takerType,
        takerStatus,
        makerStatus,
        takerRemainingAmount,
        makerRemainingAmount,
      } = event;

      const [existingTrade] = await db
        .select({ id: trades.id })
        .from(trades)
        .where(eq(trades.tradeId, tradeId))
        .limit(1);

      if (existingTrade) {
        console.log(`[Order Service] Trade ${tradeId} already processed, skipping replay.`);
        return;
      }

      const [takerOrder] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, takerOrderId));

      const [makerOrder] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, makerOrderId));

      if (!takerOrder || !makerOrder) {
        console.warn(`
====================================================
Trade skipped
Trade ID : ${tradeId}
Maker ID : ${makerOrderId}
Taker ID : ${takerOrderId}
Reason   : Order not found
====================================================
`);

        return;
      }

      await db.transaction(async (tx) => {
        await tx.insert(trades).values([
          { tradeId, userId: takerUserId, orderId: takerOrderId, asset, side: takerOrder.side, role: 'TAKER', price: price.toString(), amount: amount.toString() },
          { tradeId, userId: makerUserId, orderId: makerOrderId, asset, side: makerOrder.side, role: 'MAKER', price: price.toString(), amount: amount.toString() }
        ]);

        const isMarketOrder = String(takerType ?? takerOrder.type ?? 'LIMIT').toUpperCase() === 'MARKET';
        const takerNextAmount = isMarketOrder
          ? 0
          : Number.isFinite(Number(takerRemainingAmount))
            ? Number(takerRemainingAmount)
            : Math.max(Number(takerOrder.amount) - Number(amount), 0);
        const makerNextAmount = Number.isFinite(Number(makerRemainingAmount))
          ? Number(makerRemainingAmount)
          : Math.max(Number(makerOrder.amount) - Number(amount), 0);

        await tx
          .update(orders)
          .set({
            status: takerStatus ?? (isMarketOrder ? (Number(takerRemainingAmount) > 0 ? 'PARTIAL' : 'FILLED') : (takerNextAmount > 0 ? 'PARTIAL' : 'FILLED')),
            amount: takerNextAmount.toString(),
          })
          .where(eq(orders.id, takerOrderId));

        await tx
          .update(orders)
          .set({
            status: makerStatus ?? (makerNextAmount > 0 ? 'PARTIAL' : 'FILLED'),
            amount: makerNextAmount.toString(),
          })
          .where(eq(orders.id, makerOrderId));
      });
      console.log(`[Order Service] Trade ${tradeId} recorded successfully.`);
    },
  });
};
