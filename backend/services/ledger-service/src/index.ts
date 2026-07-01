import { Kafka } from 'kafkajs';
import { db } from './db'; 
import { users, transactions, ledgerEntries } from './db/schema';
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
  await consumer.subscribe({ topic: 'user-created', fromBeginning: true });
  await consumer.subscribe({ topic: 'deposit-cleared', fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (!message.value) return;
      const data = JSON.parse(message.value.toString());

      if (topic === 'user-created') {
        const { userId, email } = data;
        await db.insert(users)
          .values({ id: userId, email })
          .onConflictDoNothing();
        console.log(`\nLedger: Registered new user ${userId}`);
        return; 
      }

      if (topic === 'deposit-cleared') {
        const { userId, asset, amount, eventId } = data;
        console.log(`\nLedger: Recording deposit ${eventId} for ${userId}...`);
        try {
          await db.transaction(async (tx) => {
            const [txRecord] = await tx.insert(transactions).values({
              referenceId: eventId,
              type: 'DEPOSIT',
              status: 'COMPLETED',
            }).returning();
            await tx.insert(ledgerEntries).values({
              transactionId: txRecord.id,
              userId: userId,
              asset: asset.toUpperCase(),
              amount: amount.toString(),
              direction: 'CREDIT',
            });
            console.log(`Ledger: Deposit ${eventId} recorded — CREDIT ${amount} ${asset} for ${userId}`);
          });
        } catch (error) {
          console.error(`Ledger: Failed to record deposit:`, error);
        }
        return;
      }

      if (topic === 'completed-trades') {
        console.log(`\nProcessing Trade Receipt ${data.tradeId}...`);
        try {
          await db.transaction(async (tx) => {
            const [trade] = await tx.insert(transactions).values({
              referenceId: data.tradeId,
              type: 'TRADE',
              status: 'COMPLETED',
            }).returning();
            const { takerUserId, makerUserId, asset, amount, takerSide } = data;
            const takerDirection = takerSide === 'BUY' ? 'CREDIT' : 'DEBIT';
            const makerDirection = takerSide === 'BUY' ? 'DEBIT' : 'CREDIT';
            await tx.insert(ledgerEntries).values([
              {
                transactionId: trade.id,
                userId: takerUserId,
                asset: asset,
                amount: amount.toString(),
                direction: takerDirection,
              },
              {
                transactionId: trade.id,
                userId: makerUserId,
                asset: asset,
                amount: amount.toString(),
                direction: makerDirection,
              }
            ]);
            console.log(`Trade ${trade.id} locked. Taker(${takerUserId}) ${takerDirection}, Maker(${makerUserId}) ${makerDirection}`);
            for (const userId of [takerUserId, makerUserId]) {
              const [creditResult] = await tx
                .select({ value: sum(ledgerEntries.amount) })
                .from(ledgerEntries)
                .where(and(
                  eq(ledgerEntries.userId, userId),
                  eq(ledgerEntries.asset, asset),
                  eq(ledgerEntries.direction, 'CREDIT')
                ));
              const [debitResult] = await tx
                .select({ value: sum(ledgerEntries.amount) })
                .from(ledgerEntries)
                .where(and(
                  eq(ledgerEntries.userId, userId),
                  eq(ledgerEntries.asset, asset),
                  eq(ledgerEntries.direction, 'DEBIT')
                ));
              const newBalance = Number(creditResult?.value || 0) - Number(debitResult?.value || 0);
              await producer.send({
                topic: 'balance-updates',
                messages: [{
                  value: JSON.stringify({
                    userId,
                    asset,
                    newBalance,
                    timestamp: new Date().toISOString()
                  }),
                }],
              });
              console.log(`Balance broadcast: ${userId} → ${newBalance} ${asset}`);
            }
          });
        } catch (error) {
          console.error(`Failed to process trade:`, error);
        }
      }
    },
  });
};

run().catch(console.error);
