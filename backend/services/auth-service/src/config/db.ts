import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool);

export const initDB = async () => {
  try {
    await pool.query('SELECT 1');
    console.log('[Auth Service] Dedicated PostgreSQL Pool Initialized');
  } catch (error) {
    console.error('[Auth Service] Database connection failed:', error);
    process.exit(1);
  }
};
