import { Request, Response } from 'express';
import { db } from '../config/db';
import { fundingTransactions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { getKafkaProducer } from '../config/kafka';
import { stripe } from '../config/stripe';

export const handleStripeWebhook = async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[Funding Webhook] STRIPE_WEBHOOK_SECRET is not set.');
    return res.status(500).send('Webhook not configured');
  }

  let event;

  try {
    // req.body must be the raw Buffer here, not parsed JSON (see index.ts change)
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err) {
    console.error('[Funding Webhook] Signature verification failed:', (err as Error).message);
    return res.status(400).send(`Webhook Error: ${(err as Error).message}`);
  }

  try {
    // We only care when a checkout session is successfully paid
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as { id: string };
      const externalTxId = paymentIntent.id;

      console.log(`[Funding Webhook] Catching successful payment for: ${externalTxId}`);

      // 1. Update the database record from PENDING to COMPLETED
      const [updatedTx] = await db.update(fundingTransactions)
        .set({
          status: 'COMPLETED',
          updatedAt: new Date()
        })
        .where(eq(fundingTransactions.externalTxId, externalTxId))
        .returning();

      if (!updatedTx) {
        console.error(`[Funding Webhook] Transaction ${externalTxId} not found in database.`);
        return res.status(404).send('Transaction not found');
      }

      console.log(`[Funding Webhook] DB Updated. Transaction ${updatedTx.id} is now COMPLETED.`);

      // 2. Broadcast to the Kafka Cluster so the Ledger & Wallet update
      const producer = await getKafkaProducer();

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

  } catch (error) {
    console.error('[Funding Webhook] Error processing webhook:', error);
    return res.status(500).send('Webhook Error');
  }
};