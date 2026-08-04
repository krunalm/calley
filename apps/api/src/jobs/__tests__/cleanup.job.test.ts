import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock modules before importing the job ──────────────────────────

vi.mock('../../db', () => ({
  db: {
    delete: vi.fn(),
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

vi.mock('../../lib/queue', () => ({
  QUEUE_NAMES: { REMINDERS: 'reminders', CLEANUP: 'cleanup' },
  bullmqConnection: { host: 'localhost', port: 6379 },
  registerWorker: vi.fn(),
  cleanupQueue: {
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    getJobSchedulers: vi.fn().mockResolvedValue([]),
    removeJobScheduler: vi.fn().mockResolvedValue(true),
  },
}));

import { cleanupQueue } from '../../lib/queue';
import { scheduleCleanupJob } from '../cleanup.job';

// ─── Tests ──────────────────────────────────────────────────────────

describe('scheduleCleanupJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cleanupQueue.getJobSchedulers).mockResolvedValue([]);
  });

  it('registers a daily 3:00 AM UTC job scheduler', async () => {
    await scheduleCleanupJob();

    expect(cleanupQueue.upsertJobScheduler).toHaveBeenCalledWith(
      'daily-cleanup',
      { pattern: '0 3 * * *', tz: 'UTC' },
      { name: 'daily-cleanup' },
    );
  });

  it('removes schedulers left behind by an earlier BullMQ version', async () => {
    vi.mocked(cleanupQueue.getJobSchedulers).mockResolvedValue([
      { key: 'legacy-repeat:cleanup:0 3 * * *', name: 'daily-cleanup' },
      { key: 'daily-cleanup', name: 'daily-cleanup' },
    ]);

    await scheduleCleanupJob();

    expect(cleanupQueue.removeJobScheduler).toHaveBeenCalledTimes(1);
    expect(cleanupQueue.removeJobScheduler).toHaveBeenCalledWith('legacy-repeat:cleanup:0 3 * * *');
  });

  it('keeps the schedule when pruning stale schedulers fails', async () => {
    vi.mocked(cleanupQueue.getJobSchedulers).mockRejectedValue(new Error('redis unavailable'));

    await expect(scheduleCleanupJob()).resolves.toBeUndefined();
    expect(cleanupQueue.upsertJobScheduler).toHaveBeenCalledOnce();
  });
});
