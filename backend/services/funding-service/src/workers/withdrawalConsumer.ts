import { Kafka } from 'kafkajs';
import { db } from '../config/db';
import { fundingTransactions } from '../db/schema';
import { eq } from 'drizzle-orm';

const kafka = new Kafka({
  clientId: 'funding-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'funding-withdrawal-group' });

export const startWithdrawalConsumer = async () => {
  try {
    await consumer.connect();
    
    await consumer.subscribe({ topic: 'withdrawal-validated', fromBeginning: true });
    await consumer.subscribe({ topic: 'withdrawal-rejected', fromBeginning: true });

    console.log('[Funding Service] Listening for wallet validations...');

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (!message.value) return;
        const event = JSON.parse(message.value.toString());

        const { transactionId, amount, asset, reason } = event;

        // WALLET APPROVED THE WITHDRAWAL

        if (topic === 'withdrawal-validated') {
          console.log(`[Funding] Withdrawal ${transactionId} APPROVED by Wallet. Processing external transfer for ${amount} ${asset}...`);

          // IN PRODUCTION: 
          //  Stripe Payout API 
          // ethers.js to send ETH to the user's destinationAddress.

          await db.update(fundingTransactions)
            .set({ 
              status: 'COMPLETED', 
              updatedAt: new Date() 
            })
            .where(eq(fundingTransactions.id, transactionId));

          console.log(`[Funding] Funds sent! Transaction ${transactionId} marked as COMPLETED.`);
        }


        //  WALLET REJECTED THE WITHDRAWAL
 
        if (topic === 'withdrawal-rejected') {
          console.log(`[Funding] Withdrawal ${transactionId} REJECTED by Wallet. Reason: ${reason}`);

          await db.update(fundingTransactions)
            .set({ 
              status: 'FAILED', 
              updatedAt: new Date() 
            })
            .where(eq(fundingTransactions.id, transactionId));

          console.log(`[Funding] Transaction ${transactionId} marked as FAILED.`);
        }
      },
    });
  } catch (error) {
    console.error('[Funding Consumer] Error running Kafka consumer:', error);
  }
};