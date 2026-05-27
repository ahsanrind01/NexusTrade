import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: 'postgres://admin:secretpassword@localhost:5432/nexustrade_db',
});

export const db = drizzle(pool, { schema });

console.log('Ledger Service connected to PostgreSQL');