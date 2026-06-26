import { pgTable, uuid, text, numeric, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const orderSideEnum = pgEnum('order_side', ['BUY', 'SELL']);
export const orderStatusEnum = pgEnum('order_status', ['PENDING', 'FILLED', 'CANCELLED', 'PARTIAL']);

export const orders = pgTable('orders', {
  id:        uuid('id').defaultRandom().primaryKey(),
  userId:    text('user_id').notNull(),
  asset:     text('asset').notNull(),
  side:      orderSideEnum('side').notNull(),
  price:     numeric('price').notNull(),
  amount:    numeric('amount').notNull(),
  status:    orderStatusEnum('status').notNull().default('PENDING'),
  createdAt: timestamp('created_at').defaultNow(),
});