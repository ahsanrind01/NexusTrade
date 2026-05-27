import { consumer } from '../config/kafka';
import { getIo } from '../sockets/io';

export const startMarketConsumer = async () => {
  await consumer.connect();
  console.log('Market Data subscribed to Kafka');
  
  await consumer.subscribe({ topic: 'completed-trades', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      
      const tradeData = JSON.parse(message.value.toString());
      console.log(`Broadcasting trade: ${tradeData.asset} @ $${tradeData.price}`);
      
      const io = getIo();
      io.emit('price-update', tradeData);
    },
  });
};