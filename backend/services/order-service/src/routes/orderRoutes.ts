import { Router } from 'express';
import { placeOrder } from '../controllers/orderController';
import { trustGateway } from '../middleware/trustgateway';

const router = Router();

router.post('/place',trustGateway, placeOrder);

export default router;