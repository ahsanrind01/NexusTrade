"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProfile = exports.logout = exports.getProfile = exports.verifyPhoneOtp = exports.sendPhoneOtp = exports.changePassword = exports.googleSignIn = exports.login = exports.signup = void 0;
const crypto_1 = require("crypto");
const bcrypt_1 = __importDefault(require("bcrypt"));
const drizzle_orm_1 = require("drizzle-orm");
const google_auth_library_1 = require("google-auth-library");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../config/db");
const kafka_1 = require("../config/kafka");
const schema_1 = require("../db/schema");
const validation_1 = require("../utils/validation");
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secure_jwt_secret_key_here';
const GOOGLE_CLIENT_IDS = Array.from(new Set([
    process.env.GOOGLE_CLIENT_ID,
    ...(process.env.GOOGLE_CLIENT_IDS ? process.env.GOOGLE_CLIENT_IDS.split(',') : []),
]
    .map(value => value?.trim())
    .filter((value) => Boolean(value))));
const googleClient = new google_auth_library_1.OAuth2Client();
const PASSWORD_HASH_ROUNDS = 10;
const OTP_HASH_ROUNDS = 10;
const OTP_TTL_MS = 5 * 60 * 1000;
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const buildAuthResponse = (user) => ({
    success: true,
    token: jsonwebtoken_1.default.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' }),
    user: {
        id: user.id,
        name: user.name,
        email: user.email,
    },
});
const revokeSession = async (_req) => {
    // JWT-only auth has nothing to revoke today.
    // Keep this hook so refresh-token/session invalidation can be added later
    // without changing the logout route contract.
};
const getRequestedName = (name, fallbackEmail) => {
    if (typeof name === 'string' && name.trim()) {
        return name.trim();
    }
    return fallbackEmail.split('@')[0] || 'User';
};
const validateCommonEmail = (email) => {
    if (typeof email !== 'string' || !email.trim()) {
        return null;
    }
    const normalizedEmail = (0, validation_1.normalizeEmail)(email);
    if (!(0, validation_1.isValidEmail)(normalizedEmail)) {
        return null;
    }
    return normalizedEmail;
};
const validateGooglePayload = (payload) => {
    if (!payload) {
        return null;
    }
    const email = typeof payload.email === 'string' ? (0, validation_1.normalizeEmail)(payload.email) : null;
    const googleId = typeof payload.sub === 'string' ? payload.sub : null;
    const name = getRequestedName(payload.name, email || '');
    const picture = typeof payload.picture === 'string' ? payload.picture : null;
    const issuer = typeof payload.iss === 'string' ? payload.iss : null;
    const emailVerified = payload.email_verified;
    if (!email || !(0, validation_1.isValidEmail)(email) || !googleId || !issuer || !GOOGLE_ISSUERS.has(issuer)) {
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
const createOrUpdateGoogleUser = async (params) => {
    const { email, googleId, name, picture } = params;
    const [userByGoogleId] = await db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.googleId, googleId));
    const [userByEmail] = await db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.email, email));
    if (userByGoogleId && userByEmail && userByGoogleId.id !== userByEmail.id) {
        throw new Error('Google account is already linked to another user');
    }
    if (userByGoogleId) {
        const [updatedUser] = await db_1.db.update(schema_1.users)
            .set({
            name: userByGoogleId.name || name,
            profileImage: picture || userByGoogleId.profileImage || undefined,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userByGoogleId.id))
            .returning({
            id: schema_1.users.id,
            name: schema_1.users.name,
            email: schema_1.users.email,
        });
        if (!updatedUser) {
            throw new Error('Failed to update Google user');
        }
        return updatedUser;
    }
    if (userByEmail) {
        const [linkedUser] = await db_1.db.update(schema_1.users)
            .set({
            googleId,
            profileImage: picture || userByEmail.profileImage || undefined,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userByEmail.id))
            .returning({
            id: schema_1.users.id,
            name: schema_1.users.name,
            email: schema_1.users.email,
        });
        if (!linkedUser) {
            throw new Error('Failed to link Google user');
        }
        return linkedUser;
    }
    const [newUser] = await db_1.db.insert(schema_1.users).values({
        name,
        email,
        passwordHash: null,
        googleId,
        provider: 'GOOGLE',
        profileImage: picture,
        phoneVerified: false,
    }).returning({
        id: schema_1.users.id,
        name: schema_1.users.name,
        email: schema_1.users.email,
    });
    if (!newUser) {
        throw new Error('Failed to create Google user');
    }
    await (0, kafka_1.emitUserCreatedEvent)(newUser.id, newUser.email, newUser.name);
    return newUser;
};
const signup = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        const normalizedEmail = validateCommonEmail(email);
        if (!normalizedEmail) {
            return res.status(400).json({ success: false, error: 'Invalid email address' });
        }
        const [existingUser] = await db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.email, normalizedEmail));
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'Email already registered' });
        }
        const passwordHash = await bcrypt_1.default.hash(password, PASSWORD_HASH_ROUNDS);
        const [newUser] = await db_1.db.insert(schema_1.users).values({
            name: name.trim(),
            email: normalizedEmail,
            passwordHash,
            provider: 'LOCAL',
            phoneVerified: false,
        }).returning({
            id: schema_1.users.id,
            name: schema_1.users.name,
            email: schema_1.users.email,
        });
        await (0, kafka_1.emitUserCreatedEvent)(newUser.id, newUser.email, newUser.name);
        return res.status(201).json({
            message: 'User registered successfully',
            ...buildAuthResponse(newUser),
        });
    }
    catch (error) {
        console.error('Signup Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.signup = signup;
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (typeof email !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        const normalizedEmail = validateCommonEmail(email);
        if (!normalizedEmail) {
            return res.status(400).json({ success: false, error: 'Invalid email address' });
        }
        const [user] = await db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.email, normalizedEmail));
        if (!user || !user.passwordHash) {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }
        const isMatch = await bcrypt_1.default.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }
        return res.status(200).json({
            ...buildAuthResponse(user),
        });
    }
    catch (error) {
        console.error('Login Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.login = login;
const googleSignIn = async (req, res) => {
    try {
        const { idToken } = req.body ?? {};
        if (typeof idToken !== 'string' || !idToken.trim()) {
            return res.status(400).json({ success: false, error: 'Missing idToken' });
        }
        if (!(0, validation_1.isLikelyGoogleIdToken)(idToken)) {
            return res.status(400).json({ success: false, error: 'Invalid Google token format' });
        }
        if (GOOGLE_CLIENT_IDS.length === 0) {
            return res.status(500).json({ success: false, error: 'Google OAuth is not configured' });
        }
        const ticket = await googleClient.verifyIdToken({
            idToken: idToken.trim(),
            audience: GOOGLE_CLIENT_IDS,
        });
        const payload = validateGooglePayload(ticket.getPayload());
        if (!payload) {
            return res.status(401).json({ success: false, error: 'Invalid Google token' });
        }
        const user = await createOrUpdateGoogleUser(payload);
        return res.status(200).json({
            ...buildAuthResponse(user),
        });
    }
    catch (error) {
        console.error('Google Sign-In Error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        if (message === 'Google account is already linked to another user') {
            return res.status(409).json({ success: false, error: message });
        }
        return res.status(401).json({ success: false, error: 'Invalid Google token' });
    }
};
exports.googleSignIn = googleSignIn;
const changePassword = async (req, res) => {
    try {
        const userId = req.userId;
        const { currentPassword, newPassword } = req.body ?? {};
        if (!userId || typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        if (!(0, validation_1.isStrongPassword)(newPassword)) {
            return res.status(400).json({
                success: false,
                error: 'New password must be at least 8 characters and include uppercase, lowercase, number, and special character',
            });
        }
        const [user] = await db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, userId));
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        if (!user.passwordHash) {
            return res.status(400).json({ success: false, error: 'Password login is not configured for this account' });
        }
        const isCurrentPasswordValid = await bcrypt_1.default.compare(currentPassword, user.passwordHash);
        if (!isCurrentPasswordValid) {
            return res.status(401).json({ success: false, error: 'Current password is incorrect' });
        }
        const isSamePassword = await bcrypt_1.default.compare(newPassword, user.passwordHash);
        if (isSamePassword) {
            return res.status(400).json({ success: false, error: 'New password must be different from current password' });
        }
        const newPasswordHash = await bcrypt_1.default.hash(newPassword, PASSWORD_HASH_ROUNDS);
        await db_1.db.update(schema_1.users)
            .set({
            passwordHash: newPasswordHash,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId));
        return res.status(200).json({
            success: true,
            message: 'Password updated successfully',
        });
    }
    catch (error) {
        console.error('Change password error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.changePassword = changePassword;
const sendPhoneOtp = async (req, res) => {
    try {
        const userId = req.userId;
        const { phone } = req.body ?? {};
        if (!userId || typeof phone !== 'string') {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        const normalizedPhone = (0, validation_1.normalizePhoneNumber)(phone);
        if (!(0, validation_1.isValidPhoneNumber)(normalizedPhone)) {
            return res.status(400).json({ success: false, error: 'Invalid phone number' });
        }
        const [user] = await db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, userId));
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        const otp = (0, crypto_1.randomInt)(100000, 1000000).toString();
        const otpHash = await bcrypt_1.default.hash(otp, OTP_HASH_ROUNDS);
        const expiresAt = new Date(Date.now() + OTP_TTL_MS);
        await db_1.db.transaction(async (tx) => {
            await tx.delete(schema_1.phoneVerificationCodes).where((0, drizzle_orm_1.eq)(schema_1.phoneVerificationCodes.phone, normalizedPhone));
            await tx.insert(schema_1.phoneVerificationCodes).values({
                userId,
                phone: normalizedPhone,
                otp: otpHash,
                expiresAt,
            });
        });
        const response = {
            success: true,
            message: 'OTP sent successfully',
        };
        if (process.env.NODE_ENV === 'development') {
            console.log(`[Auth Service] OTP for ${normalizedPhone}: ${otp}`);
            response.otp = otp;
        }
        return res.status(200).json(response);
    }
    catch (error) {
        console.error('Send phone OTP error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.sendPhoneOtp = sendPhoneOtp;
const verifyPhoneOtp = async (req, res) => {
    try {
        const userId = req.userId;
        const { phone, otp } = req.body ?? {};
        if (!userId || typeof phone !== 'string' || typeof otp !== 'string') {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        const normalizedPhone = (0, validation_1.normalizePhoneNumber)(phone);
        if (!(0, validation_1.isValidPhoneNumber)(normalizedPhone)) {
            return res.status(400).json({ success: false, error: 'Invalid phone number' });
        }
        const [user] = await db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, userId));
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        const [latestCode] = await db_1.db.select().from(schema_1.phoneVerificationCodes)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.phoneVerificationCodes.userId, userId), (0, drizzle_orm_1.eq)(schema_1.phoneVerificationCodes.phone, normalizedPhone)))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.phoneVerificationCodes.createdAt))
            .limit(1);
        if (!latestCode) {
            return res.status(404).json({ success: false, error: 'OTP not found' });
        }
        if (new Date(latestCode.expiresAt).getTime() <= Date.now()) {
            return res.status(400).json({ success: false, error: 'OTP has expired' });
        }
        const isOtpValid = await bcrypt_1.default.compare(String(otp), latestCode.otp);
        if (!isOtpValid) {
            return res.status(400).json({ success: false, error: 'Invalid OTP' });
        }
        await db_1.db.transaction(async (tx) => {
            await tx.update(schema_1.users).set({
                phoneNumber: normalizedPhone,
                phoneVerified: true,
                updatedAt: new Date(),
            }).where((0, drizzle_orm_1.eq)(schema_1.users.id, userId));
            await tx.delete(schema_1.phoneVerificationCodes).where((0, drizzle_orm_1.eq)(schema_1.phoneVerificationCodes.id, latestCode.id));
        });
        return res.status(200).json({
            success: true,
            message: 'Phone number verified successfully',
        });
    }
    catch (error) {
        console.error('Verify phone OTP error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.verifyPhoneOtp = verifyPhoneOtp;
const getProfile = async (req, res) => {
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
        const [user] = await db_1.db.select({
            id: schema_1.users.id,
            name: schema_1.users.name,
            email: schema_1.users.email,
            provider: schema_1.users.provider,
            profileImage: schema_1.users.profileImage,
            phoneNumber: schema_1.users.phoneNumber,
            phoneVerified: schema_1.users.phoneVerified,
            createdAt: schema_1.users.createdAt,
            updatedAt: schema_1.users.updatedAt,
        }).from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, authenticatedUserId));
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        return res.status(200).json({ success: true, user });
    }
    catch (error) {
        console.error('Get profile error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.getProfile = getProfile;
const logout = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        await revokeSession(req);
        return res.status(200).json({
            success: true,
            message: 'Logged out successfully',
        });
    }
    catch (error) {
        console.error('Logout error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.logout = logout;
const updateProfile = async (req, res) => {
    try {
        const userId = req.params.userId;
        const { name, email } = req.body;
        if (!userId) {
            return res.status(400).json({ success: false, error: 'User ID is required' });
        }
        const normalizedEmail = typeof email === 'string' && email.trim() ? (0, validation_1.normalizeEmail)(email) : undefined;
        if (normalizedEmail && !(0, validation_1.isValidEmail)(normalizedEmail)) {
            return res.status(400).json({ success: false, error: 'Invalid email address' });
        }
        const [updatedUser] = await db_1.db.update(schema_1.users)
            .set({
            name: typeof name === 'string' && name.trim() ? name.trim() : undefined,
            email: normalizedEmail,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))
            .returning({
            id: schema_1.users.id,
            name: schema_1.users.name,
            email: schema_1.users.email,
        });
        if (!updatedUser) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        return res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            user: { id: updatedUser.id, name: updatedUser.name, email: updatedUser.email },
        });
    }
    catch (error) {
        console.error('Update profile error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.updateProfile = updateProfile;
