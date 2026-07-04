import { Router } from 'express';
import {
  createDepositIntent,
  simulateCryptoDeposit,
  createWithdrawalIntent,
  getMyTransactions,
} from '../controllers/fundingController';
import { trustGateway } from '../middleware/trustgateway';

const router = Router();

router.post('/deposit/intent', trustGateway, createDepositIntent);
router.post('/deposit/simulate-crypto', trustGateway, simulateCryptoDeposit);
router.post('/withdraw/intent', trustGateway, createWithdrawalIntent);
router.get('/transactions', trustGateway, getMyTransactions);

export default router;