"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.phoneVerificationCodes = exports.users = exports.authProviderEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.authProviderEnum = (0, pg_core_1.pgEnum)('auth_provider', ['LOCAL', 'GOOGLE']);
exports.users = (0, pg_core_1.pgTable)('users', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    email: (0, pg_core_1.varchar)('email', { length: 255 }).notNull().unique(),
    passwordHash: (0, pg_core_1.varchar)('password_hash', { length: 255 }),
    googleId: (0, pg_core_1.varchar)('google_id', { length: 255 }).unique(),
    provider: (0, exports.authProviderEnum)('provider').notNull().default('LOCAL'),
    profileImage: (0, pg_core_1.varchar)('profile_image', { length: 512 }),
    phoneNumber: (0, pg_core_1.varchar)('phone_number', { length: 32 }),
    phoneVerified: (0, pg_core_1.boolean)('phone_verified').notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
exports.phoneVerificationCodes = (0, pg_core_1.pgTable)('phone_verification_codes', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => exports.users.id, { onDelete: 'cascade' }),
    phone: (0, pg_core_1.varchar)('phone', { length: 32 }).notNull(),
    otp: (0, pg_core_1.varchar)('otp', { length: 255 }).notNull(),
    expiresAt: (0, pg_core_1.timestamp)('expires_at').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
