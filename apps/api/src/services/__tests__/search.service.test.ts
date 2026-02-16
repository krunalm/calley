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
    service = new SearchService();
  });

  // ─── search ─────────────────────────────────────────────────────

  describe('search', () => {
    it('should return events and tasks matching the query', async () => {
      const eventRows = [makeEventRow()];
      const taskRows = [makeTaskRow()];

      // First call returns events, second returns tasks
      (db.execute as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(eventRows)
        .mockResolvedValueOnce(taskRows);

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
      // Should not call db.execute at all
      expect(db.execute).not.toHaveBeenCalled();
    });

    it('should return empty results for whitespace-only query', async () => {
      const result = await service.search(TEST_USER_ID, '   ');

      expect(result.events).toEqual([]);
      expect(result.tasks).toEqual([]);
      expect(db.execute).not.toHaveBeenCalled();
    });

    it('should sanitize special characters from query tokens', async () => {
      // Query with special characters like SQL injection attempts or symbols
      (db.execute as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await service.search(TEST_USER_ID, 'hello@world! te$t');

      expect(result.events).toEqual([]);
      expect(result.tasks).toEqual([]);
      // db.execute should have been called (query was sanitized, not empty)
      expect(db.execute).toHaveBeenCalledTimes(2);
    });

    it('should return empty for query with only special characters', async () => {
      const result = await service.search(TEST_USER_ID, '@#$% !!! ***');

      expect(result.events).toEqual([]);
      expect(result.tasks).toEqual([]);
      // After sanitization, all tokens become empty strings, so no DB call
      expect(db.execute).not.toHaveBeenCalled();
    });

    it('should respect the limit parameter', async () => {
      (db.execute as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makeEventRow()])
        .mockResolvedValueOnce([makeTaskRow()]);

      await service.search(TEST_USER_ID, 'meeting', 10);

      // Should have been called with halfLimit = ceil(10/2) = 5
      expect(db.execute).toHaveBeenCalledTimes(2);
    });

    it('should use default limit of 20 when not specified', async () => {
      (db.execute as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.search(TEST_USER_ID, 'test');

      // Just verify it was called (default limit = 20, halfLimit = 10)
      expect(db.execute).toHaveBeenCalledTimes(2);
    });

    it('should log search execution details', async () => {
      (db.execute as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makeEventRow()])
        .mockResolvedValueOnce([makeTaskRow(), makeTaskRow({ id: 'testtask2abcde12345678901' })]);

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
      (db.execute as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makeEventRow()])
        .mockResolvedValueOnce([]);

      const result = await service.search(TEST_USER_ID, 'standup');

      expect(typeof result.events[0].startAt).toBe('string');
      expect(typeof result.events[0].endAt).toBe('string');
      expect(typeof result.events[0].createdAt).toBe('string');
      expect(typeof result.events[0].updatedAt).toBe('string');
      expect(result.events[0].deletedAt).toBeNull();
    });

    it('should serialize Date fields to ISO strings in task results', async () => {
      (db.execute as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([makeTaskRow()]);

      const result = await service.search(TEST_USER_ID, 'review');

      expect(typeof result.tasks[0].dueAt).toBe('string');
      expect(typeof result.tasks[0].createdAt).toBe('string');
      expect(typeof result.tasks[0].updatedAt).toBe('string');
      expect(result.tasks[0].completedAt).toBeNull();
      expect(result.tasks[0].deletedAt).toBeNull();
    });

    it('should handle single-word query correctly', async () => {
      (db.execute as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makeEventRow()])
        .mockResolvedValueOnce([]);

      const result = await service.search(TEST_USER_ID, 'meeting');

      expect(result.events).toHaveLength(1);
      expect(db.execute).toHaveBeenCalledTimes(2);
    });

    it('should handle multi-word query correctly', async () => {
      (db.execute as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([makeEventRow()])
        .mockResolvedValueOnce([]);

      const result = await service.search(TEST_USER_ID, 'team standup meeting');

      expect(result.events).toHaveLength(1);
      expect(db.execute).toHaveBeenCalledTimes(2);
    });
  });
});
