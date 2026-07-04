import { randomUUID } from 'crypto';
import { sql } from 'drizzle-orm';
import { ledgerDb } from '../config/ledgerDb';
import { redis } from '../config/redis';
import { getWalletBalanceKeys, getWalletSnapshot, transferHistoryKey } from './walletState';

export interface WalletTransferHistoryItem {
  id: string;
  transferId: string;
  direction: 'IN' | 'OUT';
  asset: string;
  amount: string;
  counterpartyId: string;
  counterpartyEmail: string;
  status: 'COMPLETED';
  createdAt: string;
}

type TransferLookupRow = {
  id: string;
  email: string;
};

const transferRequestKey = (requestId: string) => `wallet:transfer:request:${requestId}`;
const transferResultKey = (requestId: string) => `wallet:transfer:result:${requestId}`;

const resolveRecipient = async (recipient: string): Promise<TransferLookupRow | null> => {
  const normalized = recipient.trim();
  const isEmail = normalized.includes('@');
  const result = isEmail
    ? await ledgerDb.execute(sql`
        select id, email
        from users
        where lower(email) = lower(${normalized})
        limit 1
      `)
    : await ledgerDb.execute(sql`
        select id, email
        from users
        where id = ${normalized}
        limit 1
      `);

  return (result.rows[0] as TransferLookupRow | undefined) ?? null;
};

const parseHistoryRows = (rows: unknown[]): WalletTransferHistoryItem[] => {
  return rows
    .map((row) => {
      if (typeof row !== 'string') return null;
      try {
        return JSON.parse(row) as WalletTransferHistoryItem;
      } catch {
        return null;
      }
    })
    .filter((row): row is WalletTransferHistoryItem => Boolean(row));
};

export const getTransferHistory = async (userId: string) => {
  const rows = await redis.zrevrange(transferHistoryKey(userId), 0, -1);
  return parseHistoryRows(rows);
};

export const transferWalletFunds = async (params: {
  senderUserId: string;
  senderEmail?: string;
  recipient: string;
  asset: string;
  amount: number;
  requestId?: string;
}) => {
  const senderUserId = params.senderUserId;
  const normalizedAsset = params.asset.trim().toUpperCase();
  const amount = Number(params.amount);
  const requestId = params.requestId?.trim() || randomUUID();

  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false as const, error: 'INVALID_AMOUNT' as const };
  }

  const lockKey = transferRequestKey(requestId);
  const resultKey = transferResultKey(requestId);

  const existingResult = await redis.get(resultKey);
  if (existingResult) {
    return { success: true as const, duplicate: true, transfer: JSON.parse(existingResult) };
  }

  const lockAcquired = await redis.set(lockKey, '1', 'NX', 'EX', 60);
  if (lockAcquired !== 'OK') {
    const retryResult = await redis.get(resultKey);
    if (retryResult) {
      return { success: true as const, duplicate: true, transfer: JSON.parse(retryResult) };
    }

    return { success: false as const, error: 'TRANSFER_IN_PROGRESS' as const };
  }

  try {
    const recipient = await resolveRecipient(params.recipient);
    const senderEmail = params.senderEmail?.trim() || senderUserId;

    if (!recipient) {
      return { success: false as const, error: 'RECIPIENT_NOT_FOUND' as const };
    }

    if (recipient.id === senderUserId) {
      return { success: false as const, error: 'SELF_TRANSFER_NOT_ALLOWED' as const };
    }

    const [senderSnapshot, recipientSnapshot] = await Promise.all([
      getWalletSnapshot(senderUserId),
      getWalletSnapshot(recipient.id),
    ]);

    const senderAsset = senderSnapshot[normalizedAsset] ?? { total: 0, available: 0, locked: 0 };
    const recipientAsset = recipientSnapshot[normalizedAsset] ?? { total: 0, available: 0, locked: 0 };

    if (senderAsset.available < amount) {
      return {
        success: false as const,
        error: 'INSUFFICIENT_FUNDS' as const,
        available: senderAsset.available,
      };
    }

  const senderNextTotal = senderAsset.total - amount;
  const senderNextAvailable = senderAsset.available - amount;
  const recipientNextTotal = recipientAsset.total + amount;
  const recipientNextAvailable = recipientAsset.available + amount;
  const timestamp = new Date().toISOString();
  const transferId = requestId;
  const senderHistory: WalletTransferHistoryItem = {
    id: `${transferId}:sender`,
    transferId,
    direction: 'OUT',
    asset: normalizedAsset,
    amount: amount.toString(),
    counterpartyId: recipient.id,
    counterpartyEmail: recipient.email,
    status: 'COMPLETED',
    createdAt: timestamp,
  };
  const recipientHistory: WalletTransferHistoryItem = {
    id: `${transferId}:recipient`,
    transferId,
    direction: 'IN',
    asset: normalizedAsset,
    amount: amount.toString(),
    counterpartyId: senderUserId,
    counterpartyEmail: senderEmail,
    status: 'COMPLETED',
    createdAt: timestamp,
  };

  while (true) {
    await redis.watch(
        getWalletBalanceKeys(senderUserId).total,
        getWalletBalanceKeys(senderUserId).available,
        getWalletBalanceKeys(senderUserId).locked,
        getWalletBalanceKeys(recipient.id).total,
        getWalletBalanceKeys(recipient.id).available,
        getWalletBalanceKeys(recipient.id).locked,
      );

      const [senderAvailableRaw, senderLockedRaw, recipientAvailableRaw, recipientLockedRaw] = await Promise.all([
        redis.hget(getWalletBalanceKeys(senderUserId).available, normalizedAsset),
        redis.hget(getWalletBalanceKeys(senderUserId).locked, normalizedAsset),
        redis.hget(getWalletBalanceKeys(recipient.id).available, normalizedAsset),
        redis.hget(getWalletBalanceKeys(recipient.id).locked, normalizedAsset),
      ]);

      const currentSenderAvailable = Number(senderAvailableRaw ?? 0);
      const currentSenderLocked = Number(senderLockedRaw ?? 0);
      const currentRecipientAvailable = Number(recipientAvailableRaw ?? 0);
      const currentRecipientLocked = Number(recipientLockedRaw ?? 0);

      if (!Number.isFinite(currentSenderAvailable) || currentSenderAvailable < amount) {
        await redis.unwatch();
        return {
          success: false as const,
          error: 'INSUFFICIENT_FUNDS' as const,
          available: currentSenderAvailable,
        };
      }

      const tx = redis.multi();
      tx.hset(getWalletBalanceKeys(senderUserId).total, normalizedAsset, senderNextTotal);
      tx.hset(getWalletBalanceKeys(senderUserId).available, normalizedAsset, senderNextAvailable);
      tx.hset(getWalletBalanceKeys(senderUserId).locked, normalizedAsset, currentSenderLocked);
      tx.hset(getWalletBalanceKeys(senderUserId).legacy, normalizedAsset, senderNextAvailable);

      tx.hset(getWalletBalanceKeys(recipient.id).total, normalizedAsset, recipientNextTotal);
      tx.hset(getWalletBalanceKeys(recipient.id).available, normalizedAsset, recipientNextAvailable);
      tx.hset(getWalletBalanceKeys(recipient.id).locked, normalizedAsset, currentRecipientLocked);
      tx.hset(getWalletBalanceKeys(recipient.id).legacy, normalizedAsset, recipientNextAvailable);

      tx.zadd(transferHistoryKey(senderUserId), Date.parse(timestamp), JSON.stringify(senderHistory));
      tx.zadd(transferHistoryKey(recipient.id), Date.parse(timestamp), JSON.stringify(recipientHistory));
      tx.set(resultKey, JSON.stringify({
        transferId,
        senderUserId,
        recipientId: recipient.id,
        recipientEmail: recipient.email,
        asset: normalizedAsset,
        amount: amount.toString(),
        createdAt: timestamp,
      }), 'EX', 60 * 60 * 24 * 7);

      const result = await tx.exec();
      if (result) {
        try {
          await ledgerDb.transaction(async (ledgerTx) => {
            const inserted = await ledgerTx.execute(sql`
              insert into transactions (reference_id, type, status)
              values (${transferId}, 'TRANSFER', 'COMPLETED')
              on conflict (reference_id) do nothing
              returning id
            `);

            if (inserted.rows.length > 0) {
              const transactionId = (inserted.rows[0] as { id: string }).id;
              await ledgerTx.execute(sql`
                insert into ledger_entries (transaction_id, user_id, asset, amount, direction)
                values
                  (${transactionId}, ${senderUserId}, ${normalizedAsset}, ${amount.toString()}, 'DEBIT'),
                  (${transactionId}, ${recipient.id}, ${normalizedAsset}, ${amount.toString()}, 'CREDIT')
              `);
            }
          });

          return {
            success: true as const,
            transfer: {
              transferId,
              senderUserId,
              recipientId: recipient.id,
              recipientEmail: recipient.email,
              asset: normalizedAsset,
              amount: amount.toString(),
              createdAt: timestamp,
            },
          };
        } catch (ledgerError) {
          console.error('Failed to persist wallet transfer to ledger DB:', ledgerError);

          const revert = redis.multi();
          revert.hset(getWalletBalanceKeys(senderUserId).total, normalizedAsset, senderAsset.total);
          revert.hset(getWalletBalanceKeys(senderUserId).available, normalizedAsset, senderAsset.available);
          revert.hset(getWalletBalanceKeys(senderUserId).locked, normalizedAsset, senderAsset.locked);
          revert.hset(getWalletBalanceKeys(senderUserId).legacy, normalizedAsset, senderAsset.available);

          revert.hset(getWalletBalanceKeys(recipient.id).total, normalizedAsset, recipientAsset.total);
          revert.hset(getWalletBalanceKeys(recipient.id).available, normalizedAsset, recipientAsset.available);
          revert.hset(getWalletBalanceKeys(recipient.id).locked, normalizedAsset, recipientAsset.locked);
          revert.hset(getWalletBalanceKeys(recipient.id).legacy, normalizedAsset, recipientAsset.available);
          revert.zrem(transferHistoryKey(senderUserId), JSON.stringify(senderHistory));
          revert.zrem(transferHistoryKey(recipient.id), JSON.stringify(recipientHistory));
          revert.del(resultKey);
          await revert.exec();

          return { success: false as const, error: 'LEDGER_PERSISTENCE_FAILED' as const };
        }
      }
    }
  } finally {
    await redis.del(lockKey);
  }
};
