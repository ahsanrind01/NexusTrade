import { Router } from 'express';
import { cancelOrder, placeOrder, getMyOrders , getMyTrades } from '../controllers/orderController';
import { trustGateway } from '../middleware/trustgateway';

const router = Router();

router.post('/place',trustGateway, placeOrder);

router.get('/my-orders', trustGateway, getMyOrders);

router.get('/my-trades', trustGateway, getMyTrades);

router.delete('/:orderId', trustGateway, cancelOrder);

export default router;
