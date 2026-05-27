import { Kafka } from 'kafkajs';
import { db } from './db'; 
import { transactions, ledgerEntries } from './db/schema';

const kafka = new Kafka({
  clientId: 'ledger-service',
  brokers: ['localhost:9092']
});


const consumer = kafka.consumer({ groupId: 'ledger-group' }); 

const run = async () => {
  await consumer.connect();
  console.log(' Ledger Service connected to Kafka Consumer');

  await consumer.subscribe({ topic: 'pending-orders', fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (!message.value) return;

      const order = JSON.parse(message.value.toString());
      console.log(`Processing order ${order.orderId} for User ${order.userId}...`);

      try {
        await db.transaction(async (tx) => {
          
          const [trade] = await tx.insert(transactions).values({
            referenceId: order.orderId, 
            type: 'TRADE',
            status: 'COMPLETED',
          }).returning();

          await tx.insert(ledgerEntries).values([
            {
              transactionId: trade.id,
              userId: order.userId,
              asset: order.asset,
              amount: order.amount.toString(),
              direction: order.side === 'BUY' ? 'CREDIT' : 'DEBIT',
            }
          ]);

          console.log(`Trade ${trade.id} safely locked in PostgreSQL!`);
        });

      } catch (error) {
        console.error(` Failed to process order ${order.orderId}:`, error);
      }
    },
  });
};

run().catch(console.error);