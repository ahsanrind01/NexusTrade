import { Kafka } from 'kafkajs';
import { redis } from '../config/redis';

const kafka = new Kafka({
  clientId: 'wallet-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'wallet-funding-group' });
const producer = kafka.producer(); // NEW: The Wallet needs to talk back now!

export const startFundingConsumer = async () => {
  try {
    await producer.connect();
    await consumer.connect();
    
    // Subscribe to both the Deposit and Withdrawal topics
    await consumer.subscribe({ topic: 'deposit-cleared', fromBeginning: true });
    await consumer.subscribe({ topic: 'withdrawal-requested', fromBeginning: true });

    console.log('📥 [Wallet Service] Listening for deposits and withdrawal requests...');

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (!message.value) return;
        const event = JSON.parse(message.value.toString());

        // ==========================================
        // ROUTE 1: HANDLE INCOMING DEPOSITS
        // ==========================================
        if (topic === 'deposit-cleared') {
          const { userId, asset, amount, eventId } = event;
          const redisKey = `wallet:${userId}:${asset}:balance`;
          
          const newBalance = await redis.incrbyfloat(redisKey, parseFloat(amount));
          console.log(`✅ [Wallet Cache] Deposit ${eventId} applied. ${userId} new ${asset} balance: ${newBalance}`);
        }

        // ==========================================
        // ROUTE 2: HANDLE OUTGOING WITHDRAWALS
        // ==========================================
        if (topic === 'withdrawal-requested') {
          const { transactionId, userId, asset, amount } = event;
          console.log(`⚖️ [Wallet] Validating withdrawal ${transactionId} for ${amount} ${asset}...`);

          const redisKey = `wallet:${userId}:${asset}:balance`;
          
          // 1. Check current balance
          const currentBalanceStr = await redis.get(redisKey);
          const currentBalance = currentBalanceStr ? parseFloat(currentBalanceStr) : 0;
          const requestedAmount = parseFloat(amount);

          // 2. Make the decision
          if (currentBalance >= requestedAmount) {
            // SUCCESS: Deduct the balance instantly to prevent double-spending
            const newBalance = await redis.incrbyfloat(redisKey, -requestedAmount);
            console.log(`🔓 [Wallet] Funds locked. New balance: ${newBalance}. Approving.`);

            // Tell the Funding Service to send the real money
            await producer.send({
              topic: 'withdrawal-validated',
              messages: [{ value: JSON.stringify({ transactionId, userId, asset, amount, status: 'APPROVED' }) }]
            });
          } else {
            // FAIL: User doesn't have enough money
            console.log(`❌ [Wallet] Insufficient funds (${currentBalance} < ${requestedAmount}). Rejecting.`);

            // Tell the Funding Service to cancel the transaction
            await producer.send({
              topic: 'withdrawal-rejected',
              messages: [{ value: JSON.stringify({ transactionId, userId, asset, amount, status: 'REJECTED', reason: 'INSUFFICIENT_FUNDS' }) }]
            });
          }
        }
      },
    });
  } catch (error) {
    console.error('❌ [Wallet Consumer] Error running Kafka consumer:', error);
  }
};