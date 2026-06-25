import { Router, Request, Response, NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { authenticate, AuthRequest } from '../middleware/authenticate';

const router = Router();

const injectUser = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.userId) {
    req.headers['x-user-id'] = req.userId;
    req.headers['x-user-email'] = req.userEmail || '';
  }
  next();
};

const authProxy = createProxyMiddleware({
  target: 'http://localhost:3007',
  changeOrigin: true,
});

router.use('/auth', (req: Request, res: Response, next: NextFunction) => {
  req.url = '/api/auth' + req.url;
  authProxy(req, res, next);
});

const ordersProxy = createProxyMiddleware({
  target: 'http://localhost:3001',
  changeOrigin: true,
});

router.use(
  '/orders',
  authenticate,
  injectUser,
  (req: AuthRequest, res: Response, next: NextFunction) => {
    req.url = '/api/orders' + req.url;
    ordersProxy(req, res, next);
  }
);

const walletProxy = createProxyMiddleware({
  target: 'http://localhost:3004',
  changeOrigin: true,
});

router.use(
  '/wallet',
  authenticate,
  injectUser,
  (req: AuthRequest, res: Response, next: NextFunction) => {
    req.url = '/api/wallet' + req.url;
    walletProxy(req, res, next);
  }
);

const fundingProxy = createProxyMiddleware({
  target: 'http://localhost:3005',
  changeOrigin: true,
});

router.use(
  '/funding',
  authenticate,
  injectUser,
  (req: AuthRequest, res: Response, next: NextFunction) => {
    req.url = '/api/funding' + req.url;
    fundingProxy(req, res, next);
  }
);

router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'API Gateway is healthy' });
});

export default router;