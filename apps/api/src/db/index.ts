import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

const poolMax = Number(process.env.DB_POOL_MAX) || 20;
const queryTimeout = Number(process.env.DB_QUERY_TIMEOUT) || 30;

const client = postgres(databaseUrl, {
  max: poolMax,
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: 60 * 30, // 30 minutes max connection lifetime
  prepare: true,
});

export const db = drizzle(client, { schema });

export { client };

/**
 * Default statement timeout for queries (in seconds).
 * Can be overridden per-query using postgres `SET statement_timeout`.
 * Configured via DB_QUERY_TIMEOUT env var (default: 30s).
 */
export const DB_QUERY_TIMEOUT_SECONDS = queryTimeout;
