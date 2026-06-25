import { Request, Response, NextFunction } from 'express';

export interface GatewayRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export const trustGateway = (req: GatewayRequest, res: Response, next: NextFunction) => {
  const userId = req.headers['x-user-id'] as string;
  const userEmail = req.headers['x-user-email'] as string;

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  req.userId = userId;
  req.userEmail = userEmail;
  return next();
};