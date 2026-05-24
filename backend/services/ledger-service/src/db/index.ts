import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// This connects to the PostgreSQL container running on port 5432
const pool = new Pool({
  connectionString: 'postgres://admin:secretpassword@localhost:5432/nexustrade_db',
});

// We pass the schema so Drizzle knows exactly what our tables look like
export const db = drizzle(pool, { schema });

console.log('🔗 Ledger Service connected to PostgreSQL');