import { Response } from 'express';
import { producer } from '../kafka/client';
import { GatewayRequest } from '../../../../shared';
import { db } from '../db';
import { orders } from '../db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { trades } from '../db/schema'; 


export const placeOrder = async (req: GatewayRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { asset, amount, price, side } = req.body;

    if (!userId || !asset || !amount || !price || !side) {
      res.status(400).json({ error: 'Missing required order fields' });
      return;
    }

    const [savedOrder] = await db.insert(orders).values({
      userId,
      asset,
      side,
      price: price.toString(),
      amount: amount.toString(),
      status: 'PENDING',
    }).returning();

    await producer.send({
      topic: 'pending-orders',
      messages: [{
        key: userId,
        value: JSON.stringify({
          orderId: savedOrder.id,  
          userId,
          asset,
          amount: Number(amount),
          price: Number(price),
          side,
          timestamp: new Date().toISOString(),
        }),
      }],
    });

    res.status(201).json({ success: true, orderId: savedOrder.id }); 
  } catch (error) {
    console.error('Place order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMyOrders = async (req: GatewayRequest, res: Response) => {
  try {
    const myOrders = await db
      .select()
      .from(orders)           
      .where(eq(orders.userId, req.userId!))
      .orderBy(desc(orders.createdAt));

    res.json({ success: true, orders: myOrders });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMyTrades = async (req: GatewayRequest, res: Response) => {
  const userId = req.userId;
  const userTrades = await db.select().from(trades).where(eq(trades.userId, userId!)).orderBy(desc(trades.createdAt));
  res.json({ success: true, trades: userTrades });
};

export const cancelOrder = async (req: GatewayRequest, res: Response) => {
  try {
    const userId = req.userId;
    const orderIdParam = req.params.orderId;
    const orderId = Array.isArray(orderIdParam) ? orderIdParam[0] : orderIdParam;

    if (!userId || !orderId) {
      res.status(400).json({ success: false, error: 'Missing order id' });
      return;
    }

    const [existingOrder] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)));

    if (!existingOrder) {
      res.status(404).json({ success: false, error: 'Order not found' });
      return;
    }

    if (existingOrder.status === 'FILLED' || existingOrder.status === 'CANCELLED') {
      res.status(400).json({ success: false, error: `Order is already ${existingOrder.status}` });
      return;
    }

    const [cancelledOrder] = await db
      .update(orders)
      .set({ status: 'CANCELLED' })
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
      .returning();

    await producer.send({
      topic: 'cancelled-orders',
      messages: [{
        key: userId,
        value: JSON.stringify({
          orderId: cancelledOrder.id,
          userId,
          asset: cancelledOrder.asset,
          side: cancelledOrder.side,
          timestamp: new Date().toISOString(),
        }),
      }],
    });

    res.json({ success: true, order: cancelledOrder });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
