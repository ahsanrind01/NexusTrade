import { pgTable, uuid, varchar, numeric, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const fundingStatusEnum = pgEnum('funding_status', ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']);
export const fundingTypeEnum = pgEnum('funding_type', ['FIAT_STRIPE', 'CRYPTO_ETH']);
export const transactionDirectionEnum = pgEnum('tx_direction', ['DEPOSIT', 'WITHDRAWAL']);

export const fundingTransactions = pgTable('funding_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  direction: transactionDirectionEnum('direction').notNull(),
  type: fundingTypeEnum('type').notNull(),
  asset: varchar('asset', { length: 10 }).notNull(), 
  amount: numeric('amount', { precision: 18, scale: 8 }).notNull(),
  
  externalTxId: varchar('external_tx_id'), 
  cryptoAddress: varchar('crypto_address'), 
  
  status: fundingStatusEnum('status').default('PENDING').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});