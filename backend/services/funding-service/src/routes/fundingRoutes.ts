// Add simulateCryptoDeposit to your imports from the controller
import { Router } from 'express'; // <-- This was missing!
import { createDepositIntent, simulateCryptoDeposit, createWithdrawalIntent } from '../controllers/fundingController';
import { handleStripeWebhook } from '../controllers/webhookController';

const router = Router();

router.post('/deposit/intent', createDepositIntent);
router.post('/stripe-webhook', handleStripeWebhook);
router.post('/deposit/simulate-crypto', simulateCryptoDeposit);
router.post('/withdraw/intent', createWithdrawalIntent);

export default router;