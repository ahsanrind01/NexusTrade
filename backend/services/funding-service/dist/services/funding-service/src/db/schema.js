"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fundingTransactions = exports.transactionDirectionEnum = exports.fundingTypeEnum = exports.fundingStatusEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.fundingStatusEnum = (0, pg_core_1.pgEnum)('funding_status', ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']);
exports.fundingTypeEnum = (0, pg_core_1.pgEnum)('funding_type', ['FIAT_STRIPE', 'CRYPTO_ETH']);
exports.transactionDirectionEnum = (0, pg_core_1.pgEnum)('tx_direction', ['DEPOSIT', 'WITHDRAWAL']);
exports.fundingTransactions = (0, pg_core_1.pgTable)('funding_transactions', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id').notNull(),
    direction: (0, exports.transactionDirectionEnum)('direction').notNull(),
    type: (0, exports.fundingTypeEnum)('type').notNull(),
    asset: (0, pg_core_1.varchar)('asset', { length: 10 }).notNull(),
    amount: (0, pg_core_1.numeric)('amount', { precision: 18, scale: 8 }).notNull(),
    externalTxId: (0, pg_core_1.varchar)('external_tx_id'),
    cryptoAddress: (0, pg_core_1.varchar)('crypto_address'),
    status: (0, exports.fundingStatusEnum)('status').default('PENDING').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
