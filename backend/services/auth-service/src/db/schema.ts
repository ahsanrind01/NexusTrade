import { boolean, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const authProviderEnum = pgEnum('auth_provider', ['LOCAL', 'GOOGLE']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  googleId: varchar('google_id', { length: 255 }).unique(),
  provider: authProviderEnum('provider').notNull().default('LOCAL'),
  profileImage: varchar('profile_image', { length: 512 }),
  phoneNumber: varchar('phone_number', { length: 32 }),
  phoneVerified: boolean('phone_verified').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const phoneVerificationCodes = pgTable('phone_verification_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  phone: varchar('phone', { length: 32 }).notNull(),
  otp: varchar('otp', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
