import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock modules before importing the job ──────────────────────────

vi.mock('../../db', () => ({
  db: {
    query: {
      events: { findFirst: vi.fn() },
      tasks: { findFirst: vi.fn() },
      reminders: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
    },
    update: vi.fn(),
  },
}));

vi.mock('../../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../lib/queue', () => ({
  QUEUE_NAMES: { REMINDERS: 'reminders', CLEANUP: 'cleanup' },
  bullmqConnection: { host: 'localhost', port: 6379 },
  registerWorker: vi.fn(),
}));

vi.mock('../../lib/email', () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));

vi.mock('../../services/push-subscription.service', () => ({
  pushSubscriptionService: { sendPushToUser: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../services/sse.service', () => ({ sseService: { emit: vi.fn() } }));

import { db } from '../../db';
import { sendEmail } from '../../lib/email';
import { sseService } from '../../services/sse.service';
import { processReminderJob } from '../reminder.job';

// ─── Fixtures ───────────────────────────────────────────────────────

const USER_ID = 'testuser12345678901234567';
const TASK_ID = 'testtask123456789012345678';
const EVENT_ID = 'testevent12345678901234567';
const REMINDER_ID = 'testreminder1234567890123';

function mockUpdateChain() {
  const chain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) };
  (db.update as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

function pendingReminder(overrides: Record<string, unknown> = {}) {
  return {
    id: REMINDER_ID,
    userId: USER_ID,
    itemType: 'task',
    itemId: TASK_ID,
    minutesBefore: 15,
    method: 'email',
    triggerAt: new Date('2026-04-20T13:45:00Z'),
    sentAt: null,
    createdAt: new Date('2026-04-01T00:00:00Z'),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('processReminderJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: 'user@example.com',
    });
  });

  // Regression: getItemInfo used to return null for a task with no dueAt, which
  // the worker could not tell apart from a deleted task — so it stamped sentAt.
  // A reminder retired that way can never be revived, because resyncItemReminders
  // only considers unsent reminders. Clearing a due date and setting it again
  // therefore silently lost the reminder for good.
  it('leaves the reminder unsent when the task has no due date', async () => {
    (db.query.reminders.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(pendingReminder());
    (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      title: 'Write notes',
      dueAt: null,
      deletedAt: null,
    });
    mockUpdateChain();

    await processReminderJob({
      reminderId: REMINDER_ID,
      userId: USER_ID,
      itemType: 'task',
      itemId: TASK_ID,
      method: 'email',
    });

    // Not retired, and nothing delivered.
    expect(db.update).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sseService.emit).not.toHaveBeenCalled();
  });

  it('still retires the reminder when the task is actually deleted', async () => {
    (db.query.reminders.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(pendingReminder());
    (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      title: 'Write notes',
      dueAt: new Date('2026-04-20T14:00:00Z'),
      deletedAt: new Date('2026-04-19T00:00:00Z'),
    });
    const chain = mockUpdateChain();

    await processReminderJob({
      reminderId: REMINDER_ID,
      userId: USER_ID,
      itemType: 'task',
      itemId: TASK_ID,
      method: 'email',
    });

    expect(chain.set).toHaveBeenCalledWith({ sentAt: expect.any(Date) });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('still retires the reminder when the task row is gone', async () => {
    (db.query.reminders.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(pendingReminder());
    (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const chain = mockUpdateChain();

    await processReminderJob({
      reminderId: REMINDER_ID,
      userId: USER_ID,
      itemType: 'task',
      itemId: TASK_ID,
      method: 'email',
    });

    expect(chain.set).toHaveBeenCalledWith({ sentAt: expect.any(Date) });
  });

  it('delivers and marks sent for a task that does have a due date', async () => {
    (db.query.reminders.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(pendingReminder());
    (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      title: 'Write notes',
      dueAt: new Date('2026-04-20T14:00:00Z'),
      deletedAt: null,
    });
    const chain = mockUpdateChain();

    await processReminderJob({
      reminderId: REMINDER_ID,
      userId: USER_ID,
      itemType: 'task',
      itemId: TASK_ID,
      method: 'email',
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sseService.emit).toHaveBeenCalledWith(USER_ID, 'reminder:fired', expect.any(Object));
    expect(chain.set).toHaveBeenCalledWith({ sentAt: expect.any(Date) });
  });

  it('delivers for an event, whose startAt is always present', async () => {
    (db.query.reminders.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      pendingReminder({ itemType: 'event', itemId: EVENT_ID }),
    );
    (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      title: 'Standup',
      startAt: new Date('2026-04-15T10:00:00Z'),
      deletedAt: null,
    });
    const chain = mockUpdateChain();

    await processReminderJob({
      reminderId: REMINDER_ID,
      userId: USER_ID,
      itemType: 'event',
      itemId: EVENT_ID,
      method: 'email',
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(chain.set).toHaveBeenCalledWith({ sentAt: expect.any(Date) });
  });

  it('skips a reminder that was already sent', async () => {
    (db.query.reminders.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    mockUpdateChain();

    await processReminderJob({
      reminderId: REMINDER_ID,
      userId: USER_ID,
      itemType: 'task',
      itemId: TASK_ID,
      method: 'email',
    });

    expect(db.update).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
