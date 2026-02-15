import { sql } from 'drizzle-orm';

import { db } from '../db/index';
import { logger } from '../lib/logger';

import type { Event, SearchResults, Task } from '@calley/shared';

/**
 * Sanitize a user-supplied search query for PostgreSQL `to_tsquery`.
 *
 * Splits on whitespace, strips non-alphanumeric characters from each token,
 * appends the `:*` prefix-match operator, and joins with `&` (AND).
 *
 * Example: "team standup" → "team:* & standup:*"
 */
function sanitizeQuery(query: string): string {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[^\w]/g, ''))
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return '';

  return tokens.map((t) => `${t}:*`).join(' & ');
}

function toISOOrNull(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

function toDateArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.map((d) => (d instanceof Date ? d.toISOString() : String(d)));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToEvent(row: any): Event {
  return {
    id: row.id,
    userId: row.userId,
    categoryId: row.categoryId,
    title: row.title,
    description: row.description ?? null,
    location: row.location ?? null,
    startAt: row.startAt instanceof Date ? row.startAt.toISOString() : String(row.startAt),
    endAt: row.endAt instanceof Date ? row.endAt.toISOString() : String(row.endAt),
    isAllDay: Boolean(row.isAllDay),
    color: row.color ?? null,
    visibility: row.visibility as 'public' | 'private',
    rrule: row.rrule ?? null,
    exDates: toDateArray(row.exDates),
    recurringEventId: row.recurringEventId ?? null,
    originalDate: toISOOrNull(row.originalDate),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    deletedAt: null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToTask(row: any): Task {
  return {
    id: row.id,
    userId: row.userId,
    categoryId: row.categoryId,
    title: row.title,
    description: row.description ?? null,
    dueAt: toISOOrNull(row.dueAt),
    priority: row.priority as Task['priority'],
    status: row.status as Task['status'],
    completedAt: toISOOrNull(row.completedAt),
    rrule: row.rrule ?? null,
    exDates: toDateArray(row.exDates),
    recurringTaskId: row.recurringTaskId ?? null,
    originalDate: toISOOrNull(row.originalDate),
    sortOrder: Number(row.sortOrder) || 0,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    deletedAt: null,
  };
}

export class SearchService {
  /**
   * Full-text search across events and tasks.
   *
   * Uses PostgreSQL tsvector/tsquery with the GIN indexes defined on
   * the events and tasks tables (idx_events_search, idx_tasks_search).
   *
   * Results are ranked by ts_rank (relevance) then by date proximity
   * to the current date.
   */
  async search(userId: string, query: string, limit: number = 20): Promise<SearchResults> {
    const tsQuery = sanitizeQuery(query);

    if (!tsQuery) {
      return { events: [], tasks: [] };
    }

    const halfLimit = Math.ceil(limit / 2);

    const [eventRows, taskRows] = await Promise.all([
      this.searchEvents(userId, tsQuery, halfLimit),
      this.searchTasks(userId, tsQuery, halfLimit),
    ]);

    logger.info(
      { userId, query, eventCount: eventRows.length, taskCount: taskRows.length },
      'Search executed',
    );

    return {
      events: eventRows,
      tasks: taskRows,
    };
  }

  private async searchEvents(userId: string, tsQuery: string, limit: number): Promise<Event[]> {
    const rows = await db.execute(
      sql`
        SELECT
          id, user_id AS "userId", category_id AS "categoryId",
          title, description, location,
          start_at AS "startAt", end_at AS "endAt", is_all_day AS "isAllDay",
          color, visibility, rrule, ex_dates AS "exDates",
          recurring_event_id AS "recurringEventId",
          original_date AS "originalDate",
          created_at AS "createdAt", updated_at AS "updatedAt",
          deleted_at AS "deletedAt",
          ts_rank(
            to_tsvector('english', title || ' ' || COALESCE(description, '')),
            to_tsquery('english', ${tsQuery})
          ) AS rank
        FROM events
        WHERE user_id = ${userId}
          AND deleted_at IS NULL
          AND to_tsvector('english', title || ' ' || COALESCE(description, ''))
              @@ to_tsquery('english', ${tsQuery})
        ORDER BY rank DESC, ABS(EXTRACT(EPOCH FROM (start_at - NOW()))) ASC
        LIMIT ${limit}
      `,
    );

    // db.execute with postgres-js returns an array-like ResultSet
    const resultArray = Array.isArray(rows) ? rows : Array.from(rows as Iterable<unknown>);
    return resultArray.map(rowToEvent);
  }

  private async searchTasks(userId: string, tsQuery: string, limit: number): Promise<Task[]> {
    const rows = await db.execute(
      sql`
        SELECT
          id, user_id AS "userId", category_id AS "categoryId",
          title, description,
          due_at AS "dueAt", priority, status, completed_at AS "completedAt",
          rrule, ex_dates AS "exDates",
          recurring_task_id AS "recurringTaskId",
          original_date AS "originalDate",
          sort_order AS "sortOrder",
          created_at AS "createdAt", updated_at AS "updatedAt",
          deleted_at AS "deletedAt",
          ts_rank(
            to_tsvector('english', title || ' ' || COALESCE(description, '')),
            to_tsquery('english', ${tsQuery})
          ) AS rank
        FROM tasks
        WHERE user_id = ${userId}
          AND deleted_at IS NULL
          AND to_tsvector('english', title || ' ' || COALESCE(description, ''))
              @@ to_tsquery('english', ${tsQuery})
        ORDER BY rank DESC, ABS(EXTRACT(EPOCH FROM (COALESCE(due_at, NOW()) - NOW()))) ASC
        LIMIT ${limit}
      `,
    );

    const resultArray = Array.isArray(rows) ? rows : Array.from(rows as Iterable<unknown>);
    return resultArray.map(rowToTask);
  }
}

export const searchService = new SearchService();
