import { Router } from 'express';
import { signup, login, getProfile, updateProfile } from '../controllers/authController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.post('/signup', signup);
router.post('/login', login);
router.get('/profile/:userId', authenticate, getProfile);
router.put('/profile/:userId', authenticate, updateProfile);

export default router;
