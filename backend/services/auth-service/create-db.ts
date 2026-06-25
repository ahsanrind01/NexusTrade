import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const DB_NAME = 'nexustrade_auth_db';

const run = async () => {
  const client = new pg.Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || 'secretpassword',
    database: 'postgres',
  });

  try {
    await client.connect();

    const result = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [DB_NAME]
    );

    if (result.rowCount === 0) {
      await client.query(`CREATE DATABASE ${DB_NAME}`);
      console.log(`Database '${DB_NAME}' created.`);
    } else {
      console.log(`Database '${DB_NAME}' already exists.`);
    }
  } catch (error) {
    console.error('Failed to create database:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
};

run();
