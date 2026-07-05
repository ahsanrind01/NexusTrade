"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleStripeWebhook = void 0;
const db_1 = require("../config/db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const kafka_1 = require("../config/kafka");
const stripe_1 = require("../config/stripe");
const handleStripeWebhook = async (req, res) => {
    const signature = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
        console.error('[Funding Webhook] STRIPE_WEBHOOK_SECRET is not set.');
        return res.status(500).send('Webhook not configured');
    }
    let event;
    try {
        // req.body must be the raw Buffer here, not parsed JSON (see index.ts change)
        event = stripe_1.stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    }
    catch (err) {
        console.error('[Funding Webhook] Signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    try {
        // We only care when a checkout session is successfully paid
        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object;
            const externalTxId = paymentIntent.id;
            console.log(`[Funding Webhook] Catching successful payment for: ${externalTxId}`);
            // 1. Update the database record from PENDING to COMPLETED
            const [updatedTx] = await db_1.db.update(schema_1.fundingTransactions)
                .set({
                status: 'COMPLETED',
                updatedAt: new Date()
            })
                .where((0, drizzle_orm_1.eq)(schema_1.fundingTransactions.externalTxId, externalTxId))
                .returning();
            if (!updatedTx) {
                console.error(`[Funding Webhook] Transaction ${externalTxId} not found in database.`);
                return res.status(404).send('Transaction not found');
            }
            console.log(`[Funding Webhook] DB Updated. Transaction ${updatedTx.id} is now COMPLETED.`);
            // 2. Broadcast to the Kafka Cluster so the Ledger & Wallet update
            const producer = await (0, kafka_1.getKafkaProducer)();
            const kafkaPayload = {
                eventId: `fiat-dep-${updatedTx.id}`,
                type: 'DEPOSIT_CLEARED',
                userId: updatedTx.userId,
                asset: updatedTx.asset,
                amount: updatedTx.amount,
                method: updatedTx.type,
                timestamp: new Date().toISOString()
            };
            await producer.send({
                topic: 'deposit-cleared',
                messages: [{ value: JSON.stringify(kafkaPayload) }],
            });
            console.log(`[Funding Webhook] 🚀 Kafka Event Emitted: deposit-cleared`);
        }
        // Always return a 200 OK to Stripe quickly so they don't retry the webhook
        return res.status(200).json({ received: true });
    }
    catch (error) {
        console.error('[Funding Webhook] Error processing webhook:', error);
        return res.status(500).send('Webhook Error');
    }
};
exports.handleStripeWebhook = handleStripeWebhook;
