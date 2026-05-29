import { Request, Response } from 'express';
import { db } from '../config/db';
import { fundingTransactions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { getKafkaProducer } from '../config/kafka';

export const handleStripeWebhook = async (req: Request, res: Response) => {
  try {
    // In production, you MUST verify the Stripe cryptographic signature here using the raw body.
    // For local development, we will parse the JSON directly.
    const event = req.body;

    // We only care when a checkout session is successfully paid
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const externalTxId = session.id; // This matches the cs_test_... ID we generated

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