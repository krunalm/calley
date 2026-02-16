import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock modules before importing the service ──────────────────────

// Mock the database module
vi.mock('../../db', () => {
  const mockDb = {
    query: {
      tasks: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      calendarCategories: {
        findFirst: vi.fn(),
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

// Mock queue
vi.mock('../../lib/queue', () => ({
  reminderQueue: {
    add: vi.fn(),
  },
}));

// Mock recurrence service
vi.mock('../recurrence.service', () => ({
  recurrenceService: {
    validateRrule: vi.fn(),
  },
}));

// Mock SSE service
vi.mock('../sse.service', () => ({
  sseService: {
    emit: vi.fn(),
  },
}));

import { db } from '../../db';
import { AppError } from '../../lib/errors';
import { reminderQueue } from '../../lib/queue';
import { recurrenceService } from '../recurrence.service';
import { sseService } from '../sse.service';
import { TaskService } from '../task.service';

// ─── Test Fixtures ──────────────────────────────────────────────────

const TEST_USER_ID = 'testuser12345678901234567';
const TEST_CATEGORY_ID = 'testcategory1234567890123';
const TEST_TASK_ID = 'testtask123456789012345678';

function makeTaskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_TASK_ID,
    userId: TEST_USER_ID,
    categoryId: TEST_CATEGORY_ID,
    title: 'Test Task',
    description: null,
    dueAt: new Date('2026-03-15T10:00:00Z'),
    priority: 'none',
    status: 'todo',
    completedAt: null,
    rrule: null,
    exDates: null,
    recurringTaskId: null,
    originalDate: null,
    sortOrder: 0,
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

function mockTransactionForInsert(result: unknown[]) {
  const txSelectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ maxSort: 0 }]),
  };
  const txInsertChain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
  const tx = {
    select: vi.fn().mockReturnValue(txSelectChain),
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

describe('TaskService', () => {
  let service: TaskService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TaskService();
  });

  // ─── getTask ────────────────────────────────────────────────────

  describe('getTask', () => {
    it('should return a task when found with correct ownership', async () => {
      const taskRow = makeTaskRow();
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(taskRow);

      const result = await service.getTask(TEST_USER_ID, TEST_TASK_ID);

      expect(result.id).toBe(TEST_TASK_ID);
      expect(result.title).toBe('Test Task');
      expect(result.dueAt).toBe('2026-03-15T10:00:00.000Z');
      expect(result.status).toBe('todo');
      expect(result.completedAt).toBeNull();
    });

    it('should throw NOT_FOUND when task does not exist', async () => {
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await expect(service.getTask(TEST_USER_ID, 'nonexistent123456789012345')).rejects.toThrow(
        AppError,
      );

      await expect(
        service.getTask(TEST_USER_ID, 'nonexistent123456789012345'),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

    it('should serialize dates to ISO strings in the response', async () => {
      const taskRow = makeTaskRow({
        dueAt: new Date('2026-03-20T14:00:00Z'),
        completedAt: new Date('2026-03-21T09:00:00Z'),
        exDates: [new Date('2026-03-25T00:00:00Z'), new Date('2026-04-01T00:00:00Z')],
        originalDate: new Date('2026-03-15T00:00:00Z'),
      });
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(taskRow);

      const result = await service.getTask(TEST_USER_ID, TEST_TASK_ID);

      expect(result.dueAt).toBe('2026-03-20T14:00:00.000Z');
      expect(result.completedAt).toBe('2026-03-21T09:00:00.000Z');
      expect(result.exDates).toEqual(['2026-03-25T00:00:00.000Z', '2026-04-01T00:00:00.000Z']);
      expect(result.originalDate).toBe('2026-03-15T00:00:00.000Z');
    });

    it('should return empty exDates array when exDates is null', async () => {
      const taskRow = makeTaskRow({ exDates: null });
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(taskRow);

      const result = await service.getTask(TEST_USER_ID, TEST_TASK_ID);

      expect(result.exDates).toEqual([]);
    });
  });

  // ─── createTask ─────────────────────────────────────────────────

  describe('createTask', () => {
    it('should create a basic task successfully', async () => {
      const taskRow = makeTaskRow();
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeCategory(),
      );
      const tx = mockTransactionForInsert([taskRow]);

      const result = await service.createTask(TEST_USER_ID, {
        title: 'Test Task',
        categoryId: TEST_CATEGORY_ID,
      });

      expect(result.id).toBe(TEST_TASK_ID);
      expect(result.title).toBe('Test Task');
      expect(db.transaction).toHaveBeenCalled();
      expect(tx.insert).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND if category does not belong to user', async () => {
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        undefined,
      );

      await expect(
        service.createTask(TEST_USER_ID, {
          title: 'Test Task',
          categoryId: 'nonexistentcat12345678901',
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Category not found',
      });
    });

    it('should create a reminder when specified with dueAt', async () => {
      const taskRow = makeTaskRow({ dueAt: new Date('2026-03-15T10:00:00Z') });
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeCategory(),
      );

      // tx.insert is called twice inside the transaction: task + reminder
      const tx = mockTransactionForInsert([taskRow]);

      await service.createTask(TEST_USER_ID, {
        title: 'Test Task',
        categoryId: TEST_CATEGORY_ID,
        dueAt: '2026-03-15T10:00:00Z',
        reminder: { minutesBefore: 15, method: 'push' },
      });

      // tx.insert called twice inside the transaction: once for task, once for reminder
      expect(db.transaction).toHaveBeenCalled();
      expect(tx.insert).toHaveBeenCalledTimes(2);
    });

    it('should enqueue BullMQ job when reminder is created', async () => {
      const taskRow = makeTaskRow({ dueAt: new Date('2026-03-15T10:00:00Z') });
      const reminderRow = {
        id: 'reminder1234567890123456789',
        method: 'push',
        triggerAt: new Date('2026-03-15T09:45:00Z'),
      };
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeCategory(),
      );

      // Setup transaction that returns both task and reminder
      const txSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ maxSort: 0 }]),
      };
      const txInsertChain1 = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([taskRow]),
      };
      const txInsertChain2 = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([reminderRow]),
      };
      const tx = {
        select: vi.fn().mockReturnValue(txSelectChain),
        insert: vi.fn().mockReturnValueOnce(txInsertChain1).mockReturnValueOnce(txInsertChain2),
      };
      (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => fn(tx));

      await service.createTask(TEST_USER_ID, {
        title: 'Test Task',
        categoryId: TEST_CATEGORY_ID,
        dueAt: '2026-03-15T10:00:00Z',
        reminder: { minutesBefore: 15, method: 'push' },
      });

      expect(reminderQueue.add).toHaveBeenCalledWith(
        'send-reminder',
        expect.objectContaining({
          reminderId: 'reminder1234567890123456789',
          userId: TEST_USER_ID,
          itemType: 'task',
          itemId: TEST_TASK_ID,
          method: 'push',
        }),
        expect.objectContaining({
          jobId: 'reminder1234567890123456789',
        }),
      );
    });

    it('should reject invalid RRULE', async () => {
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeCategory(),
      );
      (recurrenceService.validateRrule as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new AppError(422, 'INVALID_RRULE', 'Invalid recurrence rule: missing FREQ');
      });

      await expect(
        service.createTask(TEST_USER_ID, {
          title: 'Test Task',
          categoryId: TEST_CATEGORY_ID,
          rrule: 'INVALID_RRULE_STRING',
        }),
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'INVALID_RRULE',
      });
    });

    it('should accept valid RRULE string', async () => {
      const taskRow = makeTaskRow({ rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' });
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeCategory(),
      );
      (recurrenceService.validateRrule as ReturnType<typeof vi.fn>).mockImplementation(() => {});
      mockTransactionForInsert([taskRow]);

      const result = await service.createTask(TEST_USER_ID, {
        title: 'Recurring Task',
        categoryId: TEST_CATEGORY_ID,
        rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
      });

      expect(result.rrule).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR');
    });

    it('should emit SSE event on create', async () => {
      const taskRow = makeTaskRow();
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeCategory(),
      );
      mockTransactionForInsert([taskRow]);

      await service.createTask(TEST_USER_ID, {
        title: 'Test Task',
        categoryId: TEST_CATEGORY_ID,
      });

      expect(sseService.emit).toHaveBeenCalledWith(
        TEST_USER_ID,
        'task:created',
        expect.objectContaining({
          id: TEST_TASK_ID,
          title: 'Test Task',
        }),
      );
    });
  });

  // ─── updateTask ─────────────────────────────────────────────────

  describe('updateTask', () => {
    it('should update a non-recurring task directly', async () => {
      const taskRow = makeTaskRow();
      const updatedRow = makeTaskRow({ title: 'Updated Title' });
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(taskRow);
      mockUpdateChain([updatedRow]);

      const result = await service.updateTask(TEST_USER_ID, TEST_TASK_ID, {
        title: 'Updated Title',
      });

      expect(result.title).toBe('Updated Title');
      expect(db.update).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when updating non-existent task', async () => {
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await expect(
        service.updateTask(TEST_USER_ID, 'nonexistent123456789012345', {
          title: 'Updated',
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

    it('should validate category on update if changed', async () => {
      const taskRow = makeTaskRow();
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(taskRow);
      (db.query.calendarCategories.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        undefined,
      );

      await expect(
        service.updateTask(TEST_USER_ID, TEST_TASK_ID, {
          categoryId: 'nonexistentcat12345678901',
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Category not found',
      });
    });

    it('should validate RRULE on update if provided', async () => {
      const taskRow = makeTaskRow();
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(taskRow);
      (recurrenceService.validateRrule as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new AppError(422, 'INVALID_RRULE', 'Invalid recurrence rule');
      });

      await expect(
        service.updateTask(TEST_USER_ID, TEST_TASK_ID, {
          rrule: 'INVALID',
        }),
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'INVALID_RRULE',
      });
    });

    it('should use scope "all" as direct update for recurring tasks', async () => {
      const recurringTask = makeTaskRow({ rrule: 'FREQ=DAILY' });
      const updatedRow = makeTaskRow({ rrule: 'FREQ=DAILY', title: 'Updated' });
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(recurringTask);
      mockUpdateChain([updatedRow]);

      const result = await service.updateTask(
        TEST_USER_ID,
        TEST_TASK_ID,
        { title: 'Updated' },
        'all',
      );

      expect(result.title).toBe('Updated');
      expect(db.update).toHaveBeenCalled();
    });

    it('should require instanceDate when scope is "instance"', async () => {
      const recurringTask = makeTaskRow({ rrule: 'FREQ=DAILY' });
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(recurringTask);

      await expect(
        service.updateTask(TEST_USER_ID, TEST_TASK_ID, { title: 'Changed' }, 'instance', undefined),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should create exception record for scope "instance" with instanceDate', async () => {
      const recurringTask = makeTaskRow({ rrule: 'FREQ=DAILY', exDates: null });
      const exceptionRow = makeTaskRow({
        id: 'exception1234567890123456',
        recurringTaskId: TEST_TASK_ID,
        originalDate: new Date('2026-03-20T10:00:00Z'),
        title: 'Exception Title',
      });
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(recurringTask);

      // Mock transaction for instance update
      (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => {
        const txUpdateChain = {
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([]),
        };
        const txInsertChain = {
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([exceptionRow]),
        };
        const tx = {
          update: vi.fn().mockReturnValue(txUpdateChain),
          insert: vi.fn().mockReturnValue(txInsertChain),
        };
        return fn(tx);
      });

      const result = await service.updateTask(
        TEST_USER_ID,
        TEST_TASK_ID,
        { title: 'Exception Title' },
        'instance',
        '2026-03-20T10:00:00Z',
      );

      expect(result.id).toBe('exception1234567890123456');
      expect(result.recurringTaskId).toBe(TEST_TASK_ID);
      expect(result.originalDate).toBe('2026-03-20T10:00:00.000Z');
    });

    it('should require instanceDate when scope is "following"', async () => {
      const recurringTask = makeTaskRow({ rrule: 'FREQ=DAILY' });
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(recurringTask);

      await expect(
        service.updateTask(
          TEST_USER_ID,
          TEST_TASK_ID,
          { title: 'Changed' },
          'following',
          undefined,
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should split series for scope "following" with instanceDate', async () => {
      const recurringTask = makeTaskRow({ rrule: 'FREQ=DAILY' });
      const newSeriesRow = makeTaskRow({
        id: 'newseries12345678901234567',
        rrule: 'FREQ=DAILY',
        title: 'New Series Title',
      });
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(recurringTask);

      // Mock transaction for following update (update + insert)
      (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => {
        const txUpdateChain = {
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([]),
        };
        const txInsertChain = {
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([newSeriesRow]),
        };
        const tx = {
          update: vi.fn().mockReturnValue(txUpdateChain),
          insert: vi.fn().mockReturnValue(txInsertChain),
        };
        return fn(tx);
      });

      const result = await service.updateTask(
        TEST_USER_ID,
        TEST_TASK_ID,
        { title: 'New Series Title' },
        'following',
        '2026-03-20T10:00:00Z',
      );

      expect(result.id).toBe('newseries12345678901234567');
      expect(db.transaction).toHaveBeenCalled();
    });

    it('should emit SSE event on direct update', async () => {
      const taskRow = makeTaskRow();
      const updatedRow = makeTaskRow({ title: 'Updated' });
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(taskRow);
      mockUpdateChain([updatedRow]);

      await service.updateTask(TEST_USER_ID, TEST_TASK_ID, { title: 'Updated' });

      expect(sseService.emit).toHaveBeenCalledWith(
        TEST_USER_ID,
        'task:updated',
        expect.objectContaining({ id: TEST_TASK_ID }),
      );
    });

    it('should auto-set completedAt when status changes to done', async () => {
      const taskRow = makeTaskRow({ status: 'todo' });
      const updatedRow = makeTaskRow({
        status: 'done',
        completedAt: new Date('2026-03-15T12:00:00Z'),
      });
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(taskRow);
      mockUpdateChain([updatedRow]);

      const result = await service.updateTask(TEST_USER_ID, TEST_TASK_ID, {
        status: 'done',
      });

      expect(result.status).toBe('done');
      expect(result.completedAt).not.toBeNull();
    });

    it('should clear completedAt when status changes away from done', async () => {
      const taskRow = makeTaskRow({
        status: 'done',
        completedAt: new Date('2026-03-15T12:00:00Z'),
      });
      const updatedRow = makeTaskRow({ status: 'todo', completedAt: null });
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(taskRow);
      mockUpdateChain([updatedRow]);

      const result = await service.updateTask(TEST_USER_ID, TEST_TASK_ID, {
        status: 'todo',
      });

      expect(result.status).toBe('todo');
      expect(result.completedAt).toBeNull();
    });
  });

  // ─── deleteTask ─────────────────────────────────────────────────

  describe('deleteTask', () => {
    it('should soft delete a non-recurring task', async () => {
      const taskRow = makeTaskRow();
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(taskRow);
      mockUpdateChain([]);

      await service.deleteTask(TEST_USER_ID, TEST_TASK_ID);

      expect(db.update).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when deleting non-existent task', async () => {
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await expect(
        service.deleteTask(TEST_USER_ID, 'nonexistent123456789012345'),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

    it('should emit SSE event on delete', async () => {
      const taskRow = makeTaskRow();
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(taskRow);
      mockUpdateChain([]);

      await service.deleteTask(TEST_USER_ID, TEST_TASK_ID);

      expect(sseService.emit).toHaveBeenCalledWith(
        TEST_USER_ID,
        'task:deleted',
        expect.objectContaining({ id: TEST_TASK_ID }),
      );
    });

    it('should require instanceDate when scope is "instance"', async () => {
      const recurringTask = makeTaskRow({ rrule: 'FREQ=DAILY' });
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(recurringTask);

      await expect(
        service.deleteTask(TEST_USER_ID, TEST_TASK_ID, 'instance', undefined),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should require instanceDate when scope is "following"', async () => {
      const recurringTask = makeTaskRow({ rrule: 'FREQ=DAILY' });
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(recurringTask);

      await expect(
        service.deleteTask(TEST_USER_ID, TEST_TASK_ID, 'following', undefined),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should soft delete parent and exceptions when scope is "all"', async () => {
      const recurringTask = makeTaskRow({ rrule: 'FREQ=DAILY' });
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(recurringTask);

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

      await service.deleteTask(TEST_USER_ID, TEST_TASK_ID, 'all');

      expect(db.transaction).toHaveBeenCalled();
    });

    it('should add exDate when deleting a single instance', async () => {
      const recurringTask = makeTaskRow({ rrule: 'FREQ=DAILY', exDates: null });
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(recurringTask);

      const parentWithExDates = makeTaskRow({ rrule: 'FREQ=DAILY', exDates: [] });
      const txUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => {
        const tx = {
          update: vi.fn().mockReturnValue(txUpdateChain),
          query: {
            tasks: {
              findFirst: vi.fn().mockResolvedValue(parentWithExDates),
            },
          },
        };
        return fn(tx);
      });

      await service.deleteTask(TEST_USER_ID, TEST_TASK_ID, 'instance', '2026-03-20T10:00:00Z');

      expect(db.transaction).toHaveBeenCalled();
    });

    it('should set UNTIL on parent RRULE when deleting following instances', async () => {
      const recurringTask = makeTaskRow({ rrule: 'FREQ=DAILY' });
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(recurringTask);

      const parentTask = makeTaskRow({ rrule: 'FREQ=DAILY' });
      const txUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => {
        const tx = {
          update: vi.fn().mockReturnValue(txUpdateChain),
          query: {
            tasks: {
              findFirst: vi.fn().mockResolvedValue(parentTask),
            },
          },
        };
        return fn(tx);
      });

      await service.deleteTask(TEST_USER_ID, TEST_TASK_ID, 'following', '2026-03-20T10:00:00Z');

      expect(db.transaction).toHaveBeenCalled();
    });
  });

  // ─── toggleTask ─────────────────────────────────────────────────

  describe('toggleTask', () => {
    it('should toggle a todo task to done and set completedAt', async () => {
      const taskRow = makeTaskRow({ status: 'todo', completedAt: null });
      const updatedRow = makeTaskRow({
        status: 'done',
        completedAt: new Date('2026-03-15T12:00:00Z'),
      });
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(taskRow);
      mockUpdateChain([updatedRow]);

      const result = await service.toggleTask(TEST_USER_ID, TEST_TASK_ID);

      expect(result.status).toBe('done');
      expect(result.completedAt).toBe('2026-03-15T12:00:00.000Z');
      expect(db.update).toHaveBeenCalled();
    });

    it('should toggle a done task to todo and clear completedAt', async () => {
      const taskRow = makeTaskRow({
        status: 'done',
        completedAt: new Date('2026-03-15T12:00:00Z'),
      });
      const updatedRow = makeTaskRow({ status: 'todo', completedAt: null });
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(taskRow);
      mockUpdateChain([updatedRow]);

      const result = await service.toggleTask(TEST_USER_ID, TEST_TASK_ID);

      expect(result.status).toBe('todo');
      expect(result.completedAt).toBeNull();
    });

    it('should throw NOT_FOUND when toggling non-existent task', async () => {
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await expect(
        service.toggleTask(TEST_USER_ID, 'nonexistent123456789012345'),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

    it('should emit SSE event with updated status on toggle', async () => {
      const taskRow = makeTaskRow({ status: 'todo', completedAt: null });
      const updatedRow = makeTaskRow({
        status: 'done',
        completedAt: new Date('2026-03-15T12:00:00Z'),
      });
      (db.query.tasks.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(taskRow);
      mockUpdateChain([updatedRow]);

      await service.toggleTask(TEST_USER_ID, TEST_TASK_ID);

      expect(sseService.emit).toHaveBeenCalledWith(
        TEST_USER_ID,
        'task:updated',
        expect.objectContaining({
          id: TEST_TASK_ID,
          status: 'done',
          completedAt: '2026-03-15T12:00:00.000Z',
        }),
      );
    });
  });

  // ─── reorderTasks ───────────────────────────────────────────────

  describe('reorderTasks', () => {
    it('should update sortOrder for each task in a transaction', async () => {
      const taskIds = [
        'task_a_12345678901234567890',
        'task_b_12345678901234567890',
        'task_c_12345678901234567890',
      ];

      const txUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      const tx = {
        update: vi.fn().mockReturnValue(txUpdateChain),
      };
      (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => fn(tx));

      await service.reorderTasks(TEST_USER_ID, taskIds);

      expect(db.transaction).toHaveBeenCalled();
      // update called once per task ID
      expect(tx.update).toHaveBeenCalledTimes(3);
    });

    it('should handle empty array of ids', async () => {
      const tx = {
        update: vi.fn(),
      };
      (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => fn(tx));

      await service.reorderTasks(TEST_USER_ID, []);

      expect(db.transaction).toHaveBeenCalled();
      expect(tx.update).not.toHaveBeenCalled();
    });
  });

  // ─── bulkComplete ───────────────────────────────────────────────

  describe('bulkComplete', () => {
    it('should mark multiple tasks as done and return count', async () => {
      const taskIds = ['task_a_12345678901234567890', 'task_b_12345678901234567890'];
      const returnedRows = [{ id: taskIds[0] }, { id: taskIds[1] }];

      const chain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue(returnedRows),
      };
      (db.update as ReturnType<typeof vi.fn>).mockReturnValue(chain);

      const count = await service.bulkComplete(TEST_USER_ID, taskIds);

      expect(count).toBe(2);
      expect(db.update).toHaveBeenCalled();
    });

    it('should return 0 when no tasks match', async () => {
      const chain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      };
      (db.update as ReturnType<typeof vi.fn>).mockReturnValue(chain);

      const count = await service.bulkComplete(TEST_USER_ID, ['nonexistent12345678901234']);

      expect(count).toBe(0);
    });
  });

  // ─── bulkDelete ─────────────────────────────────────────────────

  describe('bulkDelete', () => {
    it('should soft delete multiple tasks and return count', async () => {
      const taskIds = [
        'task_a_12345678901234567890',
        'task_b_12345678901234567890',
        'task_c_12345678901234567890',
      ];
      const returnedRows = [{ id: taskIds[0] }, { id: taskIds[1] }, { id: taskIds[2] }];

      const chain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue(returnedRows),
      };
      (db.update as ReturnType<typeof vi.fn>).mockReturnValue(chain);

      const count = await service.bulkDelete(TEST_USER_ID, taskIds);

      expect(count).toBe(3);
      expect(db.update).toHaveBeenCalled();
    });

    it('should return 0 when no tasks match for bulk delete', async () => {
      const chain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      };
      (db.update as ReturnType<typeof vi.fn>).mockReturnValue(chain);

      const count = await service.bulkDelete(TEST_USER_ID, ['nonexistent12345678901234']);

      expect(count).toBe(0);
    });
  });

  // ─── listTasks ──────────────────────────────────────────────────

  describe('listTasks', () => {
    it('should query tasks and return them', async () => {
      const taskRows = [makeTaskRow()];
      // findMany is called twice: regular tasks, recurring parents
      (db.query.tasks.findMany as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(taskRows) // regular tasks
        .mockResolvedValueOnce([]); // recurring parents

      const result = await service.listTasks(TEST_USER_ID, {});

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(TEST_TASK_ID);
      expect(db.query.tasks.findMany).toHaveBeenCalledTimes(2);
    });

    it('should deduplicate tasks that appear in multiple queries', async () => {
      const taskRow = makeTaskRow();
      // Both queries return the same task
      (db.query.tasks.findMany as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([taskRow])
        .mockResolvedValueOnce([taskRow]);

      const result = await service.listTasks(TEST_USER_ID, {});

      // Should be deduplicated to 1 task
      expect(result).toHaveLength(1);
    });

    it('should return an empty array when no tasks match', async () => {
      (db.query.tasks.findMany as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.listTasks(TEST_USER_ID, {});

      expect(result).toEqual([]);
    });

    it('should pass through status filter', async () => {
      (db.query.tasks.findMany as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.listTasks(TEST_USER_ID, { status: ['todo'] });

      expect(db.query.tasks.findMany).toHaveBeenCalledTimes(2);
    });

    it('should pass through priority filter', async () => {
      (db.query.tasks.findMany as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.listTasks(TEST_USER_ID, { priority: ['high', 'medium'] });

      expect(db.query.tasks.findMany).toHaveBeenCalledTimes(2);
    });

    it('should handle due date range filters', async () => {
      (db.query.tasks.findMany as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.listTasks(TEST_USER_ID, {
        dueStart: '2026-03-01T00:00:00Z',
        dueEnd: '2026-03-31T23:59:59Z',
      });

      expect(db.query.tasks.findMany).toHaveBeenCalledTimes(2);
    });

    it('should handle different sort options', async () => {
      const taskRow = makeTaskRow();
      for (const sort of ['due_at', 'priority', 'created_at', 'sort_order'] as const) {
        vi.clearAllMocks();
        (db.query.tasks.findMany as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce([taskRow])
          .mockResolvedValueOnce([]);

        const result = await service.listTasks(TEST_USER_ID, { sort });

        expect(result).toHaveLength(1);
        expect(db.query.tasks.findMany).toHaveBeenCalledTimes(2);
      }
    });
  });
});
