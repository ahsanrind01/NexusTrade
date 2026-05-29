import express from 'express';
import dotenv from 'dotenv';
import fundingRoutes from './routes/fundingRoutes';
import { startWithdrawalConsumer } from './workers/withdrawalConsumer';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3005;

app.use(express.json());

app.use('/api/funding', fundingRoutes);

startWithdrawalConsumer();

app.listen(PORT, () => {
  console.log(`Funding Service running on http://localhost:${PORT}`);
});