import { logger } from '../lib/logger';
import { reminderService } from '../services/reminder.service';
import { scheduleCleanupJob, startCleanupWorker } from './cleanup.job';
import { startReminderWorker } from './reminder.job';

/**
 * Initialize all BullMQ workers and schedule repeatable jobs.
 * Called once during server startup, after Redis is connected.
 */
export async function initializeJobProcessing(): Promise<void> {
  // Start workers
  startReminderWorker();
  startCleanupWorker();
  logger.info('BullMQ workers started');

  // Schedule repeatable jobs
  await scheduleCleanupJob();

  // Re-enqueue any missed reminders from before server restart
  await reminderService.reEnqueueMissedReminders();
}
