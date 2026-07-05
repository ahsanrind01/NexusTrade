"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWithdrawalConsumer = void 0;
const kafkajs_1 = require("kafkajs");
const db_1 = require("../config/db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const bootstrapTopics_1 = require("../../../../shared/src/kafka/bootstrapTopics");
const kafka = new kafkajs_1.Kafka({
    clientId: 'funding-service',
    brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
});
const consumer = kafka.consumer({ groupId: 'funding-withdrawal-group' });
const startWithdrawalConsumer = async () => {
    try {
        await (0, bootstrapTopics_1.ensureKafkaTopics)('funding-service', [
            'withdrawal-validated',
            'withdrawal-rejected',
        ]);
        await consumer.connect();
        await consumer.subscribe({ topic: 'withdrawal-validated', fromBeginning: true });
        await consumer.subscribe({ topic: 'withdrawal-rejected', fromBeginning: true });
        console.log('[Funding Service] Listening for wallet validations...');
        await consumer.run({
            eachMessage: async ({ topic, message }) => {
                if (!message.value)
                    return;
                const event = JSON.parse(message.value.toString());
                const { transactionId, amount, asset, reason } = event;
                // WALLET APPROVED THE WITHDRAWAL
                if (topic === 'withdrawal-validated') {
                    console.log(`[Funding] Withdrawal ${transactionId} APPROVED by Wallet. Processing external transfer for ${amount} ${asset}...`);
                    // IN PRODUCTION: 
                    //  Stripe Payout API 
                    // ethers.js to send ETH to the user's destinationAddress.
                    await db_1.db.update(schema_1.fundingTransactions)
                        .set({
                        status: 'COMPLETED',
                        updatedAt: new Date()
                    })
                        .where((0, drizzle_orm_1.eq)(schema_1.fundingTransactions.id, transactionId));
                    console.log(`[Funding] Funds sent! Transaction ${transactionId} marked as COMPLETED.`);
                }
                //  WALLET REJECTED THE WITHDRAWAL
                if (topic === 'withdrawal-rejected') {
                    console.log(`[Funding] Withdrawal ${transactionId} REJECTED by Wallet. Reason: ${reason}`);
                    await db_1.db.update(schema_1.fundingTransactions)
                        .set({
                        status: 'FAILED',
                        updatedAt: new Date()
                    })
                        .where((0, drizzle_orm_1.eq)(schema_1.fundingTransactions.id, transactionId));
                    console.log(`[Funding] Transaction ${transactionId} marked as FAILED.`);
                }
            },
        });
    }
    catch (error) {
        console.error('[Funding Consumer] Error running Kafka consumer:', error);
    }
};
exports.startWithdrawalConsumer = startWithdrawalConsumer;
