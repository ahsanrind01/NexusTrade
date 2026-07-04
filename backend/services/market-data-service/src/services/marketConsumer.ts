import { consumer } from '../config/kafka';
import { getIo } from '../sockets/io';
import { ensureKafkaTopics } from '../../../../shared/src/kafka/bootstrapTopics';

export const startMarketConsumer = async () => {
  await ensureKafkaTopics('market-data-service', ['completed-trades']);
  await consumer.connect();
  console.log('Market Data subscribed to Kafka');
  
  await consumer.subscribe({ topic: 'completed-trades', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      
      const tradeData = JSON.parse(message.value.toString());
      console.log(`Broadcasting trade: ${tradeData.asset} @ $${tradeData.price}`);
      
      const io = getIo();
      io.emit('global-price-update', {
        asset: tradeData.asset,
        price: Number(tradeData.price),
        amount: Number(tradeData.amount),
        timestamp: tradeData.timestamp,
      });
    },
  });
};
