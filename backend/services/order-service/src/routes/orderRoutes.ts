import { Router } from 'express';
import { placeOrder, getMyOrders , getMyTrades } from '../controllers/orderController';
import { trustGateway } from '../middleware/trustgateway';

const router = Router();

router.post('/place',trustGateway, placeOrder);

router.get('/my-orders', trustGateway, getMyOrders);

router.get('/my-trades', trustGateway, getMyTrades);

export default router;