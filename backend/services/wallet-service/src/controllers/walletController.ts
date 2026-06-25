import { Response } from 'express';
import { redis } from '../config/redis'; 
import { GatewayRequest } from '../../../../shared';

export const getBalance = async (req: GatewayRequest, res: Response) => {
  try {
    const userId = req.userId;

    const balance = await redis.hgetall(`wallet:${userId}`);

    res.status(200).json({
      success: true,
      userId,
      balance: balance || {},
    });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};