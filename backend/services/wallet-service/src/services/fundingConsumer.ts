import { Kafka } from 'kafkajs';
import { redis } from '../config/redis';

const kafka = new Kafka({
  clientId: 'wallet-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'wallet-funding-group' });
const producer = kafka.producer(); 

export const startFundingConsumer = async () => {
  try {
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
          const redisKey = `wallet:${userId}`;
          const assetKey = asset.toUpperCase(); 

          const newBalance = await redis.hincrbyfloat(redisKey, assetKey, parseFloat(amount)); 
          console.log(`[Wallet Cache] Deposit ${eventId} applied. ${userId} new ${assetKey} balance: ${newBalance}`);
        }

        if (topic === 'withdrawal-requested') {
          const { transactionId, userId, asset, amount } = event;
          const redisKey = `wallet:${userId}`;
          const assetKey = asset.toUpperCase();

          console.log(` [Wallet] Validating withdrawal ${transactionId} for ${amount} ${assetKey}...`);
          
          const currentBalanceStr = await redis.hget(redisKey, assetKey); 
          const currentBalance = currentBalanceStr ? parseFloat(currentBalanceStr) : 0;
          const requestedAmount = parseFloat(amount);

          if (currentBalance >= requestedAmount) {
            const newBalance = await redis.hincrbyfloat(redisKey, assetKey, -requestedAmount); 
            console.log(`[Wallet] Funds locked. New balance: ${newBalance}. Approving.`);

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