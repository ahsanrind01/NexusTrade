import { consumer } from '../config/kafka';
import { redis } from '../config/redis';

export const startBalanceConsumer = async () => {
  await consumer.connect();
  await consumer.subscribe({ topic: 'balance-updates', fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      const { userId, asset, newBalance } = JSON.parse(message.value.toString());
      
      const redisKey = `wallet:${userId}`;
      await redis.hset(redisKey, asset.toUpperCase(), newBalance);
      console.log(`Wallet Cache Updated for User ${userId}: ${asset} = ${newBalance}`);
    },
  });
};