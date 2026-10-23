import { and, eq, gte, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';

import { db } from '../db';
import { calendarCategories, reminders, tasks } from '../db/schema';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { reminderQueue } from '../lib/queue';
import { sanitizeHtml } from '../lib/sanitize';
import { recurrenceService } from './recurrence.service';
import { reminderService } from './reminder.service';
import { sseService } from './sse.service';

import type { CreateTaskInput, EditScope, ListTasksQuery, UpdateTaskInput } from '@calley/shared';

// ─── Types ──────────────────────────────────────────────────────────

interface TaskRow {
  id: string;
  userId: string;
  categoryId: string;
  title: string;
  description: string | null;
  dueAt: Date | null;
  priority: string;
  status: string;
  completedAt: Date | null;
  rrule: string | null;
  exDates: Date[] | null;
  recurringTaskId: string | null;
  originalDate: Date | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface TaskResponse {
  id: string;
  userId: string;
  categoryId: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  priority: string;
  status: string;
  completedAt: string | null;
  rrule: string | null;
  exDates: string[];
  recurringTaskId: string | null;
  originalDate: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────

function toTaskResponse(row: TaskRow): TaskResponse {
  return {
    id: row.id,
    userId: row.userId,
    categoryId: row.categoryId,
    title: row.title,
    description: row.description,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    priority: row.priority,
    status: row.status,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    rrule: row.rrule,
    exDates: (row.exDates ?? []).map((d) => d.toISOString()),
    recurringTaskId: row.recurringTaskId,
    originalDate: row.originalDate ? row.originalDate.toISOString() : null,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

// ─── Constants ─────────────────────────────────────────────────────

/** Maximum number of exDates a recurring task can accumulate. */
const MAX_EX_DATES = 500;

/**
 * Hard ceiling on a single task listing.
 *
 * The endpoint has no pagination, so without a limit one account with a large
 * backlog serialises its entire task table into a single response on every
 * poll. The panel virtualises well below this.
 */
const MAX_TASKS_PER_LIST = 1000;

// ─── Sorting ────────────────────────────────────────────────────────

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

/**
 * Sort merged task rows in JS, mirroring the SQL orderings the endpoint used
 * to get from a single query.
 *
 * listTasks now runs two queries — point rows (one-offs and per-instance
 * exceptions, which take due-date filters directly) and recurring parents
 * (which must not, since their anchor date says nothing about which occurrences
 * land in the window) — so the database can no longer order the combined
 * result. Null due dates sort last under 'due_at', matching Postgres ASC.
 */
function sortTaskResponses(rows: TaskResponse[], sort: ListTasksQuery['sort']): TaskResponse[] {
  const byId = (a: TaskResponse, b: TaskResponse) => a.id.localeCompare(b.id);
  const bySortOrder = (a: TaskResponse, b: TaskResponse) => a.sortOrder - b.sortOrder;
  const byCreatedAtAsc = (a: TaskResponse, b: TaskResponse) =>
    a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? -1 : 1;
  const byCreatedAtDesc = (a: TaskResponse, b: TaskResponse) =>
    a.createdAt === b.createdAt ? 0 : a.createdAt > b.createdAt ? -1 : 1;
  const byDueAt = (a: TaskResponse, b: TaskResponse) => {
    if (a.dueAt === b.dueAt) return 0;
    if (a.dueAt === null) return 1;
    if (b.dueAt === null) return -1;
    return a.dueAt < b.dueAt ? -1 : 1;
  };

  switch (sort) {
    case 'due_at':
      return rows.sort((a, b) => byDueAt(a, b) || bySortOrder(a, b) || byId(a, b));
    case 'priority':
      return rows.sort(
        (a, b) =>
          (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3) ||
          bySortOrder(a, b) ||
          byId(a, b),
      );
    case 'created_at':
      return rows.sort((a, b) => byCreatedAtDesc(a, b) || byId(a, b) * -1);
    case 'sort_order':
    default:
      return rows.sort((a, b) => bySortOrder(a, b) || byCreatedAtAsc(a, b) || byId(a, b));
  }
}

// ─── Service ────────────────────────────────────────────────────────

export class TaskService {
  /**
   * List tasks for a user with optional filters.
   * Supports filtering by status, priority, due date range, and sorting.
   *
   * Two row kinds behave differently under a due-date filter and cannot share
   * one query:
   *
   * - Point rows — one-off tasks and per-instance exception rows (the rows
   *   `updateTask` with scope 'instance' creates). Their own dueAt is the
   *   whole story, so the filter applies directly. Exceptions are listed as
   *   standalone tasks: without them every single-instance edit vanished from
   *   every listing, which is how "edit this occurrence" used to make the
   *   task disappear.
   *
   * - Recurring parents. A parent whose anchor date is outside the window can
   *   still generate occurrences inside it (and vice versa), so parents are
   *   fetched without a due filter and, when a window was requested, expanded
   *   into instances within it. Without a window the parent is returned as-is
   *   (the task panel shows a series once, at its anchor date).
   */
  async listTasks(userId: string, filters: ListTasksQuery): Promise<TaskResponse[]> {
    const commonConditions = [eq(tasks.userId, userId), isNull(tasks.deletedAt)];

    if (filters.status && filters.status.length > 0) {
      commonConditions.push(inArray(tasks.status, filters.status));
    }

    if (filters.priority && filters.priority.length > 0) {
      commonConditions.push(inArray(tasks.priority, filters.priority));
    }

    // Point rows: one-offs and exceptions — rrule is null on both.
    const pointConditions = [...commonConditions, isNull(tasks.rrule)];
    if (filters.dueStart) {
      pointConditions.push(gte(tasks.dueAt, new Date(filters.dueStart)));
    }
    if (filters.dueEnd) {
      // Half-open [dueStart, dueEnd), matching the event listing boundaries so
      // adjacent calendar windows neither double-report nor drop a task due
      // exactly on the seam.
      pointConditions.push(lt(tasks.dueAt, new Date(filters.dueEnd)));
    }

    // Recurring parents only — exceptions are fetched as point rows.
    const parentConditions = [
      ...commonConditions,
      isNotNull(tasks.rrule),
      isNull(tasks.recurringTaskId),
    ];

    const [pointRows, parentRows] = await Promise.all([
      db.query.tasks.findMany({
        where: and(...pointConditions),
        limit: MAX_TASKS_PER_LIST,
      }),
      db.query.tasks.findMany({
        where: and(...parentConditions),
        limit: MAX_TASKS_PER_LIST,
      }),
    ]);

    const hasDueRange = !!filters.dueStart || !!filters.dueEnd;

    let parentResults: TaskResponse[];
    if (hasDueRange) {
      // A missing bound is open-ended; the per-response expansion budget caps
      // the work an open window can cause.
      const start = filters.dueStart ?? new Date(0).toISOString();
      const end = filters.dueEnd ?? '9999-01-01T00:00:00.000Z';

      const expanded = recurrenceService.expandRecurringTasks(
        parentRows.map((t) => toTaskResponse(t as TaskRow)),
        start,
        end,
      );

      // Recast: expanded instances carry isRecurringInstance/instanceDate at
      // runtime, exactly like recurring event instances do.
      parentResults = expanded as TaskResponse[];
    } else {
      parentResults = parentRows.map((t) => toTaskResponse(t as TaskRow));
    }

    const merged = [...pointRows.map((t) => toTaskResponse(t as TaskRow)), ...parentResults];

    return sortTaskResponses(merged, filters.sort).slice(0, MAX_TASKS_PER_LIST);
  }

  /**
   * Get a single task by ID with ownership check.
   */
  async getTask(userId: string, taskId: string): Promise<TaskResponse> {
    const task = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)),
    });

    if (!task) {
      throw new AppError(404, 'NOT_FOUND', 'Task not found');
    }

    return toTaskResponse(task as TaskRow);
  }

  /**
   * Create a new task.
   * Optionally creates a reminder if specified.
   */
  async createTask(userId: string, data: CreateTaskInput): Promise<TaskResponse> {
    // Validate category belongs to user
    await this.validateCategory(userId, data.categoryId);

    // Sanitize description HTML if present
    const description = data.description ? sanitizeHtml(data.description) : null;

    // Validate RRULE if provided
    if (data.rrule) {
      this.validateRrule(data.rrule);
    }

    const task = await db.transaction(async (tx) => {
      // Get the max sortOrder for this user's tasks
      const maxSortResult = await tx
        .select({ maxSort: sql<number>`COALESCE(MAX(${tasks.sortOrder}), -1)` })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt)));

      const nextSortOrder = (maxSortResult[0]?.maxSort ?? -1) + 1;

      const [inserted] = await tx
        .insert(tasks)
        .values({
          userId,
          categoryId: data.categoryId,
          title: data.title,
          description,
          dueAt: data.dueAt ? new Date(data.dueAt) : null,
          priority: data.priority ?? 'none',
          rrule: data.rrule ?? null,
          sortOrder: nextSortOrder,
        })
        .returning();

      // Create reminder if specified
      let inlineReminder: typeof reminders.$inferSelect | null = null;
      if (data.reminder && data.dueAt) {
        const triggerAt = new Date(
          new Date(data.dueAt).getTime() - data.reminder.minutesBefore * 60 * 1000,
        );

        const [created] = await tx
          .insert(reminders)
          .values({
            userId,
            itemType: 'task',
            itemId: inserted.id,
            minutesBefore: data.reminder.minutesBefore,
            method: data.reminder.method,
            triggerAt,
          })
          .returning();
        inlineReminder = created;
      }

      return { inserted, inlineReminder };
    });

    // Enqueue BullMQ job for the inline reminder (outside transaction)
    if (task.inlineReminder) {
      try {
        await reminderQueue.add(
          'send-reminder',
          {
            reminderId: task.inlineReminder.id,
            userId,
            itemType: 'task',
            itemId: task.inserted.id,
            method: task.inlineReminder.method,
          },
          {
            jobId: task.inlineReminder.id,
            delay: Math.max(0, task.inlineReminder.triggerAt.getTime() - Date.now()),
          },
        );
      } catch (err) {
        logger.warn(
          { err, reminderId: task.inlineReminder.id },
          'Failed to enqueue inline reminder job',
        );
      }
    }

    logger.info({ userId, taskId: task.inserted.id }, 'Task created');

    const response = toTaskResponse(task.inserted as TaskRow);

    sseService.emit(userId, 'task:created', {
      id: response.id,
      title: response.title,
      dueAt: response.dueAt,
      status: response.status,
    });

    return response;
  }

  /**
   * Update a task. For recurring tasks, the `scope` parameter determines
   * how the edit is applied (same pattern as events).
   */
  async updateTask(
    userId: string,
    taskId: string,
    data: UpdateTaskInput,
    scope?: EditScope,
    instanceDate?: string,
  ): Promise<TaskResponse> {
    const task = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)),
    });

    if (!task) {
      throw new AppError(404, 'NOT_FOUND', 'Task not found');
    }

    // Validate category if being changed
    if (data.categoryId) {
      await this.validateCategory(userId, data.categoryId);
    }

    // Sanitize description if provided
    const sanitizedData = { ...data };
    if (sanitizedData.description !== undefined && sanitizedData.description !== null) {
      sanitizedData.description = sanitizeHtml(sanitizedData.description);
    }

    // Validate RRULE if provided
    if (sanitizedData.rrule !== undefined && sanitizedData.rrule !== null) {
      this.validateRrule(sanitizedData.rrule);
    }

    const isRecurring = task.rrule !== null;

    // Non-recurring task or no scope specified: direct update
    if (!isRecurring || !scope) {
      return this.directUpdate(userId, taskId, sanitizedData);
    }

    // Recurring task with scope
    switch (scope) {
      case 'instance':
        return this.updateInstance(userId, task as TaskRow, sanitizedData, instanceDate);
      case 'following':
        return this.updateFollowing(userId, task as TaskRow, sanitizedData, instanceDate);
      case 'all':
        return this.directUpdate(userId, taskId, sanitizedData);
      default:
        throw new AppError(400, 'VALIDATION_ERROR', `Invalid scope: ${scope}`);
    }
  }

  /**
   * Delete a task. For recurring tasks, the `scope` parameter determines
   * how the deletion is applied.
   */
  async deleteTask(
    userId: string,
    taskId: string,
    scope?: EditScope,
    instanceDate?: string,
  ): Promise<void> {
    const task = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)),
    });

    if (!task) {
      throw new AppError(404, 'NOT_FOUND', 'Task not found');
    }

    const isRecurring = task.rrule !== null;

    // Non-recurring or no scope: simple soft delete
    if (!isRecurring || !scope) {
      await this.softDelete(userId, taskId);
      logger.info({ userId, taskId }, 'Task deleted');
      sseService.emit(userId, 'task:deleted', { id: taskId });
      return;
    }

    switch (scope) {
      case 'instance':
        await this.deleteInstance(userId, task as TaskRow, instanceDate);
        break;
      case 'following':
        await this.deleteFollowing(userId, task as TaskRow, instanceDate);
        break;
      case 'all':
        await this.deleteAll(userId, taskId);
        break;
      default:
        throw new AppError(400, 'VALIDATION_ERROR', `Invalid scope: ${scope}`);
    }

    logger.info({ userId, taskId, scope }, 'Task deleted');
    sseService.emit(userId, 'task:deleted', { id: taskId, scope });
  }

  /**
   * Toggle task completion status (todo ↔ done).
   * Sets or clears completedAt accordingly.
   */
  async toggleTask(userId: string, taskId: string): Promise<TaskResponse> {
    const task = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)),
    });

    if (!task) {
      throw new AppError(404, 'NOT_FOUND', 'Task not found');
    }

    const isDone = task.status === 'done';
    const newStatus = isDone ? 'todo' : 'done';
    const newCompletedAt = isDone ? null : new Date();

    const [updated] = await db
      .update(tasks)
      .set({
        status: newStatus,
        completedAt: newCompletedAt,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
      .returning();

    if (!updated) {
      throw new AppError(404, 'NOT_FOUND', 'Task not found');
    }

    logger.info({ userId, taskId, newStatus }, 'Task toggled');

    const response = toTaskResponse(updated as TaskRow);

    sseService.emit(userId, 'task:updated', {
      id: response.id,
      status: response.status,
      completedAt: response.completedAt,
    });

    return response;
  }

  /**
   * Reorder tasks by updating sortOrder for each task ID in order.
   */
  async reorderTasks(userId: string, ids: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (let i = 0; i < ids.length; i++) {
        await tx
          .update(tasks)
          .set({ sortOrder: i, updatedAt: new Date() })
          .where(and(eq(tasks.id, ids[i]), eq(tasks.userId, userId), isNull(tasks.deletedAt)));
      }
    });

    logger.info({ userId, count: ids.length }, 'Tasks reordered');
  }

  /**
   * Bulk complete tasks — marks all specified tasks as done.
   */
  async bulkComplete(userId: string, ids: string[]): Promise<number> {
    const now = new Date();
    const result = await db
      .update(tasks)
      .set({
        status: 'done',
        completedAt: now,
        updatedAt: now,
      })
      .where(and(inArray(tasks.id, ids), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
      .returning({ id: tasks.id });

    logger.info({ userId, count: result.length }, 'Tasks bulk completed');
    return result.length;
  }

  /**
   * Bulk delete tasks — soft deletes all specified tasks.
   */
  async bulkDelete(userId: string, ids: string[]): Promise<number> {
    const now = new Date();
    const result = await db
      .update(tasks)
      .set({ deletedAt: now })
      .where(and(inArray(tasks.id, ids), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
      .returning({ id: tasks.id });

    logger.info({ userId, count: result.length }, 'Tasks bulk deleted');
    return result.length;
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  /**
   * Validate that a category belongs to the user.
   */
  private async validateCategory(userId: string, categoryId: string): Promise<void> {
    const category = await db.query.calendarCategories.findFirst({
      where: and(eq(calendarCategories.id, categoryId), eq(calendarCategories.userId, userId)),
    });

    if (!category) {
      throw new AppError(404, 'NOT_FOUND', 'Category not found');
    }
  }

  /**
   * RRULE validation using the recurrence service.
   */
  private validateRrule(rrule: string): void {
    recurrenceService.validateRrule(rrule);
  }

  /**
   * Direct update of a task (non-recurring or scope='all').
   */
  private async directUpdate(
    userId: string,
    taskId: string,
    data: UpdateTaskInput,
  ): Promise<TaskResponse> {
    const setValues: Record<string, unknown> = { updatedAt: new Date() };

    if (data.title !== undefined) setValues.title = data.title;
    if (data.description !== undefined) setValues.description = data.description;
    if (data.dueAt !== undefined) setValues.dueAt = data.dueAt ? new Date(data.dueAt) : null;
    if (data.priority !== undefined) setValues.priority = data.priority;
    if (data.status !== undefined) {
      setValues.status = data.status;
      // Auto-set completedAt when status changes
      if (data.status === 'done') {
        setValues.completedAt = new Date();
      } else {
        setValues.completedAt = null;
      }
    }
    if (data.categoryId !== undefined) setValues.categoryId = data.categoryId;
    if (data.rrule !== undefined) setValues.rrule = data.rrule;

    const [updated] = await db
      .update(tasks)
      .set(setValues)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
      .returning();

    if (!updated) {
      throw new AppError(404, 'NOT_FOUND', 'Task not found');
    }

    // Reminders are anchored to dueAt, so a reschedule has to move them too.
    if (data.dueAt !== undefined) {
      await reminderService.resyncItemReminders(userId, 'task', taskId, updated.dueAt);
    }

    logger.info({ userId, taskId }, 'Task updated');

    const response = toTaskResponse(updated as TaskRow);

    sseService.emit(userId, 'task:updated', { id: response.id, ...data });

    return response;
  }

  /**
   * Edit a single instance of a recurring task.
   * Creates an exception record (new task linked to parent via recurringTaskId).
   */
  private async updateInstance(
    userId: string,
    parentTask: TaskRow,
    data: UpdateTaskInput,
    instanceDate?: string,
  ): Promise<TaskResponse> {
    if (!instanceDate) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'instanceDate is required when editing a single instance',
      );
    }

    const origDate = new Date(instanceDate);
    origDate.setMilliseconds(0);

    // The occurrence's own date — not the series' anchor date — is the default
    // due date for the exception. Before this, editing the March 19 occurrence
    // without touching the due field silently rescheduled it to the series'
    // first due date, so "edit this occurrence" made the task move.
    const instanceDueAt = parentTask.dueAt ? origDate : null;

    const result = await db.transaction(async (tx) => {
      // Add instance date to parent's exDates
      const currentExDates = (parentTask.exDates as Date[] | null) ?? [];
      if (currentExDates.length >= MAX_EX_DATES) {
        throw new AppError(
          422,
          'VALIDATION_ERROR',
          'Too many excluded dates on this recurring task. Consider deleting the series and creating a new one.',
        );
      }
      const newExDates = [...currentExDates, origDate];

      await tx
        .update(tasks)
        .set({ exDates: newExDates, updatedAt: new Date() })
        .where(and(eq(tasks.id, parentTask.id), eq(tasks.userId, userId), isNull(tasks.deletedAt)));

      // Create exception record as a new task
      const [exception] = await tx
        .insert(tasks)
        .values({
          userId,
          categoryId: data.categoryId ?? parentTask.categoryId,
          title: data.title ?? parentTask.title,
          description: data.description !== undefined ? data.description : parentTask.description,
          dueAt:
            data.dueAt !== undefined ? (data.dueAt ? new Date(data.dueAt) : null) : instanceDueAt,
          priority: data.priority ?? parentTask.priority,
          status: data.status ?? parentTask.status,
          recurringTaskId: parentTask.id,
          originalDate: origDate,
          sortOrder: parentTask.sortOrder,
        })
        .returning();

      return exception;
    });

    logger.info(
      { userId, parentTaskId: parentTask.id, exceptionId: result.id, instanceDate },
      'Recurring task instance updated (exception)',
    );

    return toTaskResponse(result as TaskRow);
  }

  /**
   * Edit this and all following instances of a recurring task.
   * Splits the series: original ends before instanceDate, new starts from instanceDate.
   */
  private async updateFollowing(
    userId: string,
    parentTask: TaskRow,
    data: UpdateTaskInput,
    instanceDate?: string,
  ): Promise<TaskResponse> {
    if (!instanceDate) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'instanceDate is required when editing following instances',
      );
    }

    const splitDate = new Date(instanceDate);

    // Terminate the original series just before the split date, and compute the
    // tail's rule with the occurrence budget the original had left — a
    // verbatim copy would restart a `COUNT=N` counter and resurrect occurrences
    // the original series had already consumed.
    const { head: updatedRrule, tail: tailRrule } = recurrenceService.splitSeriesAt(
      parentTask.rrule!,
      parentTask.dueAt ?? splitDate,
      splitDate,
    );

    if (tailRrule === null) {
      throw new AppError(
        422,
        'VALIDATION_ERROR',
        'This series has no occurrences on or after the selected date',
      );
    }

    // Everything the user already did to the tail of the series has to move to
    // the new series. The old parent stops generating occurrences at UNTIL, so
    // a future exclusion or exception left behind on it is dead state: a
    // deleted occurrence would reappear under the new series, and an edited one
    // would silently revert to the series defaults. This mirrors the event
    // service's split.
    const splitMs = splitDate.getTime();
    const parentExDates = (parentTask.exDates as Date[] | null) ?? [];
    const retainedExDates = parentExDates.filter((d) => d.getTime() < splitMs);
    const migratedExDates = parentExDates.filter((d) => d.getTime() >= splitMs);

    // The new series starts at the split occurrence — not at the original
    // series' anchor date — unless the edit explicitly moves the due date.
    // `instanceDate` is the occurrence's own datetime, which already carries
    // the series' time-of-day.
    const newDueAt =
      data.dueAt !== undefined
        ? data.dueAt
          ? new Date(data.dueAt)
          : null
        : parentTask.dueAt
          ? new Date(splitDate)
          : null;

    const result = await db.transaction(async (tx) => {
      await tx
        .update(tasks)
        .set({ rrule: updatedRrule, exDates: retainedExDates, updatedAt: new Date() })
        .where(
          and(
            eq(tasks.id, parentTask.id),
            eq(tasks.userId, parentTask.userId),
            isNull(tasks.deletedAt),
          ),
        );

      // Create new series with updated fields
      const [newSeries] = await tx
        .insert(tasks)
        .values({
          userId,
          categoryId: data.categoryId ?? parentTask.categoryId,
          title: data.title ?? parentTask.title,
          description: data.description !== undefined ? data.description : parentTask.description,
          dueAt: newDueAt,
          priority: data.priority ?? parentTask.priority,
          status: data.status ?? parentTask.status,
          rrule: data.rrule !== undefined ? data.rrule : tailRrule,
          exDates: migratedExDates,
          sortOrder: parentTask.sortOrder,
        })
        .returning();

      // Re-point future exception rows at the new series so the edits they
      // carry keep applying to the occurrences they replaced.
      await tx
        .update(tasks)
        .set({ recurringTaskId: newSeries.id, updatedAt: new Date() })
        .where(
          and(
            eq(tasks.recurringTaskId, parentTask.id),
            eq(tasks.userId, userId),
            isNull(tasks.deletedAt),
            gte(tasks.originalDate, splitDate),
          ),
        );

      return newSeries;
    });

    logger.info(
      { userId, parentTaskId: parentTask.id, newSeriesId: result.id, instanceDate },
      'Recurring task series split',
    );

    return toTaskResponse(result as TaskRow);
  }

  /**
   * Soft delete a single task.
   */
  private async softDelete(userId: string, taskId: string): Promise<void> {
    await db
      .update(tasks)
      .set({ deletedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)));
  }

  /**
   * Delete a single instance of a recurring task.
   * Adds the instance date to the parent's exDates.
   */
  private async deleteInstance(
    userId: string,
    task: TaskRow,
    instanceDate?: string,
  ): Promise<void> {
    if (!instanceDate) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'instanceDate is required when deleting a single instance',
      );
    }

    const origDate = new Date(instanceDate);
    const parentId = task.recurringTaskId ?? task.id;

    await db.transaction(async (tx) => {
      // Soft-delete any exception for this instance
      await tx
        .update(tasks)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(tasks.recurringTaskId, parentId),
            eq(tasks.userId, userId),
            eq(tasks.originalDate, origDate),
            isNull(tasks.deletedAt),
          ),
        );

      // Add to parent's exDates
      const parent = await tx.query.tasks.findFirst({
        where: and(eq(tasks.id, parentId), eq(tasks.userId, userId), isNull(tasks.deletedAt)),
      });

      if (parent) {
        const currentExDates = (parent.exDates as Date[] | null) ?? [];
        if (currentExDates.length >= MAX_EX_DATES) {
          throw new AppError(
            422,
            'VALIDATION_ERROR',
            'Too many excluded dates on this recurring task. Consider deleting the series and creating a new one.',
          );
        }
        const newExDates = [...currentExDates, origDate];

        await tx
          .update(tasks)
          .set({ exDates: newExDates, updatedAt: new Date() })
          .where(and(eq(tasks.id, parentId), eq(tasks.userId, userId), isNull(tasks.deletedAt)));
      }
    });
  }

  /**
   * Delete this and all following instances of a recurring task.
   * Sets UNTIL on the parent's RRULE to end before instanceDate.
   */
  private async deleteFollowing(
    userId: string,
    task: TaskRow,
    instanceDate?: string,
  ): Promise<void> {
    if (!instanceDate) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'instanceDate is required when deleting following instances',
      );
    }

    const splitDate = new Date(instanceDate);
    const parentId = task.recurringTaskId ?? task.id;

    await db.transaction(async (tx) => {
      const parent = await tx.query.tasks.findFirst({
        where: and(eq(tasks.id, parentId), eq(tasks.userId, userId), isNull(tasks.deletedAt)),
      });

      if (!parent || !parent.rrule) return;

      const updatedRrule = recurrenceService.terminateSeriesAt(parent.rrule, splitDate);

      await tx
        .update(tasks)
        .set({ rrule: updatedRrule, updatedAt: new Date() })
        .where(and(eq(tasks.id, parentId), eq(tasks.userId, userId), isNull(tasks.deletedAt)));

      // Soft delete exception records for dates >= instanceDate
      await tx
        .update(tasks)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(tasks.recurringTaskId, parentId),
            eq(tasks.userId, userId),
            isNull(tasks.deletedAt),
            gte(tasks.originalDate, splitDate),
          ),
        );
    });
  }

  /**
   * Delete all instances of a recurring task.
   * Soft deletes the parent and all exception records.
   */
  private async deleteAll(userId: string, taskId: string): Promise<void> {
    const now = new Date();

    await db.transaction(async (tx) => {
      // Soft delete all exception records
      await tx
        .update(tasks)
        .set({ deletedAt: now })
        .where(
          and(eq(tasks.recurringTaskId, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)),
        );

      // Soft delete the parent task
      await tx
        .update(tasks)
        .set({ deletedAt: now })
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)));
    });
  }
}

export const taskService = new TaskService();
