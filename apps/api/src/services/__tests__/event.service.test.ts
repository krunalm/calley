import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock modules before importing the service ──────────────────────

// Mock the database module
vi.mock('../../db', () => {
  const mockDb = {
    query: {
      events: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      calendarCategories: {
        findFirst: vi.fn(),
      },
      eventExceptions: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  };

  return { db: mockDb };
});

// Mock logger
vi.mock('../../lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock sanitize
vi.mock('../../lib/sanitize', () => ({
  sanitizeHtml: vi.fn((html: string) => html.replace(/<script[^>]*>.*?<\/script>/gi, '')),
}));

// Mock recurrence service
vi.mock('../recurrence.service', () => ({
  recurrenceService: {
    expandRecurringEvents: vi.fn((events: unknown[]) => events),
    validateRrule: vi.fn(),
  },
}));

import { db } from '../../db';
import { AppError } from '../../lib/errors';
import { sanitizeHtml } from '../../lib/sanitize';
import { EventService } from '../event.service';
import { recurrenceService } from '../recurrence.service';

// ─── Test Fixtures ──────────────────────────────────────────────────

const TEST_USER_ID = 'testuser12345678901234567';
const TEST_CATEGORY_ID = 'testcategory1234567890123';
const TEST_EVENT_ID = 'testevent12345678901234567';

function makeEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_EVENT_ID,
    userId: TEST_USER_ID,
    categoryId: TEST_CATEGORY_ID,
    title: 'Test Event',
    description: '<p>Description</p>',
    location: 'Office',
    startAt: new Date('2026-03-15T10:00:00Z'),
    endAt: new Date('2026-03-15T11:00:00Z'),
    isAllDay: false,
    color: '#c8522a',
    visibility: 'private',
    rrule: null,
    exDates: [],
    recurringEventId: null,
    originalDate: null,
    createdAt: new Date('2026-03-01T00:00:00Z'),
    updatedAt: new Date('2026-03-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

function makeCategory(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_CATEGORY_ID,
    userId: TEST_USER_ID,
    name: 'Work',
    color: '#4a90d9',
    isDefault: false,
    visible: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Helpers for mocking chained Drizzle queries ────────────────────

function mockInsertChain(result: unknown[]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
  (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

function mockTransactionForInsert(result: unknown[]) {
  const txInsertChain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
  const tx = {
    insert: vi.fn().mockReturnValue(txInsertChain),
  };
  (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => fn(tx));
  return tx;
}

function mockUpdateChain(result: unknown[]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
  (db.update as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('EventService', () => {
  let service: EventService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EventService();
  });

  // ─── getEvent ───────────────────────────────────────────────────

  describe('getEvent', () => {
    it('should return an event when found with correct ownership', async () => {
      const eventRow = makeEventRow();
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(eventRow);

      const result = await service.getEvent(TEST_USER_ID, TEST_EVENT_ID);

      expect(result.id).toBe(TEST_EVENT_ID);
      expect(result.title).toBe('Test Event');
      expect(result.startAt).toBe('2026-03-15T10:00:00.000Z');
      expect(result.endAt).toBe('2026-03-15T11:00:00.000Z');
      expect(result.exDates).toEqual([]);
    });

    it('should throw NOT_FOUND when event does not exist', async () => {
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await expect(service.getEvent(TEST_USER_ID, 'nonexistent123456789012345')).rejects.toThrow(
        AppError,
      );

      await expect(
        service.getEvent(TEST_USER_ID, 'nonexistent123456789012345'),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

    it('should serialize dates to ISO strings in the response', async () => {
      const eventRow = makeEventRow({
        exDates: [new Date('2026-03-20T00:00:00Z'), new Date('2026-03-27T00:00:00Z')],
        originalDate: new Date('2026-03-15T00:00:00Z'),
      });
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(eventRow);

      const result = await service.getEvent(TEST_USER_ID, TEST_EVENT_ID);

      expect(result.exDates).toEqual(['2026-03-20T00:00:00.000Z', '2026-03-27T00:00:00.000Z']);
      expect(result.originalDate).toBe('2026-03-15T00:00:00.000Z');
    });
  });

  // ─── createEvent ────────────────────────────────────────────────

  describe('createEvent', () => {
    it('should create a basic event successfully', async () => {
      const eventRow = makeEventRow();
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeCategory(),
      );
      const tx = mockTransactionForInsert([eventRow]);

      const result = await service.createEvent(TEST_USER_ID, {
        title: 'Test Event',
        startAt: '2026-03-15T10:00:00Z',
        endAt: '2026-03-15T11:00:00Z',
        categoryId: TEST_CATEGORY_ID,
        isAllDay: false,
        visibility: 'private',
      });

      expect(result.id).toBe(TEST_EVENT_ID);
      expect(result.title).toBe('Test Event');
      expect(db.transaction).toHaveBeenCalled();
      expect(tx.insert).toHaveBeenCalled();
    });

    it('should sanitize description HTML on create', async () => {
      const eventRow = makeEventRow({ description: '<p>Clean</p>' });
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeCategory(),
      );
      mockTransactionForInsert([eventRow]);

      await service.createEvent(TEST_USER_ID, {
        title: 'Test Event',
        description: '<p>Clean</p><script>alert("xss")</script>',
        startAt: '2026-03-15T10:00:00Z',
        endAt: '2026-03-15T11:00:00Z',
        categoryId: TEST_CATEGORY_ID,
        isAllDay: false,
        visibility: 'private',
      });

      expect(sanitizeHtml).toHaveBeenCalledWith('<p>Clean</p><script>alert("xss")</script>');
    });

    it('should throw NOT_FOUND if category does not belong to user', async () => {
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        undefined,
      );

      await expect(
        service.createEvent(TEST_USER_ID, {
          title: 'Test Event',
          startAt: '2026-03-15T10:00:00Z',
          endAt: '2026-03-15T11:00:00Z',
          categoryId: 'nonexistentcat12345678901',
          isAllDay: false,
          visibility: 'private',
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Category not found',
      });
    });

    it('should create a reminder when specified', async () => {
      const eventRow = makeEventRow();
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeCategory(),
      );

      // tx.insert is called twice inside the transaction: event + reminder
      const tx = mockTransactionForInsert([eventRow]);

      await service.createEvent(TEST_USER_ID, {
        title: 'Test Event',
        startAt: '2026-03-15T10:00:00Z',
        endAt: '2026-03-15T11:00:00Z',
        categoryId: TEST_CATEGORY_ID,
        isAllDay: false,
        visibility: 'private',
        reminder: { minutesBefore: 15, method: 'push' },
      });

      // tx.insert called twice inside the transaction: once for event, once for reminder
      expect(db.transaction).toHaveBeenCalled();
      expect(tx.insert).toHaveBeenCalledTimes(2);
    });

    it('should reject invalid RRULE', async () => {
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeCategory(),
      );
      (recurrenceService.validateRrule as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new AppError(422, 'INVALID_RRULE', 'Invalid recurrence rule: missing FREQ');
      });

      await expect(
        service.createEvent(TEST_USER_ID, {
          title: 'Test Event',
          startAt: '2026-03-15T10:00:00Z',
          endAt: '2026-03-15T11:00:00Z',
          categoryId: TEST_CATEGORY_ID,
          isAllDay: false,
          visibility: 'private',
          rrule: 'INVALID_RRULE_STRING',
        }),
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'INVALID_RRULE',
      });
    });

    it('should accept valid RRULE string', async () => {
      const eventRow = makeEventRow({ rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' });
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeCategory(),
      );
      (recurrenceService.validateRrule as ReturnType<typeof vi.fn>).mockImplementation(() => {});
      mockTransactionForInsert([eventRow]);

      const result = await service.createEvent(TEST_USER_ID, {
        title: 'Recurring Event',
        startAt: '2026-03-15T10:00:00Z',
        endAt: '2026-03-15T11:00:00Z',
        categoryId: TEST_CATEGORY_ID,
        isAllDay: false,
        visibility: 'private',
        rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
      });

      expect(result.rrule).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR');
    });

    it('should handle null description', async () => {
      const eventRow = makeEventRow({ description: null });
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeCategory(),
      );
      mockTransactionForInsert([eventRow]);

      const result = await service.createEvent(TEST_USER_ID, {
        title: 'Test Event',
        startAt: '2026-03-15T10:00:00Z',
        endAt: '2026-03-15T11:00:00Z',
        categoryId: TEST_CATEGORY_ID,
        isAllDay: false,
        visibility: 'private',
        description: null,
      });

      expect(result.description).toBeNull();
      expect(sanitizeHtml).not.toHaveBeenCalled();
    });
  });

  // ─── updateEvent ────────────────────────────────────────────────

  describe('updateEvent', () => {
    it('should update a non-recurring event directly', async () => {
      const eventRow = makeEventRow();
      const updatedRow = makeEventRow({ title: 'Updated Title' });
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(eventRow);
      mockUpdateChain([updatedRow]);

      const result = await service.updateEvent(TEST_USER_ID, TEST_EVENT_ID, {
        title: 'Updated Title',
      });

      expect((result as { title: string }).title).toBe('Updated Title');
      expect(db.update).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when updating non-existent event', async () => {
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await expect(
        service.updateEvent(TEST_USER_ID, 'nonexistent123456789012345', {
          title: 'Updated',
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

    it('should validate category on update if changed', async () => {
      const eventRow = makeEventRow();
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(eventRow);
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        undefined,
      );

      await expect(
        service.updateEvent(TEST_USER_ID, TEST_EVENT_ID, {
          categoryId: 'nonexistentcat12345678901',
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Category not found',
      });
    });

    it('should sanitize description on update', async () => {
      const eventRow = makeEventRow();
      const updatedRow = makeEventRow({ description: '<p>Safe</p>' });
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(eventRow);
      mockUpdateChain([updatedRow]);

      await service.updateEvent(TEST_USER_ID, TEST_EVENT_ID, {
        description: '<p>Safe</p><script>evil</script>',
      });

      expect(sanitizeHtml).toHaveBeenCalledWith('<p>Safe</p><script>evil</script>');
    });

    it('should use scope "all" as direct update for recurring events', async () => {
      const recurringEvent = makeEventRow({ rrule: 'FREQ=DAILY' });
      const updatedRow = makeEventRow({ rrule: 'FREQ=DAILY', title: 'Updated' });
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(recurringEvent);
      mockUpdateChain([updatedRow]);

      const result = await service.updateEvent(
        TEST_USER_ID,
        TEST_EVENT_ID,
        { title: 'Updated' },
        'all',
      );

      expect((result as { title: string }).title).toBe('Updated');
      expect(db.update).toHaveBeenCalled();
    });

    it('should require instanceDate when scope is "instance"', async () => {
      const recurringEvent = makeEventRow({ rrule: 'FREQ=DAILY' });
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(recurringEvent);

      await expect(
        service.updateEvent(
          TEST_USER_ID,
          TEST_EVENT_ID,
          { title: 'Changed' },
          'instance',
          undefined,
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should create exception override for scope "instance"', async () => {
      const recurringEvent = makeEventRow({ rrule: 'FREQ=DAILY' });
      const exceptionOverrideRow = {
        id: 'exception1234567890123456',
        recurringEventId: TEST_EVENT_ID,
        userId: TEST_USER_ID,
        originalDate: new Date('2026-03-20T10:00:00Z'),
        overrides: { title: 'Exception Title' },
        createdAt: new Date('2026-03-01T00:00:00Z'),
        updatedAt: new Date('2026-03-01T00:00:00Z'),
        deletedAt: null,
      };
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(recurringEvent);

      // Mock transaction
      (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => {
        const txUpdateChain = {
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([]),
        };
        const txInsertChain = {
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([exceptionOverrideRow]),
        };
        const tx = {
          update: vi.fn().mockReturnValue(txUpdateChain),
          insert: vi.fn().mockReturnValue(txInsertChain),
        };
        return fn(tx);
      });

      const result = await service.updateEvent(
        TEST_USER_ID,
        TEST_EVENT_ID,
        { title: 'Exception Title' },
        'instance',
        '2026-03-20T10:00:00Z',
      );

      expect(result.id).toBe('exception1234567890123456');
      expect(result.recurringEventId).toBe(TEST_EVENT_ID);
      expect((result as { overrides: Record<string, unknown> }).overrides).toEqual({
        title: 'Exception Title',
      });
    });

    it('should require instanceDate when scope is "following"', async () => {
      const recurringEvent = makeEventRow({ rrule: 'FREQ=DAILY' });
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(recurringEvent);

      await expect(
        service.updateEvent(
          TEST_USER_ID,
          TEST_EVENT_ID,
          { title: 'Changed' },
          'following',
          undefined,
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  // ─── deleteEvent ────────────────────────────────────────────────

  describe('deleteEvent', () => {
    it('should soft delete a non-recurring event', async () => {
      const eventRow = makeEventRow();
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(eventRow);
      mockUpdateChain([]);

      await service.deleteEvent(TEST_USER_ID, TEST_EVENT_ID);

      expect(db.update).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when deleting non-existent event', async () => {
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await expect(
        service.deleteEvent(TEST_USER_ID, 'nonexistent123456789012345'),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

    it('should require instanceDate when scope is "instance"', async () => {
      const recurringEvent = makeEventRow({ rrule: 'FREQ=DAILY' });
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(recurringEvent);

      await expect(
        service.deleteEvent(TEST_USER_ID, TEST_EVENT_ID, 'instance', undefined),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should require instanceDate when scope is "following"', async () => {
      const recurringEvent = makeEventRow({ rrule: 'FREQ=DAILY' });
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(recurringEvent);

      await expect(
        service.deleteEvent(TEST_USER_ID, TEST_EVENT_ID, 'following', undefined),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should soft delete parent and exceptions when scope is "all"', async () => {
      const recurringEvent = makeEventRow({ rrule: 'FREQ=DAILY' });
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(recurringEvent);

      const txUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => {
        const tx = {
          update: vi.fn().mockReturnValue(txUpdateChain),
        };
        return fn(tx);
      });

      await service.deleteEvent(TEST_USER_ID, TEST_EVENT_ID, 'all');

      expect(db.transaction).toHaveBeenCalled();
    });
  });

  // ─── duplicateEvent ─────────────────────────────────────────────

  describe('duplicateEvent', () => {
    it('should create a standalone copy of an event', async () => {
      const eventRow = makeEventRow({ rrule: 'FREQ=WEEKLY' });
      const duplicateRow = makeEventRow({
        id: 'duplicate12345678901234567',
        rrule: null,
        recurringEventId: null,
      });
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(eventRow);
      mockInsertChain([duplicateRow]);

      const result = await service.duplicateEvent(TEST_USER_ID, TEST_EVENT_ID);

      expect(result.id).toBe('duplicate12345678901234567');
      expect(result.rrule).toBeNull();
      expect(result.recurringEventId).toBeNull();
    });

    it('should throw NOT_FOUND when duplicating non-existent event', async () => {
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await expect(
        service.duplicateEvent(TEST_USER_ID, 'nonexistent123456789012345'),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });
  });

  // ─── exportIcs ──────────────────────────────────────────────────

  describe('exportIcs', () => {
    it('should generate valid ICS content for a timed event', async () => {
      const eventRow = makeEventRow();
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(eventRow);

      const ics = await service.exportIcs(TEST_USER_ID, TEST_EVENT_ID);

      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('END:VCALENDAR');
      expect(ics).toContain('BEGIN:VEVENT');
      expect(ics).toContain('END:VEVENT');
      expect(ics).toContain('SUMMARY:Test Event');
      expect(ics).toContain(`UID:${TEST_EVENT_ID}@calley.app`);
      expect(ics).toContain('DTSTART:');
      expect(ics).toContain('DTEND:');
      expect(ics).toContain('PRODID:-//Calley//Calley Calendar//EN');
    });

    it('should use VALUE=DATE format for all-day events', async () => {
      const eventRow = makeEventRow({
        isAllDay: true,
        startAt: new Date('2026-03-15T00:00:00Z'),
        endAt: new Date('2026-03-16T00:00:00Z'),
      });
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(eventRow);

      const ics = await service.exportIcs(TEST_USER_ID, TEST_EVENT_ID);

      expect(ics).toContain('DTSTART;VALUE=DATE:20260315');
      expect(ics).toContain('DTEND;VALUE=DATE:20260316');
    });

    it('should include RRULE in ICS for recurring events', async () => {
      const eventRow = makeEventRow({ rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' });
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(eventRow);

      const ics = await service.exportIcs(TEST_USER_ID, TEST_EVENT_ID);

      expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR');
    });

    it('should include EXDATE in ICS when exDates exist', async () => {
      const eventRow = makeEventRow({
        rrule: 'FREQ=DAILY',
        exDates: [new Date('2026-03-20T10:00:00Z')],
      });
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(eventRow);

      const ics = await service.exportIcs(TEST_USER_ID, TEST_EVENT_ID);

      expect(ics).toContain('EXDATE:');
    });

    it('should include location and description when present', async () => {
      const eventRow = makeEventRow({
        location: 'Conference Room A',
        description: '<p>Meeting notes</p>',
      });
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(eventRow);

      const ics = await service.exportIcs(TEST_USER_ID, TEST_EVENT_ID);

      expect(ics).toContain('LOCATION:Conference Room A');
      expect(ics).toContain('DESCRIPTION:Meeting notes');
    });

    it('should escape special characters in ICS fields', async () => {
      const eventRow = makeEventRow({
        title: 'Meeting; with, special\\chars\nnewline',
        location: null,
        description: null,
      });
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(eventRow);

      const ics = await service.exportIcs(TEST_USER_ID, TEST_EVENT_ID);

      expect(ics).toContain('SUMMARY:Meeting\\; with\\, special\\\\chars\\nnewline');
    });

    it('should throw NOT_FOUND when exporting non-existent event', async () => {
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await expect(
        service.exportIcs(TEST_USER_ID, 'nonexistent123456789012345'),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });
  });

  // ─── RRULE Validation ───────────────────────────────────────────

  describe('RRULE validation', () => {
    it('should reject RRULE without FREQ', async () => {
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeCategory(),
      );
      (recurrenceService.validateRrule as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new AppError(422, 'INVALID_RRULE', 'Invalid recurrence rule: missing FREQ');
      });

      await expect(
        service.createEvent(TEST_USER_ID, {
          title: 'Test',
          startAt: '2026-03-15T10:00:00Z',
          endAt: '2026-03-15T11:00:00Z',
          categoryId: TEST_CATEGORY_ID,
          isAllDay: false,
          visibility: 'private',
          rrule: 'BYDAY=MO,WE',
        }),
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'INVALID_RRULE',
      });
    });

    it('should reject RRULE with invalid FREQ value', async () => {
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeCategory(),
      );
      (recurrenceService.validateRrule as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new AppError(422, 'INVALID_RRULE', 'Invalid recurrence rule: invalid FREQ value');
      });

      await expect(
        service.createEvent(TEST_USER_ID, {
          title: 'Test',
          startAt: '2026-03-15T10:00:00Z',
          endAt: '2026-03-15T11:00:00Z',
          categoryId: TEST_CATEGORY_ID,
          isAllDay: false,
          visibility: 'private',
          rrule: 'FREQ=SECONDLY',
        }),
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'INVALID_RRULE',
      });
    });

    it('should accept all valid FREQ values', async () => {
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeCategory(),
      );
      // validateRrule mock default is no-op (doesn't throw), so valid rrules pass through
      (recurrenceService.validateRrule as ReturnType<typeof vi.fn>).mockImplementation(() => {});

      for (const freq of ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']) {
        const eventRow = makeEventRow({ rrule: `FREQ=${freq}` });
        mockTransactionForInsert([eventRow]);

        await expect(
          service.createEvent(TEST_USER_ID, {
            title: 'Test',
            startAt: '2026-03-15T10:00:00Z',
            endAt: '2026-03-15T11:00:00Z',
            categoryId: TEST_CATEGORY_ID,
            isAllDay: false,
            visibility: 'private',
            rrule: `FREQ=${freq}`,
          }),
        ).resolves.toBeDefined();
      }
    });
  });

  // ─── listEvents ─────────────────────────────────────────────────

  describe('listEvents', () => {
    it('should query events within date range', async () => {
      const eventRows = [makeEventRow()];
      // findMany is called twice: regular events, recurring parents
      (db.query.events.findMany as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(eventRows) // regular events
        .mockResolvedValueOnce([]); // recurring parents
      (db.query.eventExceptions.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.listEvents(
        TEST_USER_ID,
        '2026-03-01T00:00:00Z',
        '2026-03-31T23:59:59Z',
      );

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(TEST_EVENT_ID);
      // db.query.events.findMany called 2 times: regular + recurring parents
      expect(db.query.events.findMany).toHaveBeenCalledTimes(2);
    });

    it('should deduplicate events that appear in multiple queries', async () => {
      const eventRow = makeEventRow();
      // Both queries return the same event
      (db.query.events.findMany as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([eventRow])
        .mockResolvedValueOnce([eventRow]);
      (db.query.eventExceptions.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.listEvents(
        TEST_USER_ID,
        '2026-03-01T00:00:00Z',
        '2026-03-31T23:59:59Z',
      );

      // Should be deduplicated to 1 event
      expect(result).toHaveLength(1);
    });

    it('should return an empty array when no events match', async () => {
      (db.query.events.findMany as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (db.query.eventExceptions.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.listEvents(
        TEST_USER_ID,
        '2026-03-01T00:00:00Z',
        '2026-03-31T23:59:59Z',
      );

      expect(result).toEqual([]);
    });
  });
});
