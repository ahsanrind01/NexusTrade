import { Kafka } from 'kafkajs';
import { db } from './db'; 
import { transactions, ledgerEntries } from './db/schema';
import { eq, and, sum } from 'drizzle-orm'; 

const kafka = new Kafka({
  clientId: 'ledger-service',
  brokers: ['localhost:9092']
});

const consumer = kafka.consumer({ groupId: 'ledger-group' }); 
const producer = kafka.producer(); 

const run = async () => {
  await consumer.connect();
  await producer.connect(); 
  console.log('Ledger Service connected to Kafka Consumer & Producer');

  await consumer.subscribe({ topic: 'completed-trades', fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (!message.value) return;

      const tradeData = JSON.parse(message.value.toString());
      console.log(`\nProcessing Trade Receipt ${tradeData.tradeId}...`);

      try {
        await db.transaction(async (tx) => {
          
          const [trade] = await tx.insert(transactions).values({
            referenceId: tradeData.tradeId, 
            type: 'TRADE',
            status: 'COMPLETED',
          }).returning();

          const userId = tradeData.takerUserId;
          
          await tx.insert(ledgerEntries).values([
            {
              transactionId: trade.id,
              userId: userId,
              asset: tradeData.asset,
              amount: tradeData.amount.toString(),
              direction: 'CREDIT', 
            }
          ]);

          console.log(`Trade ${trade.id} safely locked in PostgreSQL!`);

          // THE STATE CALCULATION (CQRS) ---
          
          const [creditResult] = await tx
            .select({ value: sum(ledgerEntries.amount) })
            .from(ledgerEntries)
            .where(and(
              eq(ledgerEntries.userId, userId),
              eq(ledgerEntries.asset, tradeData.asset),
              eq(ledgerEntries.direction, 'CREDIT')
            ));

          const [debitResult] = await tx
            .select({ value: sum(ledgerEntries.amount) })
            .from(ledgerEntries)
            .where(and(
              eq(ledgerEntries.userId, userId),
              eq(ledgerEntries.asset, tradeData.asset),
              eq(ledgerEntries.direction, 'DEBIT')
            ));

          const totalCredits = Number(creditResult?.value || 0);
          const totalDebits = Number(debitResult?.value || 0);
          const newBalance = totalCredits - totalDebits;

          //  THE BROADCAST ---
          
          await producer.send({
            topic: 'balance-updates',
            messages: [{
              value: JSON.stringify({
                userId: userId,
                asset: tradeData.asset,
                newBalance: newBalance,
                timestamp: new Date().toISOString()
              }),
            }],
          });
          
          console.log(`Broadcasted updated balance to Wallet Service: ${newBalance} ${tradeData.asset}`);
        });

      } catch (error) {
        console.error(`Failed to process trade:`, error);
      }
    },
  });
};

run().catch(console.error);