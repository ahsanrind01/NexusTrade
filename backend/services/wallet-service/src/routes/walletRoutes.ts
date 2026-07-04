import { Router } from 'express';
import { getBalance, getTransfers, reserveBalance, releaseBalance, syncTotalBalance, transferFunds } from '../controllers/walletController';
import { trustGateway } from '../middleware/trustgateway';

const router = Router();

router.get('/balance', trustGateway, getBalance);
router.get('/transfers', trustGateway, getTransfers);
router.post('/reserve', trustGateway, reserveBalance);
router.post('/release', trustGateway, releaseBalance);
router.post('/transfer', trustGateway, transferFunds);
router.post('/sync-total', trustGateway, syncTotalBalance);

export default router;
