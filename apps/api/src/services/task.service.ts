import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';

import { db } from '../db';
import { calendarCategories, reminders, tasks } from '../db/schema';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { reminderQueue } from '../lib/queue';
import { recurrenceService } from './recurrence.service';

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

// ─── Service ────────────────────────────────────────────────────────

export class TaskService {
  /**
   * List tasks for a user with optional filters.
   * Supports filtering by status, priority, due date range, and sorting.
   */
  async listTasks(userId: string, filters: ListTasksQuery): Promise<TaskResponse[]> {
    const conditions = [
      eq(tasks.userId, userId),
      isNull(tasks.deletedAt),
      isNull(tasks.recurringTaskId), // Exclude exception instances from top-level listing
    ];

    if (filters.status && filters.status.length > 0) {
      conditions.push(inArray(tasks.status, filters.status));
    }

    if (filters.priority && filters.priority.length > 0) {
      conditions.push(inArray(tasks.priority, filters.priority));
    }

    if (filters.dueStart) {
      conditions.push(gte(tasks.dueAt, new Date(filters.dueStart)));
    }

    if (filters.dueEnd) {
      conditions.push(lte(tasks.dueAt, new Date(filters.dueEnd)));
    }

    // Determine sort order
    let orderBy;
    switch (filters.sort) {
      case 'due_at':
        orderBy = [asc(tasks.dueAt), asc(tasks.sortOrder)];
        break;
      case 'priority': {
        // Custom priority ordering: high > medium > low > none
        const priorityOrder = sql`CASE ${tasks.priority}
          WHEN 'high' THEN 0
          WHEN 'medium' THEN 1
          WHEN 'low' THEN 2
          ELSE 3
        END`;
        orderBy = [asc(priorityOrder), asc(tasks.sortOrder)];
        break;
      }
      case 'created_at':
        orderBy = [desc(tasks.createdAt)];
        break;
      case 'sort_order':
      default:
        orderBy = [asc(tasks.sortOrder), asc(tasks.createdAt)];
        break;
    }

    // Fetch non-recurring tasks and recurring parents separately
    const [regularTasks, recurringParents] = await Promise.all([
      db.query.tasks.findMany({
        where: and(...conditions, isNull(tasks.rrule)),
        orderBy,
      }),
      db.query.tasks.findMany({
        where: and(
          eq(tasks.userId, userId),
          isNull(tasks.deletedAt),
          isNotNull(tasks.rrule),
          isNull(tasks.recurringTaskId),
        ),
        orderBy,
      }),
    ]);

    const allTasks = [...regularTasks, ...recurringParents];

    // Deduplicate by id
    const seen = new Set<string>();
    const deduped = allTasks.filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });

    return deduped.map((t) => toTaskResponse(t as TaskRow));
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
          description: data.description ?? null,
          dueAt: data.dueAt ? new Date(data.dueAt) : null,
          priority: data.priority ?? 'none',
          rrule: data.rrule ?? null,
          sortOrder: nextSortOrder,
        })
        .returning();

      // Create reminder if specified
      if (data.reminder && data.dueAt) {
        const triggerAt = new Date(
          new Date(data.dueAt).getTime() - data.reminder.minutesBefore * 60 * 1000,
        );

        await tx.insert(reminders).values({
          userId,
          itemType: 'task',
          itemId: inserted.id,
          minutesBefore: data.reminder.minutesBefore,
          method: data.reminder.method,
          triggerAt,
        });
      }

      return inserted;
    });

    // Enqueue BullMQ job for the inline reminder (outside transaction)
    if (data.reminder && data.dueAt) {
      const inlineReminder = await db.query.reminders.findFirst({
        where: and(
          eq(reminders.userId, userId),
          eq(reminders.itemId, task.id),
          eq(reminders.itemType, 'task'),
        ),
      });
      if (inlineReminder) {
        try {
          await reminderQueue.add(
            'send-reminder',
            {
              reminderId: inlineReminder.id,
              userId,
              itemType: 'task',
              itemId: task.id,
              method: inlineReminder.method,
            },
            {
              jobId: inlineReminder.id,
              delay: Math.max(0, inlineReminder.triggerAt.getTime() - Date.now()),
            },
          );
        } catch (err) {
          logger.warn(
            { err, reminderId: inlineReminder.id },
            'Failed to enqueue inline reminder job',
          );
        }
      }
    }

    logger.info({ userId, taskId: task.id }, 'Task created');

    return toTaskResponse(task as TaskRow);
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

    // Validate RRULE if provided
    if (data.rrule !== undefined && data.rrule !== null) {
      this.validateRrule(data.rrule);
    }

    const isRecurring = task.rrule !== null;

    // Non-recurring task or no scope specified: direct update
    if (!isRecurring || !scope) {
      return this.directUpdate(userId, taskId, data);
    }

    // Recurring task with scope
    switch (scope) {
      case 'instance':
        return this.updateInstance(userId, task as TaskRow, data, instanceDate);
      case 'following':
        return this.updateFollowing(userId, task as TaskRow, data, instanceDate);
      case 'all':
        return this.directUpdate(userId, taskId, data);
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

    return toTaskResponse(updated as TaskRow);
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

    logger.info({ userId, taskId }, 'Task updated');

    return toTaskResponse(updated as TaskRow);
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

    const result = await db.transaction(async (tx) => {
      // Add instance date to parent's exDates
      const currentExDates = (parentTask.exDates as Date[] | null) ?? [];
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
            data.dueAt !== undefined
              ? data.dueAt
                ? new Date(data.dueAt)
                : null
              : parentTask.dueAt,
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

    // Build UNTIL clause for the original series
    const untilDate = new Date(splitDate.getTime() - 1);
    const untilStr = untilDate
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');

    let updatedRrule = parentTask.rrule!;
    updatedRrule = updatedRrule.replace(/;?(UNTIL|COUNT)=[^;]*/g, '');
    updatedRrule += `;UNTIL=${untilStr}`;

    const result = await db.transaction(async (tx) => {
      // Update original series to end at UNTIL
      await tx
        .update(tasks)
        .set({ rrule: updatedRrule, updatedAt: new Date() })
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
          dueAt: data.dueAt !== undefined ? (data.dueAt ? new Date(data.dueAt) : null) : splitDate,
          priority: data.priority ?? parentTask.priority,
          status: data.status ?? parentTask.status,
          rrule: data.rrule !== undefined ? data.rrule : parentTask.rrule,
          sortOrder: parentTask.sortOrder,
        })
        .returning();

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

      const untilDate = new Date(splitDate.getTime() - 1);
      const untilStr = untilDate
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');
      let updatedRrule = parent.rrule;
      updatedRrule = updatedRrule.replace(/;?(UNTIL|COUNT)=[^;]*/g, '');
      updatedRrule += `;UNTIL=${untilStr}`;

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
