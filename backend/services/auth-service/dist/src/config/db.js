"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDB = exports.db = void 0;
const node_postgres_1 = require("drizzle-orm/node-postgres");
const pg_1 = __importDefault(require("pg"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const pool = new pg_1.default.Pool({
    connectionString: process.env.DATABASE_URL,
});
exports.db = (0, node_postgres_1.drizzle)(pool);
const initDB = async () => {
    try {
        await pool.query('SELECT 1');
        console.log('[Auth Service] Dedicated PostgreSQL Pool Initialized');
    }
    catch (error) {
        console.error('[Auth Service] Database connection failed:', error);
        process.exit(1);
    }
};
exports.initDB = initDB;
