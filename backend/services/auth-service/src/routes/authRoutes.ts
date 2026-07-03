import { Router } from 'express';
import {
  signup,
  login,
  getProfile,
  logout,
  updateProfile,
  changePassword,
  googleSignIn,
  sendPhoneOtp,
  verifyPhoneOtp,
} from '../controllers/authController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/google', googleSignIn);
router.get('/profile', authenticate, getProfile);
router.get('/profile/:userId', authenticate, getProfile);
router.post('/logout', authenticate, logout);
router.put('/profile/:userId', authenticate, updateProfile);
router.put('/change-password', authenticate, changePassword);
router.post('/phone/send-otp', authenticate, sendPhoneOtp);
router.post('/phone/verify', authenticate, verifyPhoneOtp);

export default router;
