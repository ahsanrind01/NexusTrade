"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyTransactions = exports.createWithdrawalIntent = exports.simulateCryptoDeposit = exports.createDepositIntent = void 0;
const db_1 = require("../config/db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const uuid_1 = require("uuid");
const kafka_1 = require("../config/kafka");
const stripe_1 = require("../config/stripe");
//THE INTENT (PENDING)
const createDepositIntent = async (req, res) => {
    try {
        const { asset, amount, type } = req.body;
        const userId = req.headers['x-user-id'];
        if (!asset || !amount || !type) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        let externalTxId = null;
        let cryptoAddress = null;
        let stripeClientSecret = null;
        if (type === 'FIAT_STRIPE') {
            const unitAmount = Math.round(Number(amount) * 100); // convert to cents
            if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
                return res.status(400).json({ success: false, error: 'Invalid amount for FIAT_STRIPE deposit' });
            }
            const paymentIntent = await stripe_1.stripe.paymentIntents.create({
                amount: unitAmount,
                currency: 'usd',
                automatic_payment_methods: { enabled: true },
                metadata: {
                    userId: userId || '',
                    asset,
                    amount: String(amount),
                },
            });
            externalTxId = paymentIntent.id;
            stripeClientSecret = paymentIntent.client_secret;
        }
        else if (type === 'CRYPTO_ETH') {
            cryptoAddress = '0xMockDepositWalletAddressForUserEth' + (0, uuid_1.v4)().substring(0, 6);
        }
        const [newTx] = await db_1.db.insert(schema_1.fundingTransactions).values({
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
                stripeClientSecret,
                cryptoDepositAddress: cryptoAddress
            }
        });
    }
    catch (error) {
        console.error('Error creating deposit intent:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.createDepositIntent = createDepositIntent;
// CRYPTO CONFIRMATION
const simulateCryptoDeposit = async (req, res) => {
    try {
        const { transactionId } = req.body;
        console.log(`[Crypto Simulation] Processing block confirmations for: ${transactionId}`);
        const [transaction] = await db_1.db.select()
            .from(schema_1.fundingTransactions)
            .where((0, drizzle_orm_1.eq)(schema_1.fundingTransactions.id, transactionId));
        if (!transaction || transaction.type !== 'CRYPTO_ETH') {
            return res.status(404).json({ success: false, error: 'Pending crypto transaction not found' });
        }
        if (transaction.status === 'COMPLETED') {
            return res.status(400).json({ success: false, error: 'Transaction already completed' });
        }
        await db_1.db.update(schema_1.fundingTransactions)
            .set({
            status: 'COMPLETED',
            updatedAt: new Date()
        })
            .where((0, drizzle_orm_1.eq)(schema_1.fundingTransactions.id, transactionId));
        console.log(`[Crypto Simulation] 12 Confirmations met. Transaction updated.`);
        const producer = await (0, kafka_1.getKafkaProducer)();
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
    }
    catch (error) {
        console.error('Crypto simulation failure:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.simulateCryptoDeposit = simulateCryptoDeposit;
const createWithdrawalIntent = async (req, res) => {
    try {
        const { asset, amount, type, destinationAddress } = req.body;
        const userId = req.headers['x-user-id'];
        if (!asset || !amount || !type) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        if (type === 'CRYPTO_ETH' && !destinationAddress) {
            return res.status(400).json({ success: false, error: 'Crypto withdrawals require a destinationAddress' });
        }
        // intent as PENDING 
        const [newTx] = await db_1.db.insert(schema_1.fundingTransactions).values({
            userId,
            direction: 'WITHDRAWAL',
            type,
            asset: asset.toLowerCase(),
            amount,
            cryptoAddress: destinationAddress || null,
            status: 'PENDING'
        }).returning();
        console.log(`[Funding Service] Withdrawal Intent Saved: ${newTx.id} | Status: PENDING`);
        const producer = await (0, kafka_1.getKafkaProducer)();
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
    }
    catch (error) {
        console.error('Error creating withdrawal intent:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.createWithdrawalIntent = createWithdrawalIntent;
const getMyTransactions = async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        const transactions = await db_1.db
            .select()
            .from(schema_1.fundingTransactions)
            .where((0, drizzle_orm_1.eq)(schema_1.fundingTransactions.userId, userId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.fundingTransactions.createdAt));
        return res.status(200).json({ success: true, transactions });
    }
    catch (error) {
        console.error('Error fetching funding transactions:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};
exports.getMyTransactions = getMyTransactions;
