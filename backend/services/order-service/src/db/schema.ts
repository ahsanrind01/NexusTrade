import { pgTable, uuid, text, numeric, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const orderSideEnum = pgEnum('order_side', ['BUY', 'SELL']);
export const orderStatusEnum = pgEnum('order_status', ['PENDING', 'FILLED', 'CANCELLED', 'PARTIAL']);
export const orderTypeEnum = pgEnum('order_type', ['LIMIT', 'MARKET']);

export const tradeRoleEnum= pgEnum('trade_role', ['MAKER', 'TAKER']);

export const orders = pgTable('orders', {
  id:        uuid('id').defaultRandom().primaryKey(),
  userId:    text('user_id').notNull(),
  asset:     text('asset').notNull(),
  side:      orderSideEnum('side').notNull(),
  type:      orderTypeEnum('type').notNull().default('LIMIT'),
  price:     numeric('price').notNull(),
  amount:    numeric('amount').notNull(),
  status:    orderStatusEnum('status').notNull().default('PENDING'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const trades = pgTable('trades', {
  id: uuid('id').defaultRandom().primaryKey(),
  tradeId: text('trade_id').notNull(), 
  userId: text('user_id').notNull(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  asset: text('asset').notNull(),
  side: orderSideEnum('side').notNull(),
  role: tradeRoleEnum('role').notNull(), 
  price: numeric('price').notNull(),
  amount: numeric('amount').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
