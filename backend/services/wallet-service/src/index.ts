import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import walletRoutes from './routes/walletRoutes';
import { startBalanceConsumer } from './services/balanceConsumer';
import { startFundingConsumer } from './services/fundingConsumer';
import { startOrderSettlementConsumer } from './services/orderSettlementConsumer';
import { warmUpCache } from './cache/warmUpCache';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/wallet', walletRoutes);

const start = async () => {
  await warmUpCache();           
  await startBalanceConsumer();  
  await startFundingConsumer();
  await startOrderSettlementConsumer();

  app.listen(3004, () => {
    console.log('Wallet Query Service running on port 3004');
  });
};

start().catch(console.error);
