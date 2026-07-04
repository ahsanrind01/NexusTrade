import { Response } from 'express';
import { producer } from '../kafka/client';
import { GatewayRequest } from '../../../../shared';
import { db } from '../db';
import { orders } from '../db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { trades } from '../db/schema'; 
import redis from '../config/redis';
import { randomUUID } from 'crypto';
import { releaseWalletFunds, reserveWalletFunds } from '../config/walletClient';

const assetPairToBaseQuote = (asset: string) => {
  if (asset.endsWith('USDT')) {
    return { baseAsset: asset.slice(0, -4), quoteAsset: 'USDT' };
  }

  return { baseAsset: asset, quoteAsset: 'USDT' };
};

const aggregateLevels = (rows: Array<{ price: string | number; amount: string | number }>) => {
  const levels = new Map<number, number>();

  for (const row of rows) {
    const price = Number(row.price);
    const amount = Number(row.amount);
    if (!Number.isFinite(price) || !Number.isFinite(amount)) continue;
    levels.set(price, (levels.get(price) ?? 0) + amount);
  }

  return [...levels.entries()]
    .map(([price, amount]) => ({ price, amount }))
    .sort((a, b) => a.price - b.price);
};


export const placeOrder = async (req: GatewayRequest, res: Response) => {
  try {
    const userId = req.userId;
    const userEmail = req.userEmail;
    const { asset, amount, price, side, type = 'LIMIT' } = req.body;

    if (!userId || !asset || !amount || !side) {
      res.status(400).json({ error: 'Missing required order fields' });
      return;
    }

    if (Number(amount) <= 0) {
      res.status(400).json({ error: 'Order amount must be positive' });
      return;
    }

    if (type !== 'LIMIT' && type !== 'MARKET') {
      res.status(400).json({ error: 'Invalid order type' });
      return;
    }

    if (type === 'LIMIT' && (!price || Number(price) <= 0)) {
      res.status(400).json({ error: 'Limit orders require a valid price' });
      return;
    }

    const orderPrice = price ?? 0;
    const orderId = randomUUID();
    const normalizedType = String(type).toUpperCase();
    const reservationAsset = side === 'BUY' ? assetPairToBaseQuote(asset).quoteAsset : assetPairToBaseQuote(asset).baseAsset;
    const reservationAmount = side === 'BUY'
      ? Number(orderPrice) * Number(amount)
      : Number(amount);

    if (!Number.isFinite(reservationAmount) || reservationAmount <= 0) {
      res.status(400).json({ error: 'Unable to reserve a valid balance for this order' });
      return;
    }

    const reservationResult = await reserveWalletFunds({
      userId,
      userEmail,
      orderId,
      asset: reservationAsset,
      amount: reservationAmount,
      side,
    });

    if (!reservationResult.success) {
      res.status(400).json({ error: 'Insufficient available balance' });
      return;
    }

    let savedOrder;
    try {
      [savedOrder] = await db.insert(orders).values({
        id: orderId,
        userId,
        asset,
        side,
        type: normalizedType as 'LIMIT' | 'MARKET',
        price: orderPrice.toString(),
        amount: amount.toString(),
        status: 'PENDING',
      }).returning();
    } catch (insertError) {
      await releaseWalletFunds({
        userId,
        userEmail,
        orderId,
      });
      throw insertError;
    }

    try {
      await producer.send({
        topic: 'pending-orders',
        messages: [{
          key: userId,
          value: JSON.stringify({
            orderId: savedOrder.id,
            userId,
            asset,
            amount: Number(amount),
            price: Number(orderPrice),
            side,
            type: normalizedType,
            baseAsset: assetPairToBaseQuote(asset).baseAsset,
            quoteAsset: assetPairToBaseQuote(asset).quoteAsset,
            timestamp: new Date().toISOString(),
          }),
        }],
      });
    } catch (publishError) {
      await db.update(orders).set({ status: 'CANCELLED' }).where(eq(orders.id, savedOrder.id));
      await releaseWalletFunds({
        userId,
        userEmail,
        orderId: savedOrder.id,
      });
      throw publishError;
    }

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

export const getOrderBook = async (req: GatewayRequest, res: Response) => {
  try {
    const assetParam = req.params.asset;
    const asset = Array.isArray(assetParam) ? assetParam[0] : assetParam;

    if (!asset) {
      res.status(400).json({ success: false, error: 'Missing asset symbol' });
      return;
    }

    const [rawAsks, rawBids] = await Promise.all([
      redis.zrange(`orderbook:${asset}:SELL`, 0, -1),
      redis.zrevrange(`orderbook:${asset}:BUY`, 0, -1),
    ]);

    const parseOrders = (rows: string[]) =>
      rows
        .map((entry) => {
          try {
            return JSON.parse(entry);
          } catch {
            return null;
          }
        })
        .filter(Boolean) as Array<{ price: string | number; amount: string | number }>;

    const asks = aggregateLevels(parseOrders(rawAsks));
    const bids = aggregateLevels(parseOrders(rawBids)).reverse();

    res.json({ success: true, asks, bids });
  } catch (error) {
    console.error('Get order book error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
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

    if (Number(existingOrder.amount) <= 0) {
      res.status(400).json({ success: false, error: 'Order has no remaining quantity to cancel' });
      return;
    }

    const [cancelledOrder] = await db
      .update(orders)
      .set({ status: 'CANCELLED' })
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
      .returning();

    await releaseWalletFunds({
      userId,
      userEmail: req.userEmail,
      orderId: cancelledOrder.id,
    });

    await producer.send({
      topic: 'cancelled-orders',
      messages: [{
        key: userId,
        value: JSON.stringify({
          orderId: cancelledOrder.id,
          userId,
          asset: cancelledOrder.asset,
          side: cancelledOrder.side,
          type: cancelledOrder.type,
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
