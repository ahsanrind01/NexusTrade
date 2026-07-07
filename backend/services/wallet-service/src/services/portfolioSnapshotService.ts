import { sql } from 'drizzle-orm';
import { ledgerDb } from '../config/ledgerDb';
import { redis } from '../config/redis';
import { getWalletSnapshot, type WalletAssetState } from './walletState';

export type PortfolioHistoryRange = '24h' | '7d' | '30d';

export interface PortfolioSnapshotRow {
  timestamp: string;
  totalUsdValue: number;
}

const STABLE_ASSETS = new Set(['USDT', 'USDC', 'DAI', 'BUSD', 'FDUSD', 'TUSD', 'USDP', 'EURC']);
const RANGE_TO_INTERVAL: Record<PortfolioHistoryRange, string> = {
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
};

const SNAPSHOT_TABLE_SQL = sql`
  CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    total_usd_value NUMERIC(18, 8) NOT NULL,
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const SNAPSHOT_INDEX_SQL = sql`
  CREATE INDEX IF NOT EXISTS portfolio_snapshots_user_ts_idx
  ON portfolio_snapshots (user_id, snapshot_at DESC)
`;

const SNAPSHOT_INTERVAL_MINUTES = Math.max(
  1,
  Number.parseInt(process.env.PORTFOLIO_SNAPSHOT_INTERVAL_MINUTES ?? '15', 10) || 15
);

let snapshotJobStarted = false;
let snapshotInProgress = false;

const keyToUserId = (key: string) => {
  const match = key.match(/^wallet:(.+):total$/);
  return match?.[1] ?? null;
};

const isNonZeroSnapshot = (snapshot: Record<string, WalletAssetState>) =>
  Object.values(snapshot).some((asset) =>
    Number.isFinite(asset.total) && asset.total > 0
  );

const getLivePrice = async (asset: string, cache: Map<string, number>) => {
  const upperAsset = asset.toUpperCase();

  if (STABLE_ASSETS.has(upperAsset)) {
    return 1;
  }

  const cached = cache.get(upperAsset);
  if (cached !== undefined) {
    return cached;
  }

  const raw = await redis.get(`price:${upperAsset}USDT`);
  if (!raw) {
    cache.set(upperAsset, 0);
    return 0;
  }

  try {
    const parsed = JSON.parse(raw) as { price?: number | string };
    const price = Number(parsed.price ?? 0);
    const nextPrice = Number.isFinite(price) && price > 0 ? price : 0;
    cache.set(upperAsset, nextPrice);
    return nextPrice;
  } catch {
    cache.set(upperAsset, 0);
    return 0;
  }
};

export const ensurePortfolioSnapshotStore = async () => {
  await ledgerDb.execute(SNAPSHOT_TABLE_SQL);
  await ledgerDb.execute(SNAPSHOT_INDEX_SQL);
};

const listActivePortfolioUsers = async () => {
  const users = new Set<string>();
  let cursor = '0';

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'wallet:*:total', 'COUNT', 250);
    cursor = nextCursor;

    for (const key of keys) {
      const userId = keyToUserId(key);
      if (userId) {
        users.add(userId);
      }
    }
  } while (cursor !== '0');

  return [...users];
};

const computePortfolioValue = async (
  snapshot: Record<string, WalletAssetState>,
  priceCache: Map<string, number>
) => {
  let totalUsdValue = 0;

  for (const [asset, state] of Object.entries(snapshot)) {
    const quantity = Number(state.total);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }

    const livePrice = await getLivePrice(asset, priceCache);
    if (livePrice <= 0) {
      continue;
    }

    totalUsdValue += quantity * livePrice;
  }

  return totalUsdValue;
};

const snapshotUser = async (userId: string, priceCache: Map<string, number>) => {
  const snapshot = await getWalletSnapshot(userId);
  if (!isNonZeroSnapshot(snapshot)) {
    return false;
  }

  const totalUsdValue = await computePortfolioValue(snapshot, priceCache);
  if (!Number.isFinite(totalUsdValue) || totalUsdValue <= 0) {
    return false;
  }

  await ledgerDb.execute(sql`
    INSERT INTO portfolio_snapshots (user_id, total_usd_value, snapshot_at)
    VALUES (${userId}, ${totalUsdValue}, NOW())
  `);

  return true;
};

export const snapshotPortfolioValueForUser = async (userId: string) => {
  const snapshot = await getWalletSnapshot(userId);
  if (!isNonZeroSnapshot(snapshot)) {
    return false;
  }

  const priceCache = new Map<string, number>();
  const totalUsdValue = await computePortfolioValue(snapshot, priceCache);
  if (!Number.isFinite(totalUsdValue) || totalUsdValue <= 0) {
    return false;
  }

  await ledgerDb.execute(sql`
    INSERT INTO portfolio_snapshots (user_id, total_usd_value, snapshot_at)
    VALUES (${userId}, ${totalUsdValue}, NOW())
  `);

  return true;
};

export const snapshotPortfolioValues = async () => {
  if (snapshotInProgress) {
    return;
  }

  snapshotInProgress = true;
  try {
    const activeUsers = await listActivePortfolioUsers();
    if (activeUsers.length === 0) {
      return;
    }

    const priceCache = new Map<string, number>();
    const chunkSize = 10;

    for (let i = 0; i < activeUsers.length; i += chunkSize) {
      const chunk = activeUsers.slice(i, i + chunkSize);
      await Promise.all(chunk.map((userId) => snapshotUser(userId, priceCache)));
    }
  } catch (error) {
    console.error('[Wallet Portfolio] Snapshot job failed:', error);
  } finally {
    snapshotInProgress = false;
  }
};

export const startPortfolioSnapshotJob = async () => {
  if (snapshotJobStarted) {
    return;
  }

  snapshotJobStarted = true;
  await ensurePortfolioSnapshotStore();
  await snapshotPortfolioValues();

  const intervalMs = SNAPSHOT_INTERVAL_MINUTES * 60 * 1000;
  const timer = setInterval(() => {
    void snapshotPortfolioValues();
  }, intervalMs);

  timer.unref?.();
  console.log(`[Wallet Portfolio] Snapshot job running every ${SNAPSHOT_INTERVAL_MINUTES} minutes`);
};

export const getPortfolioHistory = async (userId: string, range: PortfolioHistoryRange) => {
  const interval = RANGE_TO_INTERVAL[range];
  const result = await ledgerDb.execute(sql`
    SELECT
      snapshot_at AS "timestamp",
      total_usd_value AS "totalUsdValue"
    FROM portfolio_snapshots
    WHERE user_id = ${userId}
      AND snapshot_at >= NOW() - ${sql.raw(`INTERVAL '${interval}'`)}
    ORDER BY snapshot_at ASC
  `);

  return result.rows.map((row) => ({
    timestamp: String((row as { timestamp: string }).timestamp),
    totalUsdValue: Number((row as { totalUsdValue: string | number }).totalUsdValue),
  })) as PortfolioSnapshotRow[];
};
