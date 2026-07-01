import { kafka } from './client';
import { db } from '../db';
import { trades, orders } from '../db/schema';
import { eq } from 'drizzle-orm';

const consumer = kafka.consumer({ groupId: 'order-service-history-group' });

export const startOrderConsumer = async () => {
  await consumer.connect();
  await consumer.subscribe({ topic: 'completed-trades', fromBeginning: true });
  
  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      const tradeData = JSON.parse(message.value.toString());
      const { tradeId, asset, price, amount, takerOrderId, makerOrderId, takerUserId, makerUserId } = tradeData;
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

  // Skip this bad message
  return;
}

      // 2. Insert Trade History
      await db.transaction(async (tx) => {
        await tx.insert(trades).values([
          { tradeId, userId: takerUserId, orderId: takerOrderId, asset, side: takerOrder.side, role: 'TAKER', price: price.toString(), amount: amount.toString() },
          { tradeId, userId: makerUserId, orderId: makerOrderId, asset, side: makerOrder.side, role: 'MAKER', price: price.toString(), amount: amount.toString() }
        ]);

        await tx.update(orders).set({ status: 'FILLED' }).where(eq(orders.id, takerOrderId));
        await tx.update(orders).set({ status: 'FILLED' }).where(eq(orders.id, makerOrderId));
      });
      console.log(`[Order Service] Trade ${tradeId} recorded successfully.`);
    },
  });
};