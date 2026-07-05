import { randomInt } from 'crypto';
import bcrypt from 'bcrypt';
import { and, desc, eq } from 'drizzle-orm';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authenticate';
import { db } from '../config/db';
import { emitUserCreatedEvent } from '../config/kafka';
import { phoneVerificationCodes, users } from '../db/schema';
import {
  isLikelyGoogleIdToken,
  isStrongPassword,
  isValidEmail,
  isValidPhoneNumber,
  normalizeEmail,
  normalizePhoneNumber,
} from '../utils/validation';

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secure_jwt_secret_key_here';
const GOOGLE_CLIENT_IDS = Array.from(
  new Set(
    [
      process.env.GOOGLE_CLIENT_ID,
      ...(process.env.GOOGLE_CLIENT_IDS ? process.env.GOOGLE_CLIENT_IDS.split(',') : []),
    ]
      .map(value => value?.trim())
      .filter((value): value is string => Boolean(value))
  )
);
const googleClient = new OAuth2Client();
const PASSWORD_HASH_ROUNDS = 10;
const OTP_HASH_ROUNDS = 10;
const OTP_TTL_MS = 5 * 60 * 1000;
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

type UserRow = {
  id: string;
  name: string;
  email: string;
};

type ProfileUserRow = {
  id: string;
  name: string;
  email: string;
  provider: string;
  profileImage: string | null;
  phoneNumber: string | null;
  phoneVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const buildAuthResponse = (user: UserRow) => ({
  success: true,
  token: jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' }),
  user: {
    id: user.id,
    name: user.name,
    email: user.email,
  },
});

const revokeSession = async (_req: AuthRequest) => {
  // JWT-only auth has nothing to revoke today.
  // Keep this hook so refresh-token/session invalidation can be added later
  // without changing the logout route contract.
};

const getRequestedName = (name: unknown, fallbackEmail: string) => {
  if (typeof name === 'string' && name.trim()) {
    return name.trim();
  }

  return fallbackEmail.split('@')[0] || 'User';
};

const validateCommonEmail = (email: unknown) => {
  if (typeof email !== 'string' || !email.trim()) {
    return null;
  }

  const normalizedEmail = normalizeEmail(email);

  if (!isValidEmail(normalizedEmail)) {
    return null;
  }

  return normalizedEmail;
};

const validateGooglePayload = (payload: Record<string, unknown> | undefined) => {
  if (!payload) {
    return null;
  }

  const email = typeof payload.email === 'string' ? normalizeEmail(payload.email) : null;
  const googleId = typeof payload.sub === 'string' ? payload.sub : null;
  const name = getRequestedName(payload.name, email || '');
  const picture = typeof payload.picture === 'string' ? payload.picture : null;
  const issuer = typeof payload.iss === 'string' ? payload.iss : null;
  const emailVerified = payload.email_verified;

  if (!email || !isValidEmail(email) || !googleId || !issuer || !GOOGLE_ISSUERS.has(issuer)) {
    return null;
  }

  if (emailVerified !== true) {
    return null;
  }

  return {
    email,
    googleId,
    name,
    picture,
  };
};

const createOrUpdateGoogleUser = async (params: {
  email: string;
  googleId: string;
  name: string;
  picture: string | null;
}) => {
  const { email, googleId, name, picture } = params;

  const [userByGoogleId] = await db.select().from(users).where(eq(users.googleId, googleId));
  const [userByEmail] = await db.select().from(users).where(eq(users.email, email));

  if (userByGoogleId && userByEmail && userByGoogleId.id !== userByEmail.id) {
    throw new Error('Google account is already linked to another user');
  }

  if (userByGoogleId) {
    const [updatedUser] = await db.update(users)
      .set({
        name: userByGoogleId.name || name,
        profileImage: picture || userByGoogleId.profileImage || undefined,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userByGoogleId.id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
      });

    if (!updatedUser) {
      throw new Error('Failed to update Google user');
    }

    return updatedUser;
  }

  if (userByEmail) {
    const [linkedUser] = await db.update(users)
      .set({
        googleId,
        profileImage: picture || userByEmail.profileImage || undefined,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userByEmail.id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
      });

    if (!linkedUser) {
      throw new Error('Failed to link Google user');
    }

    return linkedUser;
  }

  const [newUser] = await db.insert(users).values({
    name,
    email,
    passwordHash: null,
    googleId,
    provider: 'GOOGLE',
    profileImage: picture,
    phoneVerified: false,
  }).returning({
    id: users.id,
    name: users.name,
    email: users.email,
  });

  if (!newUser) {
    throw new Error('Failed to create Google user');
  }

  await emitUserCreatedEvent(newUser.id, newUser.email, newUser.name);
  return newUser;
};

export const signup = async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;

    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const normalizedEmail = validateCommonEmail(email);
    if (!normalizedEmail) {
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    }

    const [existingUser] = await db.select().from(users).where(eq(users.email, normalizedEmail));
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);

    const [newUser] = await db.insert(users).values({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      provider: 'LOCAL',
      phoneVerified: false,
    }).returning({
      id: users.id,
      name: users.name,
      email: users.email,
    });

    await emitUserCreatedEvent(newUser.id, newUser.email, newUser.name);

    return res.status(201).json({
      message: 'User registered successfully',
      ...buildAuthResponse(newUser),
    });
  } catch (error) {
    console.error('Signup Error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const normalizedEmail = validateCommonEmail(email);
    if (!normalizedEmail) {
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    }

    const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail));
    if (!user || !user.passwordHash) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    return res.status(200).json({
      ...buildAuthResponse(user),
    });
  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const googleSignIn = async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body ?? {};

    if (typeof idToken !== 'string' || !idToken.trim()) {
      return res.status(400).json({ success: false, error: 'Missing idToken' });
    }

    if (!isLikelyGoogleIdToken(idToken)) {
      return res.status(400).json({ success: false, error: 'Invalid Google token format' });
    }

    if (GOOGLE_CLIENT_IDS.length === 0) {
      return res.status(500).json({ success: false, error: 'Google OAuth is not configured' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: idToken.trim(),
      audience: GOOGLE_CLIENT_IDS,
    });

    const payload = validateGooglePayload(ticket.getPayload() as Record<string, unknown> | undefined);
    if (!payload) {
      return res.status(401).json({ success: false, error: 'Invalid Google token' });
    }

    const user = await createOrUpdateGoogleUser(payload);

    return res.status(200).json({
      ...buildAuthResponse(user),
    });
  } catch (error) {
    console.error('Google Sign-In Error:', error);

    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Google account is already linked to another user') {
      return res.status(409).json({ success: false, error: message });
    }

    return res.status(401).json({ success: false, error: 'Invalid Google token' });
  }
};

export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { currentPassword, newPassword } = req.body ?? {};

    if (!userId || typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 8 characters and include uppercase, lowercase, number, and special character',
      });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (!user.passwordHash) {
      return res.status(400).json({ success: false, error: 'Password login is not configured for this account' });
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSamePassword) {
      return res.status(400).json({ success: false, error: 'New password must be different from current password' });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, PASSWORD_HASH_ROUNDS);

    await db.update(users)
      .set({
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const sendPhoneOtp = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { phone } = req.body ?? {};

    if (!userId || typeof phone !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const normalizedPhone = normalizePhoneNumber(phone);
    if (!isValidPhoneNumber(normalizedPhone)) {
      return res.status(400).json({ success: false, error: 'Invalid phone number' });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const otp = randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(otp, OTP_HASH_ROUNDS);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await db.transaction(async tx => {
      await tx.delete(phoneVerificationCodes).where(eq(phoneVerificationCodes.phone, normalizedPhone));

      await tx.insert(phoneVerificationCodes).values({
        userId,
        phone: normalizedPhone,
        otp: otpHash,
        expiresAt,
      });
    });

    const response: Record<string, unknown> = {
      success: true,
      message: 'OTP sent successfully',
    };

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Auth Service] OTP for ${normalizedPhone}: ${otp}`);
      response.otp = otp;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Send phone OTP error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const verifyPhoneOtp = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { phone, otp } = req.body ?? {};

    if (!userId || typeof phone !== 'string' || typeof otp !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const normalizedPhone = normalizePhoneNumber(phone);
    if (!isValidPhoneNumber(normalizedPhone)) {
      return res.status(400).json({ success: false, error: 'Invalid phone number' });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const [latestCode] = await db.select().from(phoneVerificationCodes)
      .where(and(
        eq(phoneVerificationCodes.userId, userId),
        eq(phoneVerificationCodes.phone, normalizedPhone)
      ))
      .orderBy(desc(phoneVerificationCodes.createdAt))
      .limit(1);

    if (!latestCode) {
      return res.status(404).json({ success: false, error: 'OTP not found' });
    }

    if (new Date(latestCode.expiresAt).getTime() <= Date.now()) {
      return res.status(400).json({ success: false, error: 'OTP has expired' });
    }

    const isOtpValid = await bcrypt.compare(String(otp), latestCode.otp);
    if (!isOtpValid) {
      return res.status(400).json({ success: false, error: 'Invalid OTP' });
    }

    await db.transaction(async tx => {
      await tx.update(users).set({
        phoneNumber: normalizedPhone,
        phoneVerified: true,
        updatedAt: new Date(),
      }).where(eq(users.id, userId));

      await tx.delete(phoneVerificationCodes).where(eq(phoneVerificationCodes.id, latestCode.id));
    });

    return res.status(200).json({
      success: true,
      message: 'Phone number verified successfully',
    });
  } catch (error) {
    console.error('Verify phone OTP error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const authenticatedUserId = req.userId;
    const requestedUserId = typeof req.params.userId === 'string' && req.params.userId.trim()
      ? req.params.userId.trim()
      : authenticatedUserId;

    if (!authenticatedUserId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (requestedUserId && requestedUserId !== authenticatedUserId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const [user] = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      provider: users.provider,
      profileImage: users.profileImage,
      phoneNumber: users.phoneNumber,
      phoneVerified: users.phoneVerified,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    }).from(users).where(eq(users.id, authenticatedUserId));

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    return res.status(200).json({ success: true, user });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const logout = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    await revokeSession(req);

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    const { name } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID is required' });
    }

    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const [updatedUser] = await db.update(users)
      .set({
        name: name.trim(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
      });

    if (!updatedUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: { id: updatedUser.id, name: updatedUser.name, email: updatedUser.email },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};