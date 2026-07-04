import { consumer } from '../config/kafka';
import { adjustTotalBalance } from './walletState';
import { ensureKafkaTopics } from '../../../../shared/src/kafka/bootstrapTopics';

export const startBalanceConsumer = async () => {
  await ensureKafkaTopics('wallet-service', ['balance-updates']);
  await consumer.connect();
  await consumer.subscribe({ topic: 'balance-updates', fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      const { userId, asset, newBalance } = JSON.parse(message.value.toString());

      await adjustTotalBalance(userId, asset, Number(newBalance));
      console.log(`Wallet Cache Updated for User ${userId}: ${asset} = ${newBalance}`);
    },
  });
};
