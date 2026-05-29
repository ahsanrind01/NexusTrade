import express from 'express';
import cors from 'cors';
import walletRoutes from './routes/walletRoutes';
import { startBalanceConsumer } from './services/balanceConsumer';
import { startFundingConsumer } from './services/fundingConsumer';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/wallet', walletRoutes);

startBalanceConsumer().catch(console.error);

startFundingConsumer();

const PORT = 3004;
app.listen(PORT, () => {
  console.log(`Wallet Query Service running on port ${PORT}`);
});