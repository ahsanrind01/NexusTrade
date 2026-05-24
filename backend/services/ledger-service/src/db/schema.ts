import { pgTable, uuid, varchar, numeric, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
});


export const transactions = pgTable('transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  referenceId: varchar('reference_id', { length: 255 }).notNull().unique(), 
  type: varchar('type', { length: 50 }).notNull(),
  status: varchar('status', { length: 50 }).default('PENDING').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  transactionId: uuid('transaction_id').references(() => transactions.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  asset: varchar('asset', { length: 10 }).notNull(), 
  
  amount: numeric('amount', { precision: 18, scale: 8 }).notNull(), 
  
  direction: varchar('direction', { length: 10 }).notNull(), 
  
  createdAt: timestamp('created_at').defaultNow(),
});