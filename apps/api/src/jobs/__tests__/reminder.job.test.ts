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
import { pushSubscriptionService } from '../../services/push-subscription.service';
import { sseService } from '../../services/sse.service';
import { processReminderJob } from '../reminder.job';

// ─── Fixtures ───────────────────────────────────────────────────────

const USER_ID = 'testuser12345678901234567';
const TASK_ID = 'testtask123456789012345678';
const EVENT_ID = 'testevent12345678901234567';
const REMINDER_ID = 'testreminder1234567890123';

/**
 * The atomic claim is `update(reminders).set({sentAt}).where(...).returning()`.
 * What the mock resolves controls whether the caller "won" the claim.
 */
function mockClaim(result: unknown[]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
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

function jobPayload(method: 'email' | 'push' | 'both' = 'email') {
  return {
    reminderId: REMINDER_ID,
    userId: USER_ID,
    itemType: 'task' as const,
    itemId: TASK_ID,
    method,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('processReminderJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: 'user@example.com',
      timezone: 'America/New_York',
    });
  });

  // Regression: getItemInfo used to return null for a task with no dueAt, which
  // the worker could not tell apart from a deleted task — so it stamped sentAt.
  // A reminder retired that way can never be revived, because resyncItemReminders
  // only considers unsent reminders. Clearing a due date and setting it again
  // therefore silently lost the reminder for good.
  it('releases the claim when the task has no due date', async () => {
    const chain = mockClaim([pendingReminder()]);
    (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      title: 'Write notes',
      dueAt: null,
      deletedAt: null,
    });

    await processReminderJob(jobPayload());

    // Claimed, then handed back — the reminder stays pending.
    expect(chain.set).toHaveBeenCalledWith({ sentAt: expect.any(Date) });
    expect(chain.set).toHaveBeenCalledWith({ sentAt: null });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sseService.emit).not.toHaveBeenCalled();
  });

  it('keeps the claim when the task is actually deleted', async () => {
    const chain = mockClaim([pendingReminder()]);
    (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      title: 'Write notes',
      dueAt: new Date('2026-04-20T14:00:00Z'),
      deletedAt: new Date('2026-04-19T00:00:00Z'),
    });

    await processReminderJob(jobPayload());

    expect(chain.set).toHaveBeenCalledWith({ sentAt: expect.any(Date) });
    expect(chain.set).not.toHaveBeenCalledWith({ sentAt: null });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('keeps the claim when the task row is gone', async () => {
    const chain = mockClaim([pendingReminder()]);
    (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await processReminderJob(jobPayload());

    expect(chain.set).toHaveBeenCalledWith({ sentAt: expect.any(Date) });
    expect(chain.set).not.toHaveBeenCalledWith({ sentAt: null });
  });

  it('delivers for a task that does have a due date', async () => {
    const chain = mockClaim([pendingReminder()]);
    (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      title: 'Write notes',
      dueAt: new Date('2026-04-20T14:00:00Z'),
      deletedAt: null,
    });

    await processReminderJob(jobPayload());

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sseService.emit).toHaveBeenCalledWith(USER_ID, 'reminder:fired', expect.any(Object));
    // The claim already marked the reminder sent — no second write.
    expect(chain.set).toHaveBeenCalledTimes(1);
    expect(chain.set).toHaveBeenCalledWith({ sentAt: expect.any(Date) });
  });

  it('delivers for an event, whose startAt is always present', async () => {
    const chain = mockClaim([pendingReminder({ itemType: 'event', itemId: EVENT_ID })]);
    (db.query.events.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      title: 'Standup',
      startAt: new Date('2026-04-15T10:00:00Z'),
      deletedAt: null,
    });

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

  // The claim is the whole defense against double delivery: two workers seeing
  // the same unsent reminder (duplicate jobs after a restart, a stalled job
  // retried) previously both delivered, because the read-then-send-then-mark
  // flow only checked sentAt *before* either had written it.
  it('does not deliver when another worker already claimed the reminder', async () => {
    mockClaim([]); // the conditional update matched no unsent row

    await processReminderJob(jobPayload());

    expect(sendEmail).not.toHaveBeenCalled();
    expect(pushSubscriptionService.sendPushToUser).not.toHaveBeenCalled();
    expect(sseService.emit).not.toHaveBeenCalled();
  });

  it('releases the claim and rethrows when delivery fails, so the job retries', async () => {
    const chain = mockClaim([pendingReminder()]);
    (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      title: 'Write notes',
      dueAt: new Date('2026-04-20T14:00:00Z'),
      deletedAt: null,
    });
    (sendEmail as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('SMTP down'));

    await expect(processReminderJob(jobPayload())).rejects.toThrow('SMTP down');

    expect(chain.set).toHaveBeenCalledWith({ sentAt: null });
    expect(sseService.emit).not.toHaveBeenCalled();
  });

  // Regression: emails formatted the UTC instant with the server's local zone
  // (UTC in every deployed container). A 23:30 UTC reminder read "7:30 PM" and
  // deep-linked to the wrong calendar day for anyone outside UTC.
  it('formats delivery text and deep links in the user timezone', async () => {
    mockClaim([pendingReminder()]);
    (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      title: 'Write notes',
      // 2026-04-20 14:00 UTC is 10:00 AM in America/New_York
      dueAt: new Date('2026-04-20T14:00:00Z'),
      deletedAt: null,
    });

    await processReminderJob(jobPayload());

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Reminder: Write notes',
      }),
    );

    const { html } = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      html: string;
    };
    expect(html).toContain('10:00 AM');
    expect(html).toContain('date=2026-04-20');
  });

  it('sends both channels when method is both', async () => {
    mockClaim([pendingReminder({ method: 'both' })]);
    (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      title: 'Write notes',
      dueAt: new Date('2026-04-20T14:00:00Z'),
      deletedAt: null,
    });

    await processReminderJob(jobPayload('both'));

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(pushSubscriptionService.sendPushToUser).toHaveBeenCalledTimes(1);
  });
});
