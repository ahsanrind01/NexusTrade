import { sql } from 'drizzle-orm';
import { ledgerDb } from '../config/ledgerDb';
import { redis } from '../config/redis';

export const warmUpCache = async () => {
  console.log('[Wallet Cache] Starting warm up from ledger DB...');

  try {
    const rows = await ledgerDb.execute(sql`
      SELECT
        user_id,
        asset,
        SUM(CASE WHEN direction = 'CREDIT' THEN amount::numeric ELSE 0 END) -
        SUM(CASE WHEN direction = 'DEBIT'  THEN amount::numeric ELSE 0 END) AS balance
      FROM ledger_entries
      GROUP BY user_id, asset
    `);

    if (rows.rows.length === 0) {
      console.log('⚠️  [Wallet Cache] No ledger entries found. Cache stays empty.');
      return;
    }

    for (const row of rows.rows) {
      const { user_id, asset, balance } = row as {
        user_id: string;
        asset: string;
        balance: string;
      };

      const redisKey = `wallet:${user_id}`;
      await redis.hset(redisKey, asset.toUpperCase(), parseFloat(balance));
      console.log(`[Wallet Cache] ${user_id} → ${asset}: ${balance}`);
    }

    console.log(`[Wallet Cache] Warm up complete. ${rows.rows.length} balances restored.`);

  } catch (error) {
    console.error('[Wallet Cache] Warm up failed:', error);
  }
};