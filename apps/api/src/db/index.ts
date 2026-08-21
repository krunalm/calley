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
  /**
   * Bound parameters are deliberately not logged — they carry password hashes,
   * reset-token hashes and session ids, and "never log secrets" holds in
   * development too, where these logs are most likely to be pasted into an
   * issue. The parameter count is enough to correlate a statement with a call
   * site.
   */
  logQuery(query: string, params: unknown[]) {
    appLogger.debug({ query, paramCount: params.length }, 'DB query');
  },
};

export const db = drizzle(client, {
  schema,
  ...(isDev && { logger: drizzleLogger }),
});

export { client };

/**
 * Drain the connection pool.
 *
 * Without this the process keeps up to `DB_POOL_MAX` sockets open through
 * shutdown, so an orchestrator that waits for a clean exit has to fall back to
 * SIGKILL and Postgres is left reaping the connections itself.
 */
export async function closeDb(): Promise<void> {
  await client.end({ timeout: 5 });
}

/**
 * Default statement timeout for queries (in seconds).
 * Can be overridden per-query using postgres `SET statement_timeout`.
 * Configured via DB_QUERY_TIMEOUT env var (default: 30s).
 */
export const DB_QUERY_TIMEOUT_SECONDS = queryTimeout;
