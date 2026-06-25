import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDB } from './config/db';
import { connectAuthProducer } from './config/kafka';
import authRoutes from './routes/authRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3006;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'Auth Service is healthy' });
});

const start = async () => {
  await initDB();
  await connectAuthProducer();
  app.listen(PORT, () => {
    console.log(`Auth Service running on http://localhost:${PORT}`);
  });
};

start().catch(console.error);
