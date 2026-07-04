import express from 'express';
import orderRoutes from './routes/orderRoutes';
import { connectProducer } from './kafka/client'; 
import { startOrderConsumer } from './kafka/consumer'; 
import { ensureKafkaTopics } from '../../../shared/src/kafka/bootstrapTopics';

const app = express();
const PORT = process.env.PORT || 3001;
const ORDER_SERVICE_TOPICS = ['completed-trades', 'order-finalized'];

app.use(express.json());
app.use('/api/orders', orderRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'Order Service is healthy' });
});

connectProducer().then(async () => {
  await ensureKafkaTopics('order-service', ORDER_SERVICE_TOPICS);
  await startOrderConsumer(); 
  app.listen(PORT, () => console.log(`Order Service running on port ${PORT}`));
});
