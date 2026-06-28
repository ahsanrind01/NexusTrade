import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgresql://admin:secretpassword@localhost:5432/nexustrade_db',
});

export const ledgerDb = drizzle(pool);