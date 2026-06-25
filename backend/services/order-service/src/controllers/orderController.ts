import { Response } from 'express';
import crypto from 'crypto';
import { producer } from '../kafka/client';
import { GatewayRequest } from '../../../../shared';

export const placeOrder = async (req: GatewayRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { asset, amount, price, side } = req.body;

    if (!userId || !asset || !amount || !price || !side) {
      res.status(400).json({ error: 'Missing required order fields' });
      return;
    }

    const orderPayload = {
      orderId: crypto.randomUUID(),
      userId,
      asset,
      amount: Number(amount),
      price: Number(price),
      side,
      timestamp: new Date().toISOString(),
    };

    await producer.send({
      topic: 'pending-orders',
      messages: [{ key: userId, value: JSON.stringify(orderPayload) }],
    });

    res.status(201).json({ success: true, orderId: orderPayload.orderId });
  } catch (error) {
    console.error('Place order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
