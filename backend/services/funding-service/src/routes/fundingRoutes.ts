import { Router } from 'express';
import { createDepositIntent, simulateCryptoDeposit, createWithdrawalIntent } from '../controllers/fundingController';
import { handleStripeWebhook } from '../controllers/webhookController';
import { trustGateway } from '../middleware/trustgateway';

const router = Router();

router.post('/deposit/intent', trustGateway, createDepositIntent);
router.post('/deposit/simulate-crypto', trustGateway, simulateCryptoDeposit);
router.post('/withdraw/intent', trustGateway, createWithdrawalIntent);
router.post('/stripe-webhook', handleStripeWebhook);

export default router;
