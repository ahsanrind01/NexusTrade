import { Router } from 'express';
import { getBalance, getTransfers, portfolioHistory, reserveBalance, releaseBalance, transferFunds } from '../controllers/walletController';
import { trustGateway } from '../middleware/trustgateway';

const router = Router();

router.get('/balance', trustGateway, getBalance);
router.get('/transfers', trustGateway, getTransfers);
router.get('/portfolio-history', trustGateway, portfolioHistory);
router.post('/reserve', trustGateway, reserveBalance);
router.post('/release', trustGateway, releaseBalance);
router.post('/transfer', trustGateway, transferFunds);

export default router;
