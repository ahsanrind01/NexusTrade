import { Router } from 'express';
import { placeOrder, getMyOrders } from '../controllers/orderController';
import { trustGateway } from '../middleware/trustgateway';

const router = Router();

router.post('/place',trustGateway, placeOrder);

router.get('/my-orders', trustGateway, getMyOrders);

export default router;