import { Router } from 'express';
import { cancelOrder, placeOrder, getMyOrders, getMyTrades, getOrderBook } from '../controllers/orderController';
import { trustGateway } from '../middleware/trustgateway';

const router = Router();

router.post('/place',trustGateway, placeOrder);

router.get('/my-orders', trustGateway, getMyOrders);

router.get('/my-trades', trustGateway, getMyTrades);

router.get('/orderbook/:asset', trustGateway, getOrderBook);

router.delete('/:orderId', trustGateway, cancelOrder);

export default router;
