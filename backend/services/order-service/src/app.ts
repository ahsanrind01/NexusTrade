import express from 'express';
import orderRoutes from './routes/orderRoutes';
import { connectProducer } from './kafka/client'; 

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use('/api/orders', orderRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'Order Service is healthy' });
});

connectProducer().then(() => {
  app.listen(PORT, () => {
    console.log(`Order Service running on http://localhost:${PORT}`);
  });
});