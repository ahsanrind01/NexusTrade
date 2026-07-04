import { Kafka } from 'kafkajs';
import { db } from './db'; 
import { users, transactions, ledgerEntries } from './db/schema';
import { eq, and, sum } from 'drizzle-orm'; 
import { ensureKafkaTopics } from '../../../shared/src/kafka/bootstrapTopics';

const kafka = new Kafka({
  clientId: 'ledger-service',
  brokers: ['localhost:9092']
});

const consumer = kafka.consumer({ groupId: 'ledger-group' }); 
const producer = kafka.producer(); 

const computeWalletBalance = async (tx: any, userId: string, asset: string) => {
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
  return newBalance;
};

const run = async () => {
  await ensureKafkaTopics('ledger-service', [
    'completed-trades',
    'user-created',
    'deposit-cleared',
    'balance-updates',
  ]);
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
          const baseAsset = data.baseAsset ?? data.asset.replace(/USDT$/, '');
          const quoteAsset = data.quoteAsset ?? 'USDT';
          const baseAmount = Number(data.amount);
          const quoteAmount = Number(data.quoteAmount ?? Number(data.amount) * Number(data.price));
          const takerIsBuyer = data.takerSide === 'BUY';
          const takerBaseDirection = takerIsBuyer ? 'CREDIT' : 'DEBIT';
          const takerQuoteDirection = takerIsBuyer ? 'DEBIT' : 'CREDIT';
          const makerBaseDirection = takerIsBuyer ? 'DEBIT' : 'CREDIT';
          const makerQuoteDirection = takerIsBuyer ? 'CREDIT' : 'DEBIT';

          let balanceUpdates: Array<{ userId: string; asset: string; newBalance: number }> = [];

          await db.transaction(async (tx) => {
            const [trade] = await tx.insert(transactions).values({
              referenceId: data.tradeId,
              type: 'TRADE',
              status: 'COMPLETED',
            }).returning();
            await tx.insert(ledgerEntries).values([
              {
                transactionId: trade.id,
                userId: data.takerUserId,
                asset: baseAsset,
                amount: baseAmount.toString(),
                direction: takerBaseDirection,
              },
              {
                transactionId: trade.id,
                userId: data.takerUserId,
                asset: quoteAsset,
                amount: quoteAmount.toString(),
                direction: takerQuoteDirection,
              },
              {
                transactionId: trade.id,
                userId: data.makerUserId,
                asset: baseAsset,
                amount: baseAmount.toString(),
                direction: makerBaseDirection,
              },
              {
                transactionId: trade.id,
                userId: data.makerUserId,
                asset: quoteAsset,
                amount: quoteAmount.toString(),
                direction: makerQuoteDirection,
              },
            ]);
            console.log(`Trade ${trade.id} locked. Taker(${data.takerUserId}) ${takerBaseDirection}/${takerQuoteDirection}, Maker(${data.makerUserId}) ${makerBaseDirection}/${makerQuoteDirection}`);
            for (const userId of [data.takerUserId, data.makerUserId]) {
              balanceUpdates.push({
                userId,
                asset: baseAsset,
                newBalance: await computeWalletBalance(tx, userId, baseAsset),
              });
              balanceUpdates.push({
                userId,
                asset: quoteAsset,
                newBalance: await computeWalletBalance(tx, userId, quoteAsset),
              });
            }
          });

          for (const update of balanceUpdates) {
            await producer.send({
              topic: 'balance-updates',
              messages: [{
                value: JSON.stringify({
                  userId: update.userId,
                  asset: update.asset,
                  newBalance: update.newBalance,
                  timestamp: new Date().toISOString(),
                }),
              }],
            });
            console.log(`Balance broadcast refreshed for ${update.userId}: ${update.asset}`);
          }
        } catch (error) {
          console.error(`Failed to process trade:`, error);
        }
      }
    },
  });
};

run().catch(console.error);
