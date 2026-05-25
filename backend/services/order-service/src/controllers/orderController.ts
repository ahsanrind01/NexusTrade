import { Request, Response } from 'express';
import crypto from 'crypto';
import { producer } from '../kafka/client';

export const placeOrder = async (req: Request, res: Response) => {
  try {
    const { userId, asset, amount, price, side } = req.body;

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
      messages: [
        { 
          key: userId, 
          value: JSON.stringify(orderPayload) 
        },
      ],
    });

    console.log(`Order ${orderPayload.orderId} published to Kafka`);

    res.status(202).json({ 
      message: 'Order received and queued for matching',
      orderId: orderPayload.orderId 
    });

  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};