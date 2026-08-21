import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock modules before importing the service ──────────────────────

vi.mock('../../db', () => {
  const mockDb = {
    query: {
      events: { findFirst: vi.fn() },
      tasks: { findFirst: vi.fn() },
      reminders: { findFirst: vi.fn(), findMany: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    select: vi.fn(),
  };
  return { db: mockDb };
});

vi.mock('../../lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../lib/queue', () => ({
  reminderQueue: {
    add: vi.fn().mockResolvedValue(undefined),
    getJob: vi.fn().mockResolvedValue(null),
  },
}));

import { db } from '../../db';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { reminderQueue } from '../../lib/queue';
import { ReminderService } from '../reminder.service';

// ─── Test Fixtures ──────────────────────────────────────────────────

const TEST_USER_ID = 'testuser12345678901234567';
const TEST_EVENT_ID = 'testevent12345678901234567';
const TEST_TASK_ID = 'testtask123456789012345678';
const TEST_REMINDER_ID = 'testreminder1234567890123';

const EVENT_START = new Date('2026-04-15T10:00:00Z');
const TASK_DUE = new Date('2026-04-20T14:00:00Z');

function makeReminderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_REMINDER_ID,
    userId: TEST_USER_ID,
    itemType: 'event',
    itemId: TEST_EVENT_ID,
    minutesBefore: 15,
    method: 'push',
    triggerAt: new Date(EVENT_START.getTime() - 15 * 60 * 1000),
    sentAt: null,
    createdAt: new Date('2026-04-01T00:00:00Z'),
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

function mockUpdateChain() {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };
  (db.update as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

/** Stand in for the `SELECT count(*)` that enforces the per-item reminder cap. */
function mockReminderCount(value: number) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ value }]),
  };
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

function mockDeleteChain() {
  const chain = {
    where: vi.fn().mockResolvedValue([]),
  };
  (db.delete as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('ReminderService', () => {
  let service: ReminderService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: the item is well under the per-item reminder cap.
    mockReminderCount(0);
    service = new ReminderService();
  });

  // ─── createReminder ─────────────────────────────────────────────

  describe('createReminder', () => {
    it('should reject an item that already holds the maximum reminders', async () => {
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        startAt: EVENT_START,
      });
      mockReminderCount(10);

      // Each reminder is a durable row plus a delayed queue job, so an
      // uncapped endpoint lets one authenticated caller schedule unbounded
      // background work against a single event.
      await expect(
        service.createReminder(TEST_USER_ID, {
          itemType: 'event',
          itemId: TEST_EVENT_ID,
          minutesBefore: 15,
          method: 'push',
        }),
      ).rejects.toMatchObject({ statusCode: 422, code: 'VALIDATION_ERROR' });

      expect(db.insert).not.toHaveBeenCalled();
      expect(reminderQueue.add).not.toHaveBeenCalled();
    });

    it('should create a reminder for an event', async () => {
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        startAt: EVENT_START,
      });

      const reminderRow = makeReminderRow();
      mockInsertChain([reminderRow]);

      const result = await service.createReminder(TEST_USER_ID, {
        itemType: 'event',
        itemId: TEST_EVENT_ID,
        minutesBefore: 15,
        method: 'push',
      });

      expect(result.id).toBe(TEST_REMINDER_ID);
      expect(result.itemType).toBe('event');
      expect(result.itemId).toBe(TEST_EVENT_ID);
      expect(result.minutesBefore).toBe(15);
      expect(result.method).toBe('push');
      expect(result.sentAt).toBeNull();
      expect(db.insert).toHaveBeenCalled();
      expect(reminderQueue.add).toHaveBeenCalledWith(
        'send-reminder',
        expect.objectContaining({
          reminderId: TEST_REMINDER_ID,
          userId: TEST_USER_ID,
          itemType: 'event',
          itemId: TEST_EVENT_ID,
          method: 'push',
        }),
        expect.objectContaining({
          jobId: TEST_REMINDER_ID,
        }),
      );
    });

    it('should create a reminder for a task', async () => {
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        dueAt: TASK_DUE,
      });

      const reminderRow = makeReminderRow({
        itemType: 'task',
        itemId: TEST_TASK_ID,
        triggerAt: new Date(TASK_DUE.getTime() - 30 * 60 * 1000),
      });
      mockInsertChain([reminderRow]);

      const result = await service.createReminder(TEST_USER_ID, {
        itemType: 'task',
        itemId: TEST_TASK_ID,
        minutesBefore: 30,
        method: 'email',
      });

      expect(result.id).toBe(TEST_REMINDER_ID);
      expect(result.itemType).toBe('task');
      expect(result.itemId).toBe(TEST_TASK_ID);
      expect(db.insert).toHaveBeenCalled();
      expect(reminderQueue.add).toHaveBeenCalled();
    });

    it('should throw error when creating reminder for task without due date', async () => {
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        dueAt: null,
      });

      await expect(
        service.createReminder(TEST_USER_ID, {
          itemType: 'task',
          itemId: TEST_TASK_ID,
          minutesBefore: 15,
          method: 'push',
        }),
      ).rejects.toThrow(AppError);

      await expect(
        service.createReminder(TEST_USER_ID, {
          itemType: 'task',
          itemId: TEST_TASK_ID,
          minutesBefore: 15,
          method: 'push',
        }),
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'VALIDATION_ERROR',
        message: 'Cannot create reminder for a task without a due date',
      });
    });

    it('should throw NOT_FOUND when event does not exist', async () => {
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await expect(
        service.createReminder(TEST_USER_ID, {
          itemType: 'event',
          itemId: 'nonexistent123456789012345',
          minutesBefore: 15,
          method: 'push',
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Event not found',
      });
    });

    it('should throw NOT_FOUND when task does not exist', async () => {
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await expect(
        service.createReminder(TEST_USER_ID, {
          itemType: 'task',
          itemId: 'nonexistent123456789012345',
          minutesBefore: 15,
          method: 'push',
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Task not found',
      });
    });

    it('should compute correct triggerAt based on minutesBefore', async () => {
      const eventStart = new Date('2026-05-01T09:00:00Z');
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        startAt: eventStart,
      });

      const expectedTriggerAt = new Date(eventStart.getTime() - 60 * 60 * 1000); // 60 mins before
      const reminderRow = makeReminderRow({
        minutesBefore: 60,
        triggerAt: expectedTriggerAt,
      });
      const insertChain = mockInsertChain([reminderRow]);

      await service.createReminder(TEST_USER_ID, {
        itemType: 'event',
        itemId: TEST_EVENT_ID,
        minutesBefore: 60,
        method: 'push',
      });

      // Verify the values passed to db.insert contain the correct triggerAt
      const valuesCall = insertChain.values.mock.calls[0][0];
      expect(valuesCall.triggerAt).toEqual(expectedTriggerAt);
    });

    it('should enqueue BullMQ job with correct delay', async () => {
      // Use a future date to ensure positive delay
      const futureStart = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        startAt: futureStart,
      });

      const triggerAt = new Date(futureStart.getTime() - 15 * 60 * 1000);
      const reminderRow = makeReminderRow({ triggerAt });
      mockInsertChain([reminderRow]);

      await service.createReminder(TEST_USER_ID, {
        itemType: 'event',
        itemId: TEST_EVENT_ID,
        minutesBefore: 15,
        method: 'push',
      });

      expect(reminderQueue.add).toHaveBeenCalledWith(
        'send-reminder',
        expect.any(Object),
        expect.objectContaining({
          jobId: TEST_REMINDER_ID,
          delay: expect.any(Number),
        }),
      );

      // Delay should be positive since trigger is in the future
      const addCall = (reminderQueue.add as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(addCall[2].delay).toBeGreaterThan(0);
    });

    it('should log reminder creation', async () => {
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        startAt: EVENT_START,
      });

      const reminderRow = makeReminderRow();
      mockInsertChain([reminderRow]);

      await service.createReminder(TEST_USER_ID, {
        itemType: 'event',
        itemId: TEST_EVENT_ID,
        minutesBefore: 15,
        method: 'push',
      });

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: TEST_USER_ID,
          reminderId: TEST_REMINDER_ID,
          itemType: 'event',
          itemId: TEST_EVENT_ID,
        }),
        'Reminder created',
      );
    });
  });

  // ─── deleteReminder ─────────────────────────────────────────────

  describe('deleteReminder', () => {
    it('should delete a reminder successfully', async () => {
      const reminderRow = makeReminderRow();
      (db.query.reminders.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(reminderRow);
      mockDeleteChain();

      await service.deleteReminder(TEST_USER_ID, TEST_REMINDER_ID);

      expect(db.delete).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ userId: TEST_USER_ID, reminderId: TEST_REMINDER_ID }),
        'Reminder deleted',
      );
    });

    it('should throw NOT_FOUND when reminder does not exist', async () => {
      (db.query.reminders.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await expect(
        service.deleteReminder(TEST_USER_ID, 'nonexistent123456789012345'),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Reminder not found',
      });
    });

    it('should remove BullMQ job when it exists', async () => {
      const reminderRow = makeReminderRow();
      (db.query.reminders.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(reminderRow);
      mockDeleteChain();

      const mockJob = { remove: vi.fn().mockResolvedValue(undefined) };
      (reminderQueue.getJob as ReturnType<typeof vi.fn>).mockResolvedValue(mockJob);

      await service.deleteReminder(TEST_USER_ID, TEST_REMINDER_ID);

      expect(reminderQueue.getJob).toHaveBeenCalledWith(TEST_REMINDER_ID);
      expect(mockJob.remove).toHaveBeenCalled();
      expect(db.delete).toHaveBeenCalled();
    });

    it('should handle BullMQ job removal failure gracefully', async () => {
      const reminderRow = makeReminderRow();
      (db.query.reminders.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(reminderRow);
      mockDeleteChain();

      // Once, not persistent: vi.clearAllMocks() does not drop implementations, so
      // a persistent rejection here would leak a failing getJob into every later test.
      (reminderQueue.getJob as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Redis connection failed'),
      );

      // Should not throw, just warn
      await service.deleteReminder(TEST_USER_ID, TEST_REMINDER_ID);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ reminderId: TEST_REMINDER_ID }),
        'Failed to remove BullMQ job for reminder',
      );
      // DB delete should still happen
      expect(db.delete).toHaveBeenCalled();
    });
  });

  // ─── listReminders ──────────────────────────────────────────────

  describe('listReminders', () => {
    it('should return reminders for an event', async () => {
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        startAt: EVENT_START,
      });

      const reminderRows = [
        makeReminderRow({ id: 'reminder1234567890123456a', minutesBefore: 15 }),
        makeReminderRow({ id: 'reminder1234567890123456b', minutesBefore: 60 }),
      ];
      (db.query.reminders.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(reminderRows);

      const result = await service.listReminders(TEST_USER_ID, {
        itemType: 'event',
        itemId: TEST_EVENT_ID,
      });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('reminder1234567890123456a');
      expect(result[1].id).toBe('reminder1234567890123456b');
      // Should serialize dates to ISO strings
      expect(typeof result[0].triggerAt).toBe('string');
      expect(typeof result[0].createdAt).toBe('string');
    });

    it('should throw NOT_FOUND if the parent event does not exist', async () => {
      (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await expect(
        service.listReminders(TEST_USER_ID, {
          itemType: 'event',
          itemId: 'nonexistent123456789012345',
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });
  });

  // ─── reEnqueueMissedReminders ───────────────────────────────────

  describe('reEnqueueMissedReminders', () => {
    it('should re-enqueue unsent reminders', async () => {
      const missedReminders = [
        makeReminderRow({
          id: 'missed12345678901234567a',
          triggerAt: new Date(Date.now() + 60000),
        }),
        makeReminderRow({
          id: 'missed12345678901234567b',
          triggerAt: new Date(Date.now() + 120000),
        }),
      ];
      (db.query.reminders.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(missedReminders);

      await service.reEnqueueMissedReminders();

      expect(reminderQueue.add).toHaveBeenCalledTimes(2);
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ total: 2, enqueued: 2 }),
        'Re-enqueued missed reminders',
      );
    });

    it('should handle empty missed reminders list', async () => {
      (db.query.reminders.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await service.reEnqueueMissedReminders();

      expect(reminderQueue.add).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('No missed reminders to re-enqueue');
    });

    it('should continue processing when individual re-enqueue fails', async () => {
      const missedReminders = [
        makeReminderRow({
          id: 'missed12345678901234567a',
          triggerAt: new Date(Date.now() + 60000),
        }),
        makeReminderRow({
          id: 'missed12345678901234567b',
          triggerAt: new Date(Date.now() + 120000),
        }),
        makeReminderRow({
          id: 'missed12345678901234567c',
          triggerAt: new Date(Date.now() + 180000),
        }),
      ];
      (db.query.reminders.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(missedReminders);

      // Second call fails
      (reminderQueue.add as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Redis error'))
        .mockResolvedValueOnce(undefined);

      await service.reEnqueueMissedReminders();

      expect(reminderQueue.add).toHaveBeenCalledTimes(3);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ reminderId: 'missed12345678901234567b' }),
        'Failed to re-enqueue reminder',
      );
      // Logs total=3, enqueued=2 (since 1 failed)
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ total: 3, enqueued: 2 }),
        'Re-enqueued missed reminders',
      );
    });

    it('should use delay=0 for reminders with triggerAt in the past', async () => {
      const pastTrigger = new Date(Date.now() - 60000); // 1 minute ago
      const missedReminders = [
        makeReminderRow({ id: 'missed12345678901234567a', triggerAt: pastTrigger }),
      ];
      (db.query.reminders.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(missedReminders);

      await service.reEnqueueMissedReminders();

      expect(reminderQueue.add).toHaveBeenCalledWith(
        'send-reminder',
        expect.any(Object),
        expect.objectContaining({
          jobId: 'missed12345678901234567a',
          delay: 0,
        }),
      );
    });
  });
  // ─── resyncItemReminders ────────────────────────────────────────

  // Regression: `triggerAt` is derived state (SPECS §6.7 —
  // `item start/due - minutesBefore`) but was only ever computed at creation
  // time. Rescheduling an event left its reminder pinned to the old absolute
  // time, while the notification body was rendered from the item's new time.
  describe('resyncItemReminders', () => {
    it('should recompute triggerAt and re-arm the job when the item moves', async () => {
      const reminder = makeReminderRow(); // 15 min before 2026-04-15T10:00:00Z
      (db.query.reminders.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([reminder]);
      const updateChain = mockUpdateChain();
      (reminderQueue.getJob as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const newStart = new Date('2026-04-15T18:00:00Z');
      await service.resyncItemReminders(TEST_USER_ID, 'event', TEST_EVENT_ID, newStart);

      // Stored triggerAt follows the item: 18:00 - 15 min = 17:45.
      expect(updateChain.set).toHaveBeenCalledWith({
        triggerAt: new Date('2026-04-15T17:45:00Z'),
      });

      // And the delayed job is re-armed for the new time.
      expect(reminderQueue.add).toHaveBeenCalledTimes(1);
      const [, , opts] = (reminderQueue.add as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(opts.jobId).toBe(TEST_REMINDER_ID);
      expect(opts.delay).toBe(Math.max(0, new Date('2026-04-15T17:45:00Z').getTime() - Date.now()));
    });

    it('should leave triggerAt alone when the reference time is unchanged', async () => {
      const reminder = makeReminderRow();
      (db.query.reminders.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([reminder]);
      mockUpdateChain();

      await service.resyncItemReminders(TEST_USER_ID, 'event', TEST_EVENT_ID, EVENT_START);

      expect(db.update).not.toHaveBeenCalled();
      expect(reminderQueue.add).not.toHaveBeenCalled();
    });

    it('should not touch reminders that have already been sent', async () => {
      // Already-sent reminders are excluded by the query itself.
      (db.query.reminders.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      mockUpdateChain();

      await service.resyncItemReminders(
        TEST_USER_ID,
        'event',
        TEST_EVENT_ID,
        new Date('2026-04-15T18:00:00Z'),
      );

      expect(db.update).not.toHaveBeenCalled();
      expect(reminderQueue.add).not.toHaveBeenCalled();
    });

    // Regression: removeReminderJob swallowed transient getJob/remove failures and
    // returned void, so the caller carried on to enqueueReminderJob. BullMQ ignores
    // `add` for an id that still exists, so the stale job stayed armed at the OLD
    // trigger time while PostgreSQL held the new one — and because the job id is the
    // reminder id, startup recovery could not replace it either.
    it('should not re-arm the job when clearing the stale one failed', async () => {
      (db.query.reminders.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeReminderRow(),
      ]);
      const updateChain = mockUpdateChain();
      (reminderQueue.getJob as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Redis connection lost'),
      );

      await service.resyncItemReminders(
        TEST_USER_ID,
        'event',
        TEST_EVENT_ID,
        new Date('2026-04-15T18:00:00Z'),
      );

      // The durable state is still corrected...
      expect(updateChain.set).toHaveBeenCalledWith({
        triggerAt: new Date('2026-04-15T17:45:00Z'),
      });

      // ...but no misleading no-op add is issued on top of the surviving job.
      expect(reminderQueue.add).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ reminderId: TEST_REMINDER_ID }),
        'Could not clear the previous reminder job; the queue still holds the old trigger time',
      );
    });

    it('should cancel the queued job when a task loses its due date', async () => {
      const job = { remove: vi.fn().mockResolvedValue(undefined) };
      (reminderQueue.getJob as ReturnType<typeof vi.fn>).mockResolvedValueOnce(job);
      (db.query.reminders.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        makeReminderRow({ itemType: 'task', itemId: TEST_TASK_ID }),
      ]);
      mockUpdateChain();

      await service.resyncItemReminders(TEST_USER_ID, 'task', TEST_TASK_ID, null);

      expect(job.remove).toHaveBeenCalledTimes(1);
      expect(reminderQueue.add).not.toHaveBeenCalled();
    });
  });
});
