import { consumer, connectKafka } from './config/kafka';
import './config/redis'; 
import { processCancelledOrder, processNewOrder } from './services/matchingService';

const run = async () => {
  await connectKafka();

  await consumer.subscribe({ topic: 'pending-orders', fromBeginning: true });
  await consumer.subscribe({ topic: 'cancelled-orders', fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return;

      try {
        const order = JSON.parse(message.value.toString());

        if (topic === 'pending-orders') {
          console.log(`\nMatching Engine caught: ${order.side} ${order.amount} ${order.asset} @ $${order.price}`);
          await processNewOrder(order);
          return;
        }

        if (topic === 'cancelled-orders') {
          console.log(`\nMatching Engine caught cancellation: ${order.orderId}`);
          await processCancelledOrder(order);
        }
      } catch (error) {
        console.error('Error processing matching-engine event:', error);
      }
    },
  });
};

run().catch(console.error);
