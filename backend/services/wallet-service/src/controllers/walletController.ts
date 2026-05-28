import { Request, Response } from 'express';
import { redis } from '../config/redis';

export const getBalance = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params; 
    const redisKey = `wallet:${userId}`;
    
    const balances = await redis.hgetall(redisKey);
    
    res.status(200).json({ success: true, balances });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};