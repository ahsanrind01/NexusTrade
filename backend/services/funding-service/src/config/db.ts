import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL missing from environment variables');
}

const queryClient = postgres(connectionString);

export const db = drizzle(queryClient, { schema });
console.log('⚡ [Funding Service] PostgreSQL Connection Pool Initialized via Drizzle');