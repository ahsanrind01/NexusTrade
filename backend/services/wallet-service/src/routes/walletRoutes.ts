import { Router } from 'express';
import { getBalance } from '../controllers/walletController';
import { trustGateway } from '../middleware/trustgateway';

const router = Router();

router.get('/balance', trustGateway, getBalance);

export default router;
