import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { logger as appLogger } from '../lib/logger';
import * as schema from './schema';

import type { Logger } from 'drizzle-orm/logger';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

const poolMax = Number(process.env.DB_POOL_MAX) || 20;
const parsedTimeout = Number(process.env.DB_QUERY_TIMEOUT);
const queryTimeout =
  process.env.DB_QUERY_TIMEOUT === undefined || Number.isNaN(parsedTimeout) ? 30 : parsedTimeout;

const client = postgres(databaseUrl, {
  max: poolMax,
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: 60 * 30, // 30 minutes max connection lifetime
  prepare: true,
  connection: {
    statement_timeout: queryTimeout * 1000, // milliseconds
  },
});

const isDev = process.env.NODE_ENV !== 'production';

const drizzleLogger: Logger = {
  logQuery(query: string, params: unknown[]) {
    appLogger.debug({ query, params }, 'DB query');
  },
};

export const db = drizzle(client, {
  schema,
  ...(isDev && { logger: drizzleLogger }),
});

export { client };

/**
 * Default statement timeout for queries (in seconds).
 * Can be overridden per-query using postgres `SET statement_timeout`.
 * Configured via DB_QUERY_TIMEOUT env var (default: 30s).
 */
export const DB_QUERY_TIMEOUT_SECONDS = queryTimeout;
