import { Request, Response } from 'express';
import { db } from '../config/db';
import { fundingTransactions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getKafkaProducer } from '../config/kafka';


//THE INTENT (PENDING)

export const createDepositIntent = async (req: Request, res: Response) => {
  try {
    const { asset, amount, type } = req.body;
    

    const userId = req.headers['x-user-id'] as string ;

    if (!asset || !amount || !type) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    let externalTxId = null;
    let cryptoAddress = null;

    if (type === 'FIAT_STRIPE') {
      externalTxId = `cs_test_${uuidv4()}`; 
    } else if (type === 'CRYPTO_ETH') {
      cryptoAddress = '0xMockDepositWalletAddressForUserEth' + uuidv4().substring(0, 6);
    }

    const [newTx] = await db.insert(fundingTransactions).values({
      userId,
      direction: 'DEPOSIT',
      type,
      asset: asset.toLowerCase(),
      amount,
      externalTxId,
      cryptoAddress,
      status: 'PENDING'
    }).returning();

    console.log(`[Funding Service] Intent Saved: ${newTx.id} | Status: PENDING`);

    return res.status(201).json({
      success: true,
      message: 'Deposit intent created successfully',
      transaction: {
        id: newTx.id,
        status: newTx.status,
        type: newTx.type,
        amount: newTx.amount,
        asset: newTx.asset,
        stripeCheckoutUrl: type === 'FIAT_STRIPE' ? `https://checkout.stripe.com/pay/${externalTxId}` : null,
        cryptoDepositAddress: cryptoAddress
      }
    });

  } catch (error) {
    console.error('Error creating deposit intent:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// CRYPTO CONFIRMATION

export const simulateCryptoDeposit = async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.body;

    console.log(`[Crypto Simulation] Processing block confirmations for: ${transactionId}`);

    const [transaction] = await db.select()
      .from(fundingTransactions)
      .where(eq(fundingTransactions.id, transactionId));

    if (!transaction || transaction.type !== 'CRYPTO_ETH') {
      return res.status(404).json({ success: false, error: 'Pending crypto transaction not found' });
    }

    if (transaction.status === 'COMPLETED') {
      return res.status(400).json({ success: false, error: 'Transaction already completed' });
    }

    await db.update(fundingTransactions)
      .set({ 
        status: 'COMPLETED',
        updatedAt: new Date()
      })
      .where(eq(fundingTransactions.id, transactionId));

    console.log(`[Crypto Simulation] 12 Confirmations met. Transaction updated.`);

    const producer = await getKafkaProducer();
    const kafkaPayload = {
      eventId: `crypto-dep-${transaction.id}`,
      type: 'DEPOSIT_CLEARED',
      userId: transaction.userId,
      asset: transaction.asset,
      amount: transaction.amount,
      method: 'CRYPTO_ETH',
      timestamp: new Date().toISOString()
    };

    await producer.send({
      topic: 'deposit-cleared',
      messages: [{ value: JSON.stringify(kafkaPayload) }],
    });

    console.log(`[Crypto Simulation] Event emitted to Kafka topic: deposit-cleared`);

    return res.status(200).json({
      success: true,
      message: 'Crypto deposit simulation complete. Wallet will update.',
      status: 'COMPLETED'
    });

  } catch (error) {
    console.error('Crypto simulation failure:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

//  WITHDRAWAL INTENT

export const createWithdrawalIntent = async (req: Request, res: Response) => {
  try {
    const { asset, amount, type, destinationAddress } = req.body;
    

    const userId = req.headers['x-user-id'] as string; 

    if (!asset || !amount || !type) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    if (type === 'CRYPTO_ETH' && !destinationAddress) {
      return res.status(400).json({ success: false, error: 'Crypto withdrawals require a destinationAddress' });
    }

    // intent as PENDING 
    const [newTx] = await db.insert(fundingTransactions).values({
      userId,
      direction: 'WITHDRAWAL',
      type,
      asset: asset.toLowerCase(),
      amount,
      cryptoAddress: destinationAddress || null, 
      status: 'PENDING'
    }).returning();

    console.log(`[Funding Service] Withdrawal Intent Saved: ${newTx.id} | Status: PENDING`);

    const producer = await getKafkaProducer();
    
    const kafkaPayload = {
      eventId: `withdraw-req-${newTx.id}`,
      transactionId: newTx.id,
      userId,
      asset: newTx.asset,
      amount: newTx.amount,
      type: newTx.type,
      destination: destinationAddress,
      timestamp: new Date().toISOString()
    };

    await producer.send({
      topic: 'withdrawal-requested',
      messages: [{ value: JSON.stringify(kafkaPayload) }],
    });

    console.log(`[Funding Service] Emitted 'withdrawal-requested' to Kafka`);

    return res.status(201).json({
      success: true,
      message: 'Withdrawal requested. Awaiting wallet validation.',
      transaction: {
        id: newTx.id,
        status: newTx.status,
        direction: newTx.direction,
        amount: newTx.amount,
        asset: newTx.asset,
      }
    });

  } catch (error) {
    console.error('Error creating withdrawal intent:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};