import { redis } from '../config/redis';

export interface WalletAssetState {
  total: number;
  available: number;
  locked: number;
}

export interface WalletReservation {
  orderId: string;
  asset: string;
  amount: number;
  remainingAmount: number;
  side: 'BUY' | 'SELL';
  createdAt: string;
}

const totalKey = (userId: string) => `wallet:${userId}:total`;
const availableKey = (userId: string) => `wallet:${userId}:available`;
const lockedKey = (userId: string) => `wallet:${userId}:locked`;
const reservationKey = (userId: string) => `wallet:${userId}:reservations`;
const legacyKey = (userId: string) => `wallet:${userId}`;
export const transferHistoryKey = (userId: string) => `wallet:${userId}:transfers`;

const parseNumber = (value: string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getReservationKey = reservationKey;

export const getWalletSnapshot = async (userId: string) => {
  const [totals, available, locked] = await Promise.all([
    redis.hgetall(totalKey(userId)),
    redis.hgetall(availableKey(userId)),
    redis.hgetall(lockedKey(userId)),
  ]);

  const assets = new Set<string>([
    ...Object.keys(totals),
    ...Object.keys(available),
    ...Object.keys(locked),
  ]);

  const snapshot: Record<string, WalletAssetState> = {};

  for (const asset of assets) {
    const total = parseNumber(totals[asset]);
    const assetLocked = parseNumber(locked[asset]);
    const assetAvailable = parseNumber(available[asset]);
    snapshot[asset.toUpperCase()] = {
      total,
      available: assetAvailable,
      locked: assetLocked,
    };
  }

  return snapshot;
};

export const setWalletBalance = async (
  userId: string,
  asset: string,
  total: number,
  available = total,
  locked = 0
) => {
  const normalizedAsset = asset.toUpperCase();
  const multi = redis.multi();
  multi.hset(totalKey(userId), normalizedAsset, total);
  multi.hset(availableKey(userId), normalizedAsset, available);
  multi.hset(lockedKey(userId), normalizedAsset, locked);
  multi.hset(legacyKey(userId), normalizedAsset, available);
  await multi.exec();
  return { total, available, locked };
};

export const getWalletBalanceKeys = (userId: string) => ({
  total: totalKey(userId),
  available: availableKey(userId),
  locked: lockedKey(userId),
  legacy: legacyKey(userId),
  reservations: reservationKey(userId),
});

export const adjustTotalBalance = async (userId: string, asset: string, newTotal: number) => {
  const normalizedAsset = asset.toUpperCase();
  const currentLocked = parseNumber(await redis.hget(lockedKey(userId), normalizedAsset));
  const nextAvailable = Math.max(newTotal - currentLocked, 0);
  await setWalletBalance(userId, normalizedAsset, newTotal, nextAvailable, currentLocked);
  return {
    total: newTotal,
    available: nextAvailable,
    locked: currentLocked,
  };
};

export const getReservation = async (userId: string, orderId: string) => {
  const raw = await redis.hget(reservationKey(userId), orderId);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as WalletReservation;
  } catch {
    return null;
  }
};

export const storeReservation = async (userId: string, reservation: WalletReservation) => {
  await redis.hset(reservationKey(userId), reservation.orderId, JSON.stringify(reservation));
};

export const deleteReservation = async (userId: string, orderId: string) => {
  await redis.hdel(reservationKey(userId), orderId);
};

export const reserveWalletBalance = async (params: {
  userId: string;
  orderId: string;
  asset: string;
  amount: number;
  side: 'BUY' | 'SELL';
}) => {
  const { userId, orderId, asset, amount, side } = params;
  const normalizedAsset = asset.toUpperCase();
  const reservation = await getReservation(userId, orderId);

  if (reservation) {
    return {
      success: true,
      reservation,
      alreadyReserved: true,
    };
  }

  while (true) {
    await redis.watch(availableKey(userId), lockedKey(userId), reservationKey(userId));

    const [availableRaw, lockedRaw, existingRaw] = await Promise.all([
      redis.hget(availableKey(userId), normalizedAsset),
      redis.hget(lockedKey(userId), normalizedAsset),
      redis.hget(reservationKey(userId), orderId),
    ]);

    if (existingRaw) {
      await redis.unwatch();
      return {
        success: true,
        reservation: JSON.parse(existingRaw) as WalletReservation,
        alreadyReserved: true,
      };
    }

    const available = parseNumber(availableRaw);
    const locked = parseNumber(lockedRaw);

    if (available < amount) {
      await redis.unwatch();
      return {
        success: false,
        reason: 'INSUFFICIENT_FUNDS',
        available,
        locked,
      };
    }

    const nextReservation: WalletReservation = {
      orderId,
      asset: normalizedAsset,
      amount,
      remainingAmount: amount,
      side,
      createdAt: new Date().toISOString(),
    };

    const tx = redis.multi();
    tx.hincrbyfloat(availableKey(userId), normalizedAsset, -amount);
    tx.hincrbyfloat(lockedKey(userId), normalizedAsset, amount);
    tx.hset(reservationKey(userId), orderId, JSON.stringify(nextReservation));

    const result = await tx.exec();
    if (result) {
      return {
        success: true,
        reservation: nextReservation,
        alreadyReserved: false,
      };
    }
  }
};

export const releaseReservation = async (params: {
  userId: string;
  orderId: string;
  releaseAmount?: number;
}) => {
  const { userId, orderId, releaseAmount } = params;

  while (true) {
    await redis.watch(lockedKey(userId), availableKey(userId), reservationKey(userId));
    const rawReservation = await redis.hget(reservationKey(userId), orderId);
    if (!rawReservation) {
      await redis.unwatch();
      return { success: true, releasedAmount: 0 };
    }

    let reservation: WalletReservation;
    try {
      reservation = JSON.parse(rawReservation) as WalletReservation;
    } catch {
      await redis.unwatch();
      await deleteReservation(userId, orderId);
      return { success: true, releasedAmount: 0 };
    }

    const amountToRelease = Math.min(
      releaseAmount ?? reservation.remainingAmount,
      reservation.remainingAmount
    );

    const locked = parseNumber(await redis.hget(lockedKey(userId), reservation.asset));
    const available = parseNumber(await redis.hget(availableKey(userId), reservation.asset));
    const nextLocked = Math.max(locked - amountToRelease, 0);
    const nextAvailable = available + amountToRelease;
    const nextRemaining = Math.max(reservation.remainingAmount - amountToRelease, 0);

    const tx = redis.multi();
    tx.hset(lockedKey(userId), reservation.asset, nextLocked);
    tx.hset(availableKey(userId), reservation.asset, nextAvailable);
    tx.hset(legacyKey(userId), reservation.asset, nextAvailable);

    if (nextRemaining > 0) {
      tx.hset(reservationKey(userId), orderId, JSON.stringify({
        ...reservation,
        remainingAmount: nextRemaining,
      }));
    } else {
      tx.hdel(reservationKey(userId), orderId);
    }

    const result = await tx.exec();
    if (result) {
      return { success: true, releasedAmount: amountToRelease };
    }
  }
};

export const consumeReservation = async (params: {
  userId: string;
  orderId: string;
  spentAmount: number;
}) => {
  const { userId, orderId, spentAmount } = params;

  while (true) {
    await redis.watch(lockedKey(userId), availableKey(userId), totalKey(userId), reservationKey(userId));
    const rawReservation = await redis.hget(reservationKey(userId), orderId);
    if (!rawReservation) {
      await redis.unwatch();
      return { success: true, consumedAmount: 0, remainingAmount: 0 };
    }

    let reservation: WalletReservation;
    try {
      reservation = JSON.parse(rawReservation) as WalletReservation;
    } catch {
      await redis.unwatch();
      await deleteReservation(userId, orderId);
      return { success: true, consumedAmount: 0, remainingAmount: 0 };
    }

    const normalizedAsset = reservation.asset.toUpperCase();
    const currentLocked = parseNumber(await redis.hget(lockedKey(userId), normalizedAsset));
    const currentTotal = parseNumber(await redis.hget(totalKey(userId), normalizedAsset));
    const consumedAmount = Math.min(spentAmount, reservation.remainingAmount, currentLocked);
    const nextLocked = Math.max(currentLocked - consumedAmount, 0);
    const nextAvailable = Math.max(currentTotal - nextLocked, 0);
    const nextRemaining = Math.max(reservation.remainingAmount - consumedAmount, 0);

    const tx = redis.multi();
    tx.hset(availableKey(userId), normalizedAsset, nextAvailable);
    tx.hset(lockedKey(userId), normalizedAsset, nextLocked);
    tx.hset(legacyKey(userId), normalizedAsset, nextAvailable);

    if (nextRemaining > 0) {
      tx.hset(reservationKey(userId), orderId, JSON.stringify({
        ...reservation,
        remainingAmount: nextRemaining,
      }));
    } else {
      tx.hdel(reservationKey(userId), orderId);
    }

    const result = await tx.exec();
    if (result) {
      return {
        success: true,
        consumedAmount,
        remainingAmount: nextRemaining,
        available: nextAvailable,
        locked: nextLocked,
        total: currentTotal,
      };
    }
  }
};
