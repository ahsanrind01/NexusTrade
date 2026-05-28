import { consumer, connectKafka } from './config/kafka';
import './config/redis'; 
import { processNewOrder } from './services/matchingService';

const run = async () => {
  await connectKafka();

  await consumer.subscribe({ topic: 'pending-orders', fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;

      const order = JSON.parse(message.value.toString());
      console.log(`\nMatching Engine caught: ${order.side} ${order.amount} ${order.asset} @ $${order.price}`);
      
      try {
        await processNewOrder(order);
      } catch (error) {
        console.error('Error processing order:', error);
      }
    },
  });
};

run().catch(console.error);