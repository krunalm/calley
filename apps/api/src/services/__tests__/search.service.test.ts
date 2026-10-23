import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock modules before importing the service ──────────────────────

vi.mock('../../db/index', () => ({
  db: {
    execute: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { db } from '../../db/index';
import { logger } from '../../lib/logger';
import { SearchService } from '../search.service';

// ─── Test Fixtures ──────────────────────────────────────────────────

const TEST_USER_ID = 'testuser12345678901234567';

/**
 * Mock helper: the first db.execute call builds the tsquery from the search
 * string (dictionary-filtered tokens); the next two are the event and task
 * searches.
 */
function mockTsQuery(tsQuery: string, eventRows: unknown[] = [], taskRows: unknown[] = []) {
  (db.execute as ReturnType<typeof vi.fn>)
    .mockResolvedValueOnce([{ tsquery: tsQuery }])
    .mockResolvedValueOnce(eventRows)
    .mockResolvedValueOnce(taskRows);
}

function makeEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'testevent12345678901234567',
    userId: TEST_USER_ID,
    categoryId: 'testcategory1234567890123',
    title: 'Team Standup',
    description: 'Daily standup meeting',
    location: 'Conference Room A',
    startAt: new Date('2026-04-15T09:00:00Z'),
    endAt: new Date('2026-04-15T09:30:00Z'),
    isAllDay: false,
    color: '#4a90d9',
    visibility: 'private',
    rrule: null,
    exDates: [],
    recurringEventId: null,
    originalDate: null,
    createdAt: new Date('2026-04-01T00:00:00Z'),
    updatedAt: new Date('2026-04-01T00:00:00Z'),
    deletedAt: null,
    rank: 0.5,
    ...overrides,
  };
}

function makeTaskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'testtask123456789012345678',
    userId: TEST_USER_ID,
    categoryId: 'testcategory1234567890123',
    title: 'Review standup notes',
    description: 'Review and summarize standup notes',
    dueAt: new Date('2026-04-16T17:00:00Z'),
    priority: 'medium',
    status: 'todo',
    completedAt: null,
    rrule: null,
    exDates: [],
    recurringTaskId: null,
    originalDate: null,
    sortOrder: 0,
    createdAt: new Date('2026-04-01T00:00:00Z'),
    updatedAt: new Date('2026-04-01T00:00:00Z'),
    deletedAt: null,
    rank: 0.4,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(() => {
    vi.clearAllMocks();
    // mockClear does not drop queued mockResolvedValueOnce values, and a test
    // that returns early after the tsquery build (dictionary-filtered to empty)
    // leaves its two search mocks queued for the next test. Reset the mock and
    // restore its default so each test starts with a clean queue.
    (db.execute as ReturnType<typeof vi.fn>).mockReset();
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    service = new SearchService();
  });

  // ─── search ─────────────────────────────────────────────────────

  describe('search', () => {
    it('should return events and tasks matching the query', async () => {
      mockTsQuery("'standup':*", [makeEventRow()], [makeTaskRow()]);

      const result = await service.search(TEST_USER_ID, 'standup');

      expect(result.events).toHaveLength(1);
      expect(result.tasks).toHaveLength(1);
      expect(result.events[0].id).toBe('testevent12345678901234567');
      expect(result.events[0].title).toBe('Team Standup');
      expect(result.tasks[0].id).toBe('testtask123456789012345678');
      expect(result.tasks[0].title).toBe('Review standup notes');
    });

    it('should return empty results for empty query string', async () => {
      const result = await service.search(TEST_USER_ID, '');

      expect(result.events).toEqual([]);
      expect(result.tasks).toEqual([]);
      // A blank query is rejected before any database work.
      expect(db.execute).not.toHaveBeenCalled();
    });

    it('should return empty results for whitespace-only query', async () => {
      const result = await service.search(TEST_USER_ID, '   ');

      expect(result.events).toEqual([]);
      expect(result.tasks).toEqual([]);
      expect(db.execute).not.toHaveBeenCalled();
    });

    it('should not query tables when the dictionary filters every token', async () => {
      // e.g. punctuation-only input: to_tsvector produces no lexemes, so the
      // tsquery comes back empty and both searches are skipped.
      mockTsQuery('');

      const result = await service.search(TEST_USER_ID, '@#$% !!! ***');

      expect(result.events).toEqual([]);
      expect(result.tasks).toEqual([]);
      expect(db.execute).toHaveBeenCalledTimes(1);
    });

    // Regression: tokens were built in JS by stripping punctuation, so english
    // stopwords reached `to_tsquery` and made it raise a syntax error — the
    // client saw a 500 for perfectly ordinary searches like "the meeting".
    // Now the dictionary itself decides what is searchable, so stopwords
    // (and punctuation-only tokens) simply drop out.
    it('drops stop words instead of erroring on natural-language queries', async () => {
      mockTsQuery("'meet':*", [makeEventRow()], []);

      const result = await service.search(TEST_USER_ID, 'the meeting');

      expect(result.events).toHaveLength(1);
      // One call built the tsquery, two ran the searches.
      expect(db.execute).toHaveBeenCalledTimes(3);
    });

    it('should respect the limit parameter', async () => {
      mockTsQuery("'meet':*", [makeEventRow()], [makeTaskRow()]);

      await service.search(TEST_USER_ID, 'meeting', 10);

      // tsquery build + event search + task search
      expect(db.execute).toHaveBeenCalledTimes(3);
    });

    it('should log search execution details', async () => {
      mockTsQuery(
        "'standup':*",
        [makeEventRow()],
        [makeTaskRow(), makeTaskRow({ id: 'testtask2abcde12345678901' })],
      );

      await service.search(TEST_USER_ID, 'standup');

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: TEST_USER_ID,
          query: 'standup',
          eventCount: 1,
          taskCount: 2,
        }),
        'Search executed',
      );
    });

    it('should serialize Date fields to ISO strings in event results', async () => {
      mockTsQuery("'standup':*", [makeEventRow()], []);

      const result = await service.search(TEST_USER_ID, 'standup');

      expect(typeof result.events[0].startAt).toBe('string');
      expect(typeof result.events[0].endAt).toBe('string');
      expect(typeof result.events[0].createdAt).toBe('string');
      expect(typeof result.events[0].updatedAt).toBe('string');
      expect(result.events[0].deletedAt).toBeNull();
    });

    it('should serialize Date fields to ISO strings in task results', async () => {
      mockTsQuery("'review':*", [], [makeTaskRow()]);

      const result = await service.search(TEST_USER_ID, 'review');

      expect(typeof result.tasks[0].dueAt).toBe('string');
      expect(typeof result.tasks[0].createdAt).toBe('string');
      expect(typeof result.tasks[0].updatedAt).toBe('string');
      expect(result.tasks[0].completedAt).toBeNull();
      expect(result.tasks[0].deletedAt).toBeNull();
    });

    it('should handle single-word query correctly', async () => {
      mockTsQuery("'meet':*", [makeEventRow()], []);

      const result = await service.search(TEST_USER_ID, 'meeting');

      expect(result.events).toHaveLength(1);
      expect(db.execute).toHaveBeenCalledTimes(3);
    });

    it('should handle multi-word query correctly', async () => {
      mockTsQuery("'team':* & 'standup':* & 'meet':*", [makeEventRow()], []);

      const result = await service.search(TEST_USER_ID, 'team standup meeting');

      expect(result.events).toHaveLength(1);
      expect(db.execute).toHaveBeenCalledTimes(3);
    });
  });
});
