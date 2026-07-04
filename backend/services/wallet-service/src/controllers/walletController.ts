import { Response } from 'express';
import { GatewayRequest } from '../../../../shared';
import {
  getWalletSnapshot,
  reserveWalletBalance,
  releaseReservation,
  adjustTotalBalance,
} from '../services/walletState';
import {
  getTransferHistory,
  transferWalletFunds,
} from '../services/transferService';

export const getBalance = async (req: GatewayRequest, res: Response) => {
  try {
    const userId = req.userId;
    const balances = await getWalletSnapshot(userId!);
    const availableBalance: Record<string, string> = {};

    for (const [asset, state] of Object.entries(balances)) {
      availableBalance[asset] = state.available.toString();
    }

    res.status(200).json({
      success: true,
      userId,
      balance: availableBalance,
      wallet: balances,
    });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getTransfers = async (req: GatewayRequest, res: Response) => {
  try {
    const userId = req.userId;
    const transfers = await getTransferHistory(userId!);

    return res.status(200).json({
      success: true,
      transfers,
    });
  } catch (error) {
    console.error('Get transfer history error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const reserveBalance = async (req: GatewayRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { orderId, asset, amount, side } = req.body ?? {};

    if (!userId || typeof orderId !== 'string' || typeof asset !== 'string' || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || !side) {
      return res.status(400).json({ success: false, error: 'Missing required reservation fields' });
    }

    const result = await reserveWalletBalance({
      userId,
      orderId,
      asset,
      amount,
      side,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient available balance',
        available: result.available,
        locked: result.locked,
      });
    }

    return res.status(200).json({
      success: true,
      reservation: result.reservation,
      alreadyReserved: result.alreadyReserved,
    });
  } catch (error) {
    console.error('Reserve balance error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const releaseBalance = async (req: GatewayRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { orderId, releaseAmount } = req.body ?? {};

    if (!userId || typeof orderId !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing required release fields' });
    }

    const result = await releaseReservation({
      userId,
      orderId,
      releaseAmount: typeof releaseAmount === 'number' ? releaseAmount : undefined,
    });

    return res.status(200).json({
      success: true,
      releasedAmount: result.releasedAmount,
    });
  } catch (error) {
    console.error('Release balance error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const transferFunds = async (req: GatewayRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { recipient, asset, amount, requestId } = req.body ?? {};

    if (!userId || typeof recipient !== 'string' || !recipient.trim() || typeof asset !== 'string' || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Missing required transfer fields' });
    }

    const result = await transferWalletFunds({
      senderUserId: userId,
      senderEmail: req.userEmail,
      recipient,
      asset,
      amount,
      requestId: typeof requestId === 'string' ? requestId : undefined,
    });

    if (!result.success) {
      if (result.error === 'RECIPIENT_NOT_FOUND') {
        return res.status(404).json({ success: false, error: 'Recipient not found' });
      }

      if (result.error === 'SELF_TRANSFER_NOT_ALLOWED') {
        return res.status(400).json({ success: false, error: 'You cannot transfer to yourself' });
      }

      if (result.error === 'INSUFFICIENT_FUNDS') {
        return res.status(400).json({
          success: false,
          error: 'Insufficient available balance',
          available: result.available,
        });
      }

      if (result.error === 'TRANSFER_IN_PROGRESS') {
        return res.status(409).json({ success: false, error: 'Transfer already in progress' });
      }

      if (result.error === 'INVALID_AMOUNT') {
        return res.status(400).json({ success: false, error: 'Transfer amount must be positive' });
      }

      return res.status(500).json({ success: false, error: 'Internal server error' });
    }

    return res.status(200).json({
      success: true,
      transfer: result.transfer,
      duplicate: result.duplicate ?? false,
    });
  } catch (error) {
    console.error('Transfer error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const syncTotalBalance = async (req: GatewayRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { asset, newTotal } = req.body ?? {};

    if (!userId || typeof asset !== 'string' || typeof newTotal !== 'number' || !Number.isFinite(newTotal) || newTotal < 0) {
      return res.status(400).json({ success: false, error: 'Missing required sync fields' });
    }

    const state = await adjustTotalBalance(userId, asset, newTotal);

    return res.status(200).json({
      success: true,
      asset: asset.toUpperCase(),
      ...state,
    });
  } catch (error) {
    console.error('Sync total balance error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
